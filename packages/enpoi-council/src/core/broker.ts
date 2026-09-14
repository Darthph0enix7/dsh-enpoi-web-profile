/**
 * Evidence Broker — the errand boy's door (doc 54 §6, §13 amendments 2–4).
 *
 * Seats embed NEED_EVIDENCE lines in their turn output (text protocol — no
 * child-scope tool registration needed):
 *     NEED_EVIDENCE(target: <area>, question: <what to verify>)
 * The engine extracts them, dedupes against the queue and the vault, and at
 * the epoch boundary dispatches research children (explorer for codebase
 * targets, librarian for external ones) IN PARALLEL. Fact sheets (≤200 tokens,
 * cited) commit to the vault BEFORE the referee pass runs (amendment #3).
 */
import type { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createHash } from 'node:crypto'
import {
  BROKER_KEPT_TOOLS,
  COUNCIL_DENIED_TOOLS,
  councilDiag,
  disposeSeatFibers,
  estimateTokens,
  followupSeatFiber,
  startSeatFiber,
  waitForSeatTurn,
} from './fiber.ts'
import type { EvidenceVault } from './vault.ts'

export interface EvidenceRequest {
  ticket: string
  seatId: string
  target: string
  question: string
  epoch: number
}

/** Extract NEED_EVIDENCE lines from a seat turn. Tolerant to formatting drift. */
export function extractEvidenceRequests(seatId: string, epoch: number, turnText: string): EvidenceRequest[] {
  const out: EvidenceRequest[] = []
  const strip = (v: string) => v.trim().replace(/^[`"'(\s]+/, '').replace(/[`"')\s.,;]+$/, '').trim()
  for (const rawLine of turnText.split(/\n/)) {
    const m = rawLine.match(/NEED_EVIDENCE\s*\(?\s*target\s*[:=]\s*(.+?)\s*,\s*question\s*[:=]\s*(.+)$/i)
    if (m === null) continue
    const target = strip(m[1])
    const question = strip(m[2])
    if (target.length === 0 || question.length === 0) continue
    out.push({ ticket: fpTicket(target, question), seatId, target, question, epoch })
  }
  return out
}

function fpTicket(target: string, question: string): string {
  return 'EV-' + createHash('sha256').update(`${target}::${question}`.toLowerCase()).digest('hex').slice(0, 8)
}

/** Queue with per-run dedupe (same target+question from any seat = one dispatch). */
export class EvidenceQueue {
  private readonly pending = new Map<string, EvidenceRequest>()

  push(reqs: EvidenceRequest[], vault: EvidenceVault): EvidenceRequest[] {
    const added: EvidenceRequest[] = []
    for (const req of reqs) {
      if (this.pending.has(req.ticket)) continue
      // Vault already answered this exact question earlier in the run.
      if (vault.all().some(e => e.question.toLowerCase() === req.question.toLowerCase() && e.supersededBy === null)) continue
      this.pending.set(req.ticket, req)
      added.push(req)
    }
    return added
  }

  drain(): EvidenceRequest[] {
    const all = [...this.pending.values()]
    this.pending.clear()
    return all
  }

  get size(): number {
    return this.pending.size
  }
}

const BROKER_PERSONA = [
  'You are the Council Evidence Broker — a precision research assistant serving a high-stakes deliberation.',
  'You answer EXACTLY the questions asked, from the codebase (read/glob/grep) or the web (web_search/web_fetch), and nothing else.',
  'You may receive MULTIPLE questions. Answer each in order, one FACT SHEET per question, in this exact format:',
  'SHEET 1',
  'CITATION: the ACTUAL file path with line number, or the exact URL you read. Never a placeholder, never a template — a real path you personally opened.',
  'FACTS: the answer, maximum 150 words, only what the question asked.',
  'CONFIDENCE: high | medium | low — one word',
  'SHEET 2',
  '...',
  'Never speculate. If an answer is not findable, its FACTS say "NOT FINDABLE" and the CITATION shows the closest place you looked.',
  'The run_code tool is non-functional in this deployment — never call it.',
].join('\n')

function isExternalTarget(target: string): boolean {
  return /\b(web|http|npm|docs?|library|libraries|package|registry|external|api)\b/i.test(target)
}

export interface BrokerResult {
  sheets: number
  errors: string[]
}

/**
 * Service the queue: one research child PER REQUEST, in parallel (they are
 * independent), fact sheets into the vault. Runs at the epoch boundary,
 * before the referee (amendment #3).
 */
export async function serviceEvidenceQueue(
  ctx: Context,
  parent: Agent,
  queue: EvidenceRequest[],
  vault: EvidenceVault,
  epoch: number,
  signal: AbortSignal,
  timeoutMs: number,
): Promise<BrokerResult> {
  if (queue.length === 0) return { sheets: 0, errors: [] }
  const errors: string[] = []
  councilDiag(`[broker] servicing ${queue.length} evidence request(s) at epoch ${epoch} (batched: one child)`)

  // Batch mode: ONE research child answers the whole queue (one session per
  // epoch instead of one per question — shared research context, fewer spawns).
  const hasExternal = queue.some(req => isExternalTarget(req.target))
  const retrievedBy = hasExternal ? 'librarian' as const : 'explorer' as const
  const prompt = [
    `Answer ${queue.length} question${queue.length > 1 ? 's' : ''}. One FACT SHEET per question, numbered in order (SHEET 1 … SHEET ${queue.length}).`,
    ...queue.map((req, i) => `SHEET ${i + 1} — TARGET: ${req.target} — QUESTION: ${req.question}`),
    'Produce the fact sheets now.',
  ].join('\n\n')

  let fiber: { childId: string } | undefined
  try {
    fiber = await startSeatFiber(ctx, parent, {
      seatId: retrievedBy,
      label: queue.length === 1 ? `council broker: ${queue[0].ticket}` : `council broker: ${queue.length} questions (epoch ${epoch})`,
      persona: BROKER_PERSONA,
      initialPrompt: prompt,
      // Broker keeps the research surface; everything else stays denied.
      denyTools: COUNCIL_DENIED_TOOLS.filter(t => !(BROKER_KEPT_TOOLS as readonly string[]).includes(t)),
    }, signal)
    const text = await waitForSeatTurn(ctx, fiber.childId, signal, timeoutMs)
    const parsed = parseFactSheets(text)
    let committed = 0
    for (let i = 0; i < queue.length; i++) {
      const sheet = parsed[i]
      if (sheet === undefined) {
        errors.push(`${queue[i].ticket}: no fact sheet returned`)
        councilDiag(`[broker] ${queue[i].ticket} FAILED: missing sheet ${i + 1}`)
        continue
      }
      vault.add({
        citation: sheet.citation,
        question: queue[i].question,
        factSheet: `${sheet.facts}\nCONFIDENCE: ${sheet.confidence}`,
        addedEpoch: epoch,
        retrievedBy,
      })
      committed += 1
      councilDiag(`[broker] ${queue[i].ticket} satisfied via ${retrievedBy} (${sheet.citation})`)
    }
    return { sheets: committed, errors }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    for (const req of queue) errors.push(`${req.ticket}: ${msg}`)
    councilDiag(`[broker] batch FAILED: ${msg}`)
    return { sheets: 0, errors }
  } finally {
    if (fiber !== undefined) {
      try { await disposeSeatFibers(ctx, [fiber]) } catch { /* best effort */ }
    }
  }
}

/** Parse ONE fact sheet (single-question responses). */
export function parseFactSheet(text: string): { citation: string; facts: string; confidence: string } | null {
  return parseFactSheets(text)[0] ?? null
}

/** Parse a (possibly multi-sheet) broker response into ordered fact sheets. */
export function parseFactSheets(text: string): Array<{ citation: string; facts: string; confidence: string }> {
  // Tolerate markdown bolding (**CITATION:** etc.) before matching.
  const plain = text.replace(/\*\*/g, '')
  // Each sheet starts at its CITATION line; split there and parse in order.
  const parts = plain.split(/(?=CITATION\s*[:=])/i).filter(p => /CITATION\s*[:=]/i.test(p))
  const sheets: Array<{ citation: string; facts: string; confidence: string }> = []
  for (const part of parts) {
    const sheet = parseOneSheet(part)
    if (sheet !== null) sheets.push(sheet)
  }
  return sheets
}

function parseOneSheet(text: string): { citation: string; facts: string; confidence: string } | null {
  const plain = text.replace(/\*\*/g, '')
  const rawCitation = plain.match(/CITATION\s*[:=]\s*(.+)/i)?.[1]?.trim()
  const facts = plain.match(/FACTS\s*[:=]\s*([\s\S]*?)(?:CONFIDENCE\s*[:=]|$)/i)?.[1]?.trim()
  const confidence = plain.match(/CONFIDENCE\s*[:=]\s*(high|medium|low)/i)?.[1]?.toLowerCase()
  if (!rawCitation || !facts) return null
  // Placeholder citations (the model echoed the template) degrade to explicit
  // unverified instead of poisoning the vault with fake precision.
  const placeholder = /<file:line|url\s*—|— exact>|your citation/i.test(rawCitation)
  const citation = placeholder ? 'unverified (broker echoed template)' : rawCitation
  return { citation, facts, confidence: placeholder ? 'low' : (confidence ?? 'medium') }
}

/** Unused import guard: followupSeatFiber is reserved for broker re-queries (v2). */
void followupSeatFiber
