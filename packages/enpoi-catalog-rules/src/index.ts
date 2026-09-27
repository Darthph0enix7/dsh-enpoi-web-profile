/**
 * enpoi-catalog-rules — dynamic rule/filter engine for the model catalogue.
 *
 * Reads `enpoi-orchestration.catalogRules` (rules as data, versioned and
 * operator-editable) and the synced `llm-pi-ai` catalogue, then provides the
 * `catalogRules` service other plugins and UI surfaces resolve through:
 *
 *   ctx.get('catalogRules').visibility()             // every decision + warnings
 *   ctx.get('catalogRules').decide(provider, model)  // picker fast path
 *   ctx.get('catalogRules').expandSelector(selector) // group selector → links
 *   ctx.get('catalogRules').previewRulesChange(raw)  // before/after edit diff
 *
 * Rules are evaluated fresh on every settings update; the engine never writes
 * settings and never deletes catalogue entries (hide ≠ delete). All warnings
 * go to stderr — this harness's logger drops info/warn, so stderr is the
 * observable channel.
 */

import type { Context } from '@deepseek-ai/cordis'
import { readOrchestrationDocument, type SettingsDocumentReader } from 'dsh-enpoi-contracts'
import {
  diffRules, evaluateVisibility, isGated, isRecord, parseRulesDocument, resolvePrivacy, withHiddenPins,
  type CatalogEntry, type ParsedRules, type RulesDiff, type VisibilityDecision, type VisibilityReport,
} from './rules.ts'
import { expandSelector, parseGroupSelector, type GroupSelector, type SelectorExpansion } from './selectors.ts'
import { readCatalogue } from './catalogue.ts'

export const name = 'enpoi-catalog-rules'

/** The settings service must be up before the namespace can be read. */
export const inject = ['settings']

/** Namespace that owns `catalogRules` (declared by enpoi-capabilities). */
const ORCH_NS = 'enpoi-orchestration'

/** The service contract consumers call through `ctx.get('catalogRules')`. */
export interface CatalogRulesService {
  /** Evaluate every catalogue entry against the current rules document. */
  visibility(): VisibilityReport
  /** Decide one entry; undefined when the catalogue does not carry it. */
  decide(provider: string, modelId: string): VisibilityDecision | undefined
  /** Expand one group selector against the live catalogue (best-first). */
  expandSelector(selector: GroupSelector): SelectorExpansion
  /** Parse and expand one raw selector (the model-chains seam). */
  expandRawSelector(raw: unknown): SelectorExpansion
  /** Diff a proposed rules document against the live one over the catalogue. */
  previewRulesChange(nextRaw: unknown): RulesDiff
  /** Current discipline warnings (empty rules, stale pins). */
  warnings(): readonly string[]
}

/**
 * Stateful rules engine: caches the parsed document, the projected catalogue,
 * the gated merge, and the per-entry decision map; `refresh()` re-reads on
 * settings events. All evaluation is synchronous, so a picker call never
 * awaits.
 */
export class CatalogRulesEngine implements CatalogRulesService {
  private rules: ParsedRules
  private entries: CatalogEntry[]
  private report: VisibilityReport
  private decisions = new Map<string, VisibilityDecision>()

  /**
   * @param readRules - reads the raw `catalogRules` value (ctx-bound in production).
   * @param readCatalogue - reads the live catalogue snapshot (ctx-bound in production).
   * @param readHiddenPins - reads `uiPreferences.hiddenModels`, the picker's manual pins.
   */
  constructor(
    private readonly readRules: () => unknown,
    private readonly readCatalogue: () => CatalogEntry[],
    private readonly readHiddenPins: () => unknown = () => undefined,
  ) {
    this.rules = parseRulesDocument(undefined)
    this.entries = []
    this.report = { decisions: [], warnings: [] }
    this.refresh()
  }

