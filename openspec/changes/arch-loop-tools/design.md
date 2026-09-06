# Design: arch-loop-tools

## D1 — Mirror the panel, do not re-implement it

The Loop panel arms through `POST /api/autopilot/loop` with `LoopRequest`; the tools take
the same fields flat (`ArchLoopTools.LoopParams`) and call the same `LoopConfigStore`
methods the controller calls — `StartSuggestion`, `StartGoal`, `StartQueue`, `Start`
(recipe by id/name or raw prompt), `Update`, `SetMode`, `Resume`, `Stop` — with the same
pin (the repo's dock session) and the same refusals: a goal needs a goal, a recipe needs
a recipe or prompt, a queue needs a non-empty stash (the repo's dock tab is resolved when
none is named), mode ∈ suggest | drive, cap 1–100. `ArchLoopTools.ValidateStart` /
`ValidateUpdate` hold those rules as pure functions; the store keeps enforcing its own
clamps underneath. One loop slot per agent, so `loopId` = the agent's repoId and a
mismatching id is an error, not a second loop.

`update_loop` edits in place what the panel edits in place (cap, sentinel, prompt via
`Update`; mode via `SetMode`, counter kept). A new goal re-composes the goal prompts, so
it re-arms (counter reset) — as in the panel. `rearm: true` re-activates a stopped /
capped / escalated loop with its stored parameters; a stopped queue resumes its
remainder through `Resume`. `stop_loop` calls `Stop(repoId, "arch")`: the record stays
(status stopped, reason arch), never deleted.

## D2 — send_task's gates, one function

`LoopGate(tool, machine, repoId, operatorAsked)` runs before start/update/stop, in the
order the send takes them: agent resolution (handles), the armed arch loop
(`ArmedOrRefusal`, audited under the loop tool's name), the autopilot gate (the panel is
gated by it too, so a closed gate answers `not-accepting`), then locally managed +
exists + the claimed rule (override audited as `claimed-override`), or remotely managed
in scope + sends allowed + the peer posture (`RemotePosture` — dark, not accepting, not
managed there). `list_loops` is read-only and has no armed requirement, like
`list_agents`. Busy is not checked: the engine waits for the turn to end, as it does
for the panel.

## D3 — Cross-machine

`GET /api/arch/peer/loops?repoId=` returns the peer's managed agents' loop rows (the same
`ArchLoopTools.View`); `POST /api/arch/peer/loop` takes `{ from, action, repoId, loopId,
…params, rearm, override }` and runs the peer's own `PeerLoop`: accept-sends opt-in, gate,
managed there, claimed unless override, then the same local start/update/stop with
`armedBy = arch@<from>`. `FleetClient.Loops` / `Loop` wrap them; a 404 is already mapped
to `no-peer-api` by the fleet client, so an older peer answers exactly that.

## D4 — Who armed it

`LoopConfigStore.Entry.ArmedBy` (null = operator on old files) → `LoopState.ArmedBy`
("operator" | "arch" | "arch@<machine>") → `armedBy` in the ungated loop projection →
"by arch" on the dock's summary and armed row (`dashboard.loopArmedBy`, en + tr). The
Operator's controls are unchanged: their Disarm, mode flip, update and re-arm work on an
arch-armed loop exactly as on their own (a re-arm by the Operator resets `armedBy` to
operator, since it is a new arming).

## D5 — Loop events on the feed

The store publishes on the harness feed (optional `HarnessEventFeed` in its constructor;
tests build it without one): `loop.armed` on every start, `loop.fired` on `RecordSend`,
and `loop.escalated | loop.capped | loop.done | loop.error | loop.stopped` on `Resolve`
(`EventTypeFor`). Source `{ repoId, repoName }` like turn events, data = status words
(kind, mode, status, iterations, cap, armedBy, reason, detail) — never prompt text. The
collector ingests the self feed, so `ComposeWakeCore` sees them: managed repos' fired /
escalated / capped / done / error / stopped events join turn events in "What happened"
(`ArchLoopTools.WakeLine`), and the closing line points at `list_loops` when a loop
moved. `loop.armed` is deliberately not a wake: the arch or the Operator just did it.
Events on `@arch` keys are filtered out by the managed set as before.

## D6 — Tests

Pure and temp-dir: the parameter schema (kinds/modes exactly the panel's, every refusal
the panel makes, cap range, kind inference, update needs a change unless rearm), the
audit summary (kind · mode · cap · text head, bounded), `ArmedBy` round trip and default,
`Stop(by)` wording vs the button's, the feed events in order with the repo as source and
status-word data, `EventTypeFor`, the list view (state armed → active → escalate, pacing,
next fire, creator, ages), the wake composition (escalation and cap narrated, unmanaged
ignored, arming not a wake, list_loops hint), the MCP catalogue (nineteen tools, required
args, the panel's parameter names, `no-peer-api` in the description) and the role prompt.
The gates themselves are the existing `send_task` path (`ArmedOrRefusal`, `AvailabilityOf`,
`RemotePosture`) reused verbatim; they are not unit-tested anew because `ArchAgentService`
is not constructible in tests — the reuse is the argument.
