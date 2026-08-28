---
name: ue-mcp
description: Use when working with Unreal Engine through the local MCP server, Blueprint graphs, materials, actors, DataTables, or editor automation.
---

# Unreal Engine MCP Execution Protocol

## 0. The Wrapper

You interact with Unreal Engine through a **toolset-wrapped MCP server** at `http://127.0.0.1:8010/mcp`. The editor MUST be launched with `-ModelContextProtocolPort=8010` (CLI override — see §6). You do NOT have direct UE tools. You only have three:

- `list_toolsets` — enumerate the 19 toolsets available
- `describe_toolset` — get a toolset's full tool inventory + input schemas
- `call_tool` — invoke a real tool, given `{toolset_name, tool_name, arguments}`

This indirection is by design (per Epic): it stops the agent from being flooded with hundreds of tools at once. The cost is that every action is 1-3 round-trips.

## 1. Schemas Cache — Read First, Describe Second

`~/.config/opencode/skills/ue-mcp/SCHEMAS.md` contains cached `describe_toolset` outputs for toolsets you've already mapped. **[Tested: UE 5.8]** entries are known-good. If the toolset you need is cached, skip `describe_toolset` and go straight to `call_tool`.

If the toolset is NOT cached:
1. Call `describe_toolset` with `toolset_name`
2. Use the result
3. Add a concise entry to `SCHEMAS.md` only when the toolset is central or will be reused. Keep niche schemas agentic and uncached.

## 2. Argument Shapes — refPath Everywhere

Almost every reference to a UObject, UClass, Actor, or Component in UE's MCP uses a `refPath` object:
```json
{ "refPath": "/Game/Maps/MyLevel.MyLevel:PersistentLevel.ActorName" }
```
or for a class:
```json
{ "refPath": "/Script/Engine.StaticMeshActor" }
```
Mismatches between actor references and class references are a top source of 400 errors. When in doubt, `describe_toolset` re-reads the schema and look for `"title": "/Script/..."`.

## 3. Mistakes Log — Read Before Risky Calls

`~/.config/opencode/skills/ue-mcp/MISTAKES.md` records known anti-patterns. Check it before any non-trivial action. After hitting a 400/timeout/UNEXCEPTED, diagnose, fix, then **append the trap to MISTAKES.md** so the next session doesn't repeat it.

## 4. Per-Project Memory

Use `ctx_memory` ONLY for project-specific rules (e.g. "SAFERWATER base class is X"). Never put engine-level wrapper / schema info in `ctx_memory` — that belongs here, in the skill.

## 5. Trigger

A project's local `AGENTS.md` instructs OpenCode to load this skill with `call:skill{name: "ue-mcp"}` the moment any agent touches the project. The trigger file is project-local, the skill is global-but-dormant — clean separation.

## 6. Network Quirks

- UE's MCP server uses streamable HTTP. Responses may not close cleanly. Use a practical timeout (up to 120 seconds for complex work) and parse any bytes received.
- A timeout with bytes is usually a completed SSE response; a timeout with zero bytes is likely a modal-popup lock. Stop and ask for editor intervention in the latter case.
- Server binds to `127.0.0.1:8010` only — not reachable from other machines. **Port scheme (2026-08-05):** SAFERWATER sets `ServerPortNumber=8010` in the per-project settings (`Saved/Config/LinuxEditor/EditorPerProjectUserSettings.ini`); the editor runs without CLI flags. The cook/packaging commandlet reads the SAME settings → same port → **packaging requires the editor closed** (or `ModelContextProtocol.StopServer` in the editor console first). Alternative scheme (not used): settings default 8000 + editor launched with `-ModelContextProtocolPort=8010` CLI override → cook keeps 8000 → packaging works with editor open.
- If a connection hangs in `CLOSE-WAIT`, open a new session (`initialize` first) and the old one will free up. There's no explicit `DELETE /mcp` support.

## 8. Workflow Guardrails

- Read the required fields from a tool schema; UE often marks nullable fields as required.
- Capture returned `refPath` values. UE may silently rename spawned actors.
- Verify every state-changing call with a read/find/get call. `null` is not proof of success.
- Build deeply nested JSON with Python serialization and send it with `--data-binary @file`.
- Treat Structs, Enums, Blueprint Interfaces, Macro Libraries, Timelines, Map key types, and component-bound event wiring as manual or conditional. Do not retry popup-triggering calls.
- `write_graph_dsl` is additive; clean failed graph attempts before rewriting.

## 9. Common DSL Patterns

Use explicit variable access and break custom structs before reading fields:

```lisp
(bind value (Variables|Default|GetTimer))
(Variables|Default|SetTimer (+ value DeltaSeconds))
(bind active (Utilities|Struct|BreakMyStruct item))
```

For multi-word outputs, the parser uses lowercase, space-stripped names such as `_outhit` and `_returnvalue`, not `_out_hit`.

For visual inspection, use: `find_actors` → `FocusOnActors` → `GetCameraTransform` → `CaptureViewport` → observer analysis.

The project-level `UE_MCP_WORKFLOW_GUIDE.md` contains the human/agent division of labor and practical examples.

## 7. Discovering a Tool's `tool_name`

`call_tool.tool_name` is the FULLY-QUALIFIED name from `describe_toolset`, format: `<toolset_name>.<short_name>`. Examples:
- `editor_toolset.toolsets.actor.ActorTools.get_components`
- `editor_toolset.toolsets.scene.SceneTools.spawn_actor`

Strip the toolset prefix when calling: pass `toolset_name` AND `tool_name` separately to `call_tool`.