  /** Re-read the rules document and catalogue; rebuilding every derived view. */
  refresh(): void {
    this.rules = withHiddenPins(parseRulesDocument(this.readRules()), this.readHiddenPins())
    const entries = this.readCatalogue().map(entry => ({
      ...entry,
      ...(isGated(entry, this.rules) ? { gated: true } : {}),
    }))
    this.entries = entries
    this.report = evaluateVisibility(entries, this.rules)
    this.decisions = new Map(this.report.decisions.map(decision => [`${decision.provider}/${decision.model}`, decision]))
  }

  /** Current parsed document (exposed for callers that need the raw clauses). */
  parsed(): ParsedRules {
    return this.rules
  }

  /** Current catalogue snapshot with gated markers merged in. */
  catalogue(): readonly CatalogEntry[] {
    return this.entries
  }

  visibility(): VisibilityReport {
    return this.report
  }

  decide(provider: string, modelId: string): VisibilityDecision | undefined {
    return this.decisions.get(`${provider}/${modelId}`)
  }

  expandSelector(selector: GroupSelector): SelectorExpansion {
    return expandSelector(selector, this.entries, this.rules.privacy)
  }

  expandRawSelector(raw: unknown): SelectorExpansion {
    const warnings: string[] = []
    const selector = parseGroupSelector(raw, line => warnings.push(line))
    if (selector === undefined) {
      return { links: [], matched: 0, warnings: Object.freeze(warnings.length > 0 ? warnings : ['selector ignored']) }
    }
    const expansion = expandSelector(selector, this.entries, this.rules.privacy)
    return { ...expansion, warnings: Object.freeze([...warnings, ...expansion.warnings]) }
  }

  previewRulesChange(nextRaw: unknown): RulesDiff {
    // The proposed document inherits the picker's manual pins, exactly as the
    // live document does — otherwise the diff would misreport them as removed.
    const next = withHiddenPins(parseRulesDocument(nextRaw), this.readHiddenPins())
    return diffRules(this.rules, next, this.entries)
  }

  warnings(): readonly string[] {
    return this.report.warnings
  }
}

/**
 * Mount the `catalogRules` service and keep it in step with the namespace.
 * @param ctx - profile plugin Context.
 */
export function apply(ctx: Context): void {
  const settings = (): SettingsDocumentReader | undefined => ctx.get('settings') as SettingsDocumentReader | undefined
  const engine = new CatalogRulesEngine(
    () => {
      const document = readOrchestrationDocument(settings())
      return document?.catalogRules
    },
    () => readCatalogue(settings()),
    () => {
      const document = readOrchestrationDocument(settings())
      const preferences = document?.uiPreferences
      return isRecord(preferences) ? preferences.hiddenModels : undefined
    },
  )
  const emitted = new Set<string>()
  const emitWarnings = (): void => {
    for (const warning of engine.warnings()) {
      if (emitted.has(warning)) continue
      emitted.add(warning)
      process.stderr.write(`[enpoi-catalog-rules] ${warning}\n`)
    }
  }
  ctx.provide('catalogRules', engine)
  emitWarnings()
  const onNamespaceChange = ((ns: unknown) => {
    if (String(ns) !== ORCH_NS && String(ns) !== 'llm-pi-ai') return
    engine.refresh()
    emitWarnings()
  }) as (...args: unknown[]) => unknown
  ctx.on('settings/document-updated', onNamespaceChange)
  ctx.on('settings/updated', onNamespaceChange)
  process.stderr.write('[enpoi-catalog-rules] mounted\n')
}

export {
  diffRules, evaluateVisibility, formatHiddenReason, parseRulesDocument, resolvePrivacy, withHiddenPins,
  type CatalogEntry, type CatalogPredicate, type HideRule, type ModelOverrides, type ParsedRules,
  type PrivacyOverrides, type PrivacyVerdict, type RulesDiff, type VisibilityDecision, type VisibilityReport,
} from './rules.ts'
export { expandSelector, parseGroupSelector, type GroupSelector, type SelectorExpansion, type SelectorMatch } from './selectors.ts'
export { readCatalogue } from './catalogue.ts'
