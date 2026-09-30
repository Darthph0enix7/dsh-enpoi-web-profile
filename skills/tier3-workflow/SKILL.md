---
name: tier3-workflow
description: The "All Out" Tier. Complex implementation with continuous Oracle supervision and Roundtable ambiguity resolution.
---

# Tier 3 Workflow: Complex Implementation

Tier 3 is the highest level of execution for massive, complex, and highly ambiguous implementations. It utilizes every available tool and agent to ensure perfection.

**Scope:** This workflow governs the current request only. A new request starts from the default behavior unless the operator invokes a tier again; invoking another tier for the same task replaces this workflow.

## Core Contract
- **State Management:** Author the tier state on the whiteboard with `whiteboard_write` (kinds: path, rule, fact, task; stable ids so `replace` can update them) and pin the brief with `whiteboard_pin` or `pinned: true` — pinned context is injected for the session and visible to the fleet. Keep the `todo_write` list synced with the current phase.
- **Continuous Supervision:** Work with the Oracle through `oracle_review` for continuous, strict supervision. Ask for reviews not just at the beginning and end, but during major implementation milestones; the Oracle remembers prior consultations within the request, so later calls send concise deltas.
- **MANDATORY Ambiguity Resolution:** If, during implementation, the task has multiple perspectives, unexpected roadblocks, or it is not clearly decidable what the best course of action is, you MUST invoke the \`roundtable\` tool (`roundtable({ query: "..." })`) to decide the path forward.
- **Full Agent Utilization:** Offload parallel bounded tasks with the `subagent` tool, role `fixer`. Use `subagent` role `designer` for all UI. Aggressively use `subagent` roles `explorer` and `librarian`. Every dispatch is a fresh session; include the whiteboard brief in each dispatch.

## Whiteboard Layout
The pinned board entries for the task MUST follow this standard structure:

### 1. Master Goal & Context
The overarching objective and deep context gathered from specialist subagents (ids `goal`, `context`).

### 2. Strategic Plan & Oracle Sign-off
The high-level architectural plan (id `plan`) and the initial `oracle_review` review.

### 3. Phased Implementation Log
For each major phase:
- **Phase Goal**
- **Ambiguity Checks:** If a roadblock occurred, record the `roundtable` Council Report used to resolve it.
- **Execution:** parallel workers (each a fresh `subagent` dispatch).
- **Mid-point Reviews:** `oracle_review` spot-check notes.

### 4. Final Oracle Review & Validation
Record the final, rigorous verdict from `oracle_review` and comprehensive validation results.
