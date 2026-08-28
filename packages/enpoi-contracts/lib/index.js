// packages/enpoi-contracts/src/index.ts
import { z } from "zod";
var traceContextSchema = z.object({
  /** Root query id — one user query spans one trace. */
  traceId: z.string().min(1),
  /** Run id — one subagent run / keeper pass. */
  runId: z.string().min(1),
  /** Persona name (orchestrator, oracle, fixer, context-keeper, …). */
  persona: z.string(),
  /** Parent event seq this event derives from. */
  parentSeq: z.number().int().nonnegative(),
  /** This event's own seq. */
  seq: z.number().int().nonnegative()
}).strict();
var provenanceSchema = z.object({
  parentSeqs: z.array(z.number().int().nonnegative()),
  childSessionId: z.string().min(1),
  toolSeqs: z.array(z.number().int().nonnegative())
}).strict();
var subagentReturnSchema = z.object({
  /** Files the run changed. */
  changed: z.array(z.string()),
  /** Whether the run verified its own work. */
  verified: z.boolean(),
  /** Files changed but NOT verified (verification gate rejects these). */
  NOT_verified: z.array(z.string()),
  /** Facts the run wants remembered (memory pipeline intake). */
  remember_later: z.array(z.string()),
  /** Provenance for the memory pipeline (living-owner rule). */
  provenance: provenanceSchema
}).strict();
var briefProseUpdatedSchema = z.object({
  goal: z.string().optional(),
  decisions: z.array(z.string()).optional(),
  openThreads: z.array(z.string()).optional(),
  /** The session seq the keeper's input was based on (I3 comparison). */
  basedOnSeq: z.number().int().nonnegative(),
  /** Structural-event count (user/message, turn/end, tool/call, tool/result) at basedOnSeq — seq-based freshness (Oracle amendment 4). */
  basedOnStructuralCount: z.number().int().nonnegative(),
  /** The structural-distance threshold the keeper used — view() classifies freshness with it. */
  structuralDistanceK: z.number().int().positive().optional(),
  /** Route used, e.g. "deepseek/deepseek-v4-flash". */
  model: z.string(),
  /** The prose summary text. */
  text: z.string(),
  /** Always the keeper — the fold rejects other origins. */
  origin: z.literal("context-keeper")
}).strict();
var briefEntrySchema = z.object({
  id: z.string(),
  text: z.string(),
  seq: z.number().int().nonnegative()
}).strict();
var blockerSchema = z.object({
  id: z.string(),
  text: z.string(),
  tool: z.string().optional(),
  seq: z.number().int().nonnegative()
}).strict();
var livingBriefStateSchema = z.object({
  goal: z.string(),
  decisions: z.array(briefEntrySchema),
  constraints: z.array(briefEntrySchema),
  openThreads: z.array(briefEntrySchema),
  filesTouched: z.array(z.string()),
  blockers: z.array(blockerSchema),
  phase: z.string(),
  prose: z.object({
    text: z.string(),
    updatedAt: z.number(),
    model: z.string(),
    basedOnSeq: z.number().int().nonnegative(),
    basedOnStructuralCount: z.number().int().nonnegative(),
    structuralDistanceK: z.number().int().positive()
  }).nullable(),
  goalSeq: z.number().int().nonnegative(),
  lastEventSeq: z.number().int().nonnegative(),
  foldErrors: z.number().int().nonnegative(),
  toolNames: z.record(z.string()),
  structuralCount: z.number().int().nonnegative()
}).strict();
var livingBriefViewSchema = z.object({
  goal: z.string(),
  decisions: z.array(briefEntrySchema),
  constraints: z.array(briefEntrySchema),
  openThreads: z.array(briefEntrySchema),
  filesTouched: z.array(z.string()),
  blockers: z.array(blockerSchema),
  phase: z.string(),
  prose: z.object({
    text: z.string(),
    updatedAt: z.number(),
    model: z.string(),
    basedOnSeq: z.number().int().nonnegative(),
    basedOnStructuralCount: z.number().int().nonnegative(),
    structuralDistanceK: z.number().int().positive()
  }).nullable(),
  asOfSeq: z.number().int().nonnegative(),
  freshness: z.union([z.literal("live"), z.literal("cooling"), z.literal("stale")])
}).strict();
export {
  blockerSchema,
  briefEntrySchema,
  briefProseUpdatedSchema,
  livingBriefStateSchema,
  livingBriefViewSchema,
  provenanceSchema,
  subagentReturnSchema,
  traceContextSchema
};
