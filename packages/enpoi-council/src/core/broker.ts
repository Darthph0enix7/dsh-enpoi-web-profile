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
  'You answer EXACTLY the question asked, from the codebase (read/glob/grep) or the web (web_search/web_fetch), and nothing else.',
  'Output format — a FACT SHEET and nothing more:',
  'CITATION: the ACTUAL file path with line number, or the exact URL you read. Never a placeholder, never a template — a real path you personally opened.',
  'FACTS: the answer, maximum 150 words, only what the question asked.',
  'CONFIDENCE: high | medium | low — one word',
  'Never speculate. If the answer is not findable, say "NOT FINDABLE" and show the closest citation.',
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
  councilDiag(`[broker] servicing ${queue.length} evidence request(s) at epoch ${epoch}`)

  const tasks = queue.map(async (req): Promise<void> => {
    const retrievedBy = isExternalTarget(req.target) ? 'librarian' : 'explorer'
    const prompt = [
      `TARGET: ${req.target}`,
      `QUESTION: ${req.question}`,
      'Produce the FACT SHEET now.',
    ].join('\n')
    let fiber: { childId: string } | undefined
    try {
      fiber = await startSeatFiber(ctx, parent, {
        seatId: retrievedBy,
        label: `council broker: ${req.ticket}`,
        persona: BROKER_PERSONA,
        initialPrompt: prompt,
        // Broker keeps the research surface; everything else stays denied.
        denyTools: COUNCIL_DENIED_TOOLS.filter(t => !(BROKER_KEPT_TOOLS as readonly string[]).includes(t)),
      }, signal)
      const text = await waitForSeatTurn(ctx, fiber.childId, signal, timeoutMs)
      const parsed = parseFactSheet(text)
      const tokens = estimateTokens(text)
      void tokens
      if (parsed === null) {
        errors.push(`${req.ticket}: unparseable fact sheet`)
        return
      }
      vault.add({
        citation: parsed.citation,
        question: req.question,
        factSheet: `${parsed.facts}\nCONFIDENCE: ${parsed.confidence}`,
        addedEpoch: epoch,
        retrievedBy,
      })
      councilDiag(`[broker] ${req.ticket} satisfied via ${retrievedBy} (${parsed.citation})`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${req.ticket}: ${msg}`)
      councilDiag(`[broker] ${req.ticket} FAILED: ${msg}`)
    } finally {
      if (fiber !== undefined) {
        try { await disposeSeatFibers(ctx, [fiber]) } catch { /* best effort */ }
      }
    }
  })

  await Promise.allSettled(tasks)
  return { sheets: vault.since(epoch).length, errors }
}

export function parseFactSheet(text: string): { citation: string; facts: string; confidence: string } | null {
  // Tolerate markdown bolding (**CITATION:** etc.) before matching.
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
