# dsh-enpoi-peer-bridge

Caller side of the device-to-device peer API (doc 69 P2, doc 70, doc 27's thin
bridge). One harness drives a *remote* harness session: prompt it, follow it to
a terminal state, read the answer, answer its asks, cancel it. The remote keeps
its own tools, workspace, approvals, and model routing — this package never
executes anything remotely.

## Tools

| Tool | What it does |
|---|---|
| `peer_status {alias}` | Handshake (host identity, capabilities, protocol) + `peer.state`: exposure, target session, latch, descendants, pending asks, current model. |
| `peer_ask {alias, message, waitMs?}` | Adopts/creates the session when needed, prompts it as an attributed peer turn, follows with reconnect + `peer.page` repair, returns the answer or the structured terminal failure. |
| `peer_asks {alias}` | Pending remote asks (approval and question kinds). |
| `peer_answer {alias, askId, outcome}` | Settles an approval ask (`allowed-once` \| `rejected`). First answer wins. |
| `peer_cancel {alias}` | Cancels the remote active turn, attributed to this caller. |

## Pairing document

Reads caller-role entries from `$DSH_HOME/pairings.yaml` by default:

```yaml
version: 1
device: serverlocal
pairings:
  - alias: co-dev
    peer: laptop                  # device being called
    exposure: debug               # host-role; required by the host parser
    endpoint: https://laptop.pike-acrux.ts.net:8443
    remoteSessionId: sess-xyz     # optional; omit to address the alias (create/adopt)
    token: null                   # optional; sent as Authorization: Bearer
    create:
      cwd: /home/adam/projects/thing
      agentPreset: standard
```

Host-role fields (`sessionId`, `exposure`) are ignored by the caller; an entry
needs `alias`, `peer`, and `endpoint` to be dialable. `pairingsPath` in the
plugin config (and `--pairings` on the CLI) points at another document so a
test never touches the operator's real file.

## Remote asks

While `peer_ask` follows a remote turn, a pending approval ask is raised
*locally* through `ctx.approval.request` with the remote tool name and a
`remote ask on <alias>` reason; an `allowed-once` / `rejected` decision is
relayed as `peer.answer`. The local card is linked to the follow's lifetime: if
the follower goes away first (the turn reaches a terminal, `waitMs` elapses,
the caller aborts, or the socket dies), the pending card is withdrawn
(`cancelled`) and the remote ask is left answerable through `peer_answer`.
Surfacing runs concurrently with the follow loop under a small bounded
in-flight set with contained errors, so an open card never stalls frame
processing. When the local service cannot be used (no `approval`
service, no agent, no open turn) or the ask is a question kind, the ask is
written to a durable notice file (`<pairing dir>/peer-bridge/asks.jsonl`) and
stays answerable through `peer_answer` / `ds peer answer`. A `peer/conflict`
answer means another participant settled it first — the bridge reports that
and never retries blind. Nothing is auto-answered.

## Known limitations and deferred work

- Question asks are surfaced but not answerable from this bridge (the
  structured `AskUserQuestionAnswer` vocabulary is not exposed yet).
- `hopCount` is sent as 0: this bridge does not track autonomous-exchange
  chains (doc 69 §9.3 keeps hop count as telemetry).
- The host-side `peer.create` binding and the host pairing are separate
  concerns; this package only reads caller-role entries.
- Uses a local copy of the harness peer client (`src/peer-client.ts`) because
  `@deepseek-ai/dsh-api-peer` is not a profile dependency; keep the frame
  contract in step with `packages/api/peer/src/client.ts`.
