# dsh-enpoi-capabilities

The profile's capability and permission plane: the `enpoi-orchestration`
settings document (capabilities, MCP catalog, permissions, roles, councils,
chains, custom tools), the monotonic pre-dispatch guard, the model-facing
surface filters, the permission policy engine, and the MCP mount supervisor.

## MCP on-demand mounting (V1)

Persistent config says what a server IS; the agent's mounts are session-scoped.

- **Catalog record** (`enpoi-orchestration.mcpServers.<id>`): `url`, optional
  `serverName`/`headers`/`apiKeyEnv`/`toolCallTimeoutMs`, and `mode`:
  - `always-on` (default, pre-existing behavior): auto-mounted at boot and for
    every session; the shared connection stays up.
  - `on-demand`: **never auto-connected**. The agent mounts it for its session
    with the `mcp` tool (or a skill's `mcp:` hint). A server that failed once
    stays down until explicitly mounted.
- **Allowed**: `capabilities.mcp[id] === true` is the operator's permission for
  the server to be mounted at all (on-demand included).
- **Session mounts**: durable through the session log — the `mcp/mounts` event
  carries the complete post-change set and the `mcpMounts` projection folds it,
  so a resumed session comes back with exactly the servers it had mounted.
  `session/disposed` releases the session's mounts and disconnects an on-demand
  server nobody else holds.
- **Surface**: an on-demand server's `mcp__<server>__*` tools are absent from a
  session that has not mounted it (the `system-prompt/assemble` filter), and the
  pre-execute listener denies direct calls as the execution backstop. The drop
  is logged (`[enpoi-capabilities] mcp on-demand surface: …`), and the harness's
  own tool-registry message records the additions/removals — model-visible ⟺
  logged.
- **The `mcp` tool** (one tool, three actions): `list` (configured servers with
  mode, state, reason, tool count), `mount <server>` (connect + register for
  THIS session; failures return the structured connection reason), `unmount
  <server>` (dispose this session's mount). Permission row: shipped `allow` —
  `list` is read-only and mount/unmount only touch servers the operator already
  configured and allowed, scoped to the calling session and reversible. The
  mounted server's OWN tools keep their own rows (`defaults.unknownTools` =
  `ask`), so the dangerous surface still asks.
- **Skill hint**: a skill's frontmatter may carry `mcp: [server]`; loading the
  skill mounts the listed servers for the session and attaches a note to the
  load result (`mcp: mounted "x" for this session (N tools)` or the failure
  reason). A skill without the hint behaves exactly as before.
- **Operator surface**: the session header's MCP chip lists the session's
  mounted servers (tool counts) and closes each one through the
  `enpoiCapabilities.mcpUnmount` remote.
- **Doctrine**: the `mcp:lifecycle` system-prompt section states the lifecycle —
  mounts for continuing work stay; one-shot errands unmount when done; when
  unsure, leave it mounted.

**V2 (not in scope)**: composite/workflow tools (a tool = a chain of steps).
