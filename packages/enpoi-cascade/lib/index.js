// src/index.ts
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
var name = "enpoi-cascade";
function diag(line) {
  try {
    const home = process.env.DSH_HOME ?? process.env.HOME ?? "/tmp";
    const dir = home.endsWith(".dsh") ? home : join(home, ".dsh");
    mkdirSync(join(dir, "logs"), { recursive: true });
    appendFileSync(join(dir, "logs", "enpoi-cascade.log"), `${(/* @__PURE__ */ new Date()).toISOString()} ${line}
`);
  } catch {
  }
}
function apply(ctx) {
  ctx.on("session/event", (session, event) => {
    if (event.type !== "turn/end") return;
    const reason = event.data.reason;
    if (reason.kind !== "aborted") return;
    const cancelCause = reason.reason;
    if (cancelCause === void 0 || cancelCause.kind !== "user") return;
    diag(`user stop detected for session ${session.id} \u2014 draining descendants`);
    const subagents = ctx.get("subagents");
    const agent = ctx.get("agents")?.get(session.id);
    if (subagents !== void 0) {
      if (agent !== void 0) {
        void subagents.drainContinuableDescendants([agent]).catch((error) => {
          ctx.logger.warn(`[enpoi-cascade] descendant drain failed: ${String(error)}`);
        });
      }
    }
  });
}
export {
  apply,
  name
};
