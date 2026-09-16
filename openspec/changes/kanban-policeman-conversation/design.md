# Design — the policeman as an arch conversation

## D1. One more arch conversation, nothing else new at runtime

The policeman is `@arch:policeman`, a sibling arch conversation with a reserved id. It
runs in the arch's home, with the arch's MCP server, denials, audit, run slot, stream,
transcript and tool-call history. What the harness adds is bookkeeping (`ArchStateStore`
`Policeman` section), a policy (D3), a heartbeat (D2) and a cap (D4). The Kanban's
Policeman subtab mounts the Arch page (`<Arch popup view="chat" conv="@arch:policeman" />`)
under its own control strip, so chat / tools / history / loops are the same code.

## D2. The loop: a recipe loop, re-armed by a tick

`StartPoliceman` → `LoopConfigStore.Start(key, Prompt, Sentinel, cap 100, mode drive)`. The
recipe store clamps the cap to 1..100, so the loop WILL resolve `capped`; `PolicemanTick`
(engine tick, next to `RetireDefaultWakeLoop`) re-arms it at once — and after an errored
turn once `ErrorCooldown` (10 min) has passed. It never re-arms over `escalate` (a
`NEEDS_HUMAN:` question — the Operator's reply resumes it, as for any arch loop) or over
`stopped` (the Operator stopped it from the loops lane → the policeman is disabled, so the
tick and the Operator never fight). The sentinel `POLICEMAN_RETIRED` is a tripwire the
prompt forbids; if it ever resolves `done` the tick re-arms.

Pacing: `ArchDrivenPolicy` already makes a repeat wait for a wake or the quiet floor;
`DrivenQuietFloorFor(key)` gives the policeman its own floor (the interval setting)
without touching the shared one. The tick also keeps the loop's prompt equal to
`Prompt(boardGoal)` so a goal edit reaches the next pass.

## D3. Observe-only: a per-conversation tool policy at the MCP boundary

`BuildMcpConfigJson(convKey)` puts `?conv=<key>` on the MCP URL; `POST /api/arch/mcp`
passes it to `ArchMcpServer.Handle(body, conversation)`; on `tools/call`, a known tool
outside `ArchPoliceman.AllowedTools` for the policeman conversation returns
`{ ok: false, status: "policeman-observe-only", detail }` without running. The model sees
the boundary in-band and the refusal is in its tool-call history. Allowed: `list_agents`,
`list_machines`, `git_state`, `read_transcript`, `list_loops`, `list_arch_goals`,
`list_tasks`, `list_ideas`, `recall`, `remember`, `board_integrity`, `flag_needs_human`,
`clear_needs_human`.

`board_integrity` judges live (`BoardIntegrity.Assess`) — the same rule the verifier's
second step applies — and adds every card carrying `needsHuman` (who, why, when) and the
goal. `flag_needs_human` stamps `by: policeman`; on a card already carrying another
raiser's request it answers `already` and changes nothing; on a manual card `manual`.
`clear_needs_human` uses `SetNeedsHuman(..., onlyIfBy: policeman)` and answers `not-yours`
for a stamp it did not raise.

## D4. The context cap and the rollover

`RunSession.EmitAsync` records `usage.contextTokens` as `LastContextTokens`. Every arch
turn ends in `NoteArchSession`; for the policeman key it calls `AfterPolicemanTurn`:
`NotePolicemanTurn(sessionId, tokens, now)` (opens/closes session records by id, counts
turns, remembers the last context), then `NeedsRollover(last, cap, turns, 400)`. Over the
cap, `RolloverPoliceman(reason)`:

1. builds the handover from the board: `VerdictSummary(BoardIntegrity.Assess(...), cards
   carrying needsHuman)`, wrapped by `Handover(rollovers, previousSessionId, reason, …)`;
2. `BeginPolicemanRollover` closes the open session record (reason, context, turns),
   increments `Rollovers`, parks the handover;
3. clears the conversation's session id (`ArchStateStore.SetSessionId(key, null)` and the
   loop's pin) — `ResolveArchSessionId` then yields null, so the next send starts a fresh CLI
   session (arch keys are allowed to send without a session id);
4. `DecorateDrivenPrompt` / `SendToArch` prefix the next prompt with the handover once
   (`TakePolicemanHandover`).

Provenance: the sessions list (`PolicemanState.Sessions`, capped at 60) is shown as a strip;
`GET /api/arch/tool-calls?conv=@arch:policeman&sessionId=<old>` (already supported) feeds
`ArchHistoryPanel sessionOverride` for a past session. The Operator can also roll over by
hand (`POST /api/arch/policeman/rollover`).

## D5. Control surface

`GET /api/arch/policeman` → conversation, enabled, interval, cap, last context, turns,
rollovers, restarts, sessions, loop state, running, the live verdict, the goal, the exact
prompt, the allowed tools. `POST …/start | stop | check | rollover | settings`. `check`
sends the ritual prompt now through `SendToArch` (actor `policeman`; 409 when a turn runs).
`stop` stops the loop and disables the tick. The Arch page's own Stop turn, composer,
history and loops lane work unchanged on this conversation; rename/remove are hidden for it.

## D6. Tests

`ArchPolicemanTests`: the allow/deny table against real catalogue names; the prompt names
its tools, the boundary, the goal and the tripwire; the rollover rule (cap, turn fallback,
no cap); handover content; `EnsureConversation` idempotent + fixed id/name + reload;
session tracking across turns, the rollover closing the record and parking a one-shot
handover, an unexpected new session id closing the previous record; settings bounds and
the enable flag. Tool-count assertions updated (27).
