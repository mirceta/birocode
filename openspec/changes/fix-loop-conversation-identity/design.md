# fix-loop-conversation-identity — design

## Context

The engine's evidence source is `AutopilotService.LastAssistantMessage(repoPath)`:
newest `.jsonl` by mtime in the repo's shared `~/.claude/projects/<repo>` folder.
That folder is written by every conversation touching the repo, and every
`claude --resume` FORKS a new session file with a new session id. So "newest
file" is a race between the loop's own forks, the user's watched conversation,
and background jobs (auto-understanding). The `RunSession` a send creates
captures the run's real (new) session id from the CLI's `session` event, and
`RunSessionService.RunCompleted` (built for auto-understanding) fires exactly
once per completed run with `(RepoId, Lane, Status, SessionId)` — the
infrastructure to follow a conversation's lineage already exists; the engine
just doesn't use it.

Client-side, `ChatContext.reconcile()` already does everything needed to adopt
a backend run (`GET /api/runs` → `attachToRun()` → transcript backfill + SSE
replay + `streaming` flag); it is just never invoked while the page sits open.

## Goals / Non-Goals

**Goals:**

- A driven loop reads from and resumes exactly ONE conversation — the pinned
  session lineage — regardless of what else writes to the transcript folder.
- The pin follows the lineage across `--resume` forks automatically.
- Sentinel/`GOAL_VERIFIED` fire only as the reply's final line (the contract
  `docs/loop-driven-agent-convention.md` already states).
- An engine-started run becomes visible on an already-open page within a few
  seconds, with the normal busy UI (streaming bubbles, Send→Stop).

**Non-Goals:**

- Re-architecting the engine from polling to fully event-driven. The 10s tick
  stays the scheduler; pinning makes the evidence correct. (RunCompleted only
  advances the pin — it does not decide.)
- Changing the suggestion kind's evidence source. It intentionally reacts to
  the repo's current trailing message (it drives nothing).
- Multi-conversation loops, or gating what the user may do mid-loop.
- Fixing the transcript-folder sharing itself (upstream CLI behavior).

## Decisions

### D1 — Pin lives on the loop record (`LoopConfigStore.Entry.SessionId`)

Additive nullable field + `SetSessionId(repoId, sessionId)`; old `loops.json`
files load with null. The pin is durable state of the instance (survives
restart mid-loop), so it belongs next to phase/counters, not in engine memory.
Disclosed in the gated detail/debug projections (it names a conversation, not
prompt text, but stays behind the operator gate with the rest of the loop
internals).

### D2 — Pin seeded at arm time: client-provided, newest-at-arm fallback

The dock arms a loop while showing a specific conversation; that conversation's
session id is the user's actual intent, so the arm API (`LoopRequest`) gains an
optional `SessionId` the dock passes. Fallback when absent (API callers, empty
dock): the repo's newest transcript session at arm time, resolved once and
stamped by the controller — NOT re-resolved per tick, which is the bug.
A repo with no transcript yet arms with a null pin; driven kinds keep their
existing "wait for a session to exist" behavior until the fallback can resolve
(first tick re-checks; the pin is stamped before the first send either way,
because sends only resume the pinned session).

### D3 — Pin advances on builder-lane run completion, whoever started the run

`AutopilotService` subscribes to `RunSessionService.RunCompleted` (same pattern
as `AutoUnderstandingTrigger`). On an event with `Lane == "builder"`, a
non-null `SessionId`, and an active DRIVEN loop for the repo → `SetSessionId`.

Why unconditionally, not only for loop-started runs: there is one builder
conversation per repo, and both legitimate writers move it — the loop's own
sends AND the human (a suggest-mode pending prompt is by design sent by the
human from the composer; the loop must follow that fork or stall forever).
Understanding jobs never claim the builder lane (they run their own CLI outside
`RunSessionService`), so no background job can move the pin. A user who
deliberately starts a DIFFERENT conversation mid-loop does move it — accepted:
that is a foreground human action on the loop's own lane, visible in the gated
detail read, and strictly less surprising than today's any-file-anywhere race.

Alternative considered: advance only from runs the engine started (tracked by
reference). Rejected — suggest-mode loops would never advance, and a manual
human turn inside the driven conversation would strand the pin on a dead fork.

### D4 — The engine reads and resumes the pin only

`Tick()` for driven kinds replaces the newest-file read with
`LastAssistantMessageIn(repoPath, loop.SessionId)` (same `SessionService`
message parse, fixed file). The resume target for `SendPrompt` is likewise
`loop.SessionId`. The suggestion kind keeps the newest-file read (its designed
semantics). Consequences that fall out for free: the dedup-guard snippet now
only ever changes when the PINNED conversation gains a reply, so phantom
"the agent replied" transitions disappear; the pre-arm freshness gate
(fix-loop-arm-freshness) keeps working unchanged on the pinned message's
timestamp; `RecordSend` counts only real sends into the pinned lineage.

### D5 — Final-line anchoring for completion tokens, substring for escalation

`SentinelHit` and the goal loop's `GOAL_VERIFIED` check match against the
reply's last non-empty line (case-insensitive containment within that one line,
so trailing punctuation survives). Rationale: completion tokens end a loop —
false positives are runaway/false-done, the dangerous direction — and the
convention doc already promises "as the final line". `NEEDS_HUMAN:` and the
deny-list stay whole-reply substring matches: their false-positive direction is
"stop and ask a human", which is the safe side, and a NEEDS_HUMAN question may
legitimately span lines.

### D6 — Client: visible-page poll through the existing reconcile

A ~5s `setInterval` in `ChatContext` (skipped when `document.hidden`, started
once `dockLoaded`) invoking `reconcileRef.current()`. `GET /api/runs` is an
in-memory dictionary snapshot — negligible cost; `attachToRun` already no-ops
when a reader is attached (`abortRefs` guard), so the poll is idempotent and
the busy UI (streaming flag → Stop button) needs zero new wiring.

Alternative considered: SSE "run started" notify channel. Rejected for now —
new endpoint + connection lifecycle for something a cheap poll covers; can be
layered later without changing the client behavior contract.

## Risks / Trade-offs

- [Pin follows a human's unrelated new conversation mid-loop (D3)] → Accepted
  and visible: the gated detail read shows the current pin; the loop keeps
  driving whatever the builder conversation now is. Documented behavior.
- [Arm-time fallback pins the newest file, which can itself be a background
  fork] → Only when the dock could not name a conversation; still strictly
  better (resolved once, then lineage-tracked) and the dock passes the real id
  in the normal path.
- [A run that dies before its `session` event leaves the pin unmoved] → The
  engine re-resumes the OLD pinned session next tick — correct behavior (the
  turn never happened in the lineage).
- [Final-line anchoring could miss a sentinel followed by trailing boilerplate]
  → That is the convention being enforced; the prompts/templates already
  instruct "as the final line". The loop then just sends another iteration —
  self-correcting, not stuck.
- [5s poll multiplies across open tabs] → Snapshot endpoint is in-memory and
  auth-checked; per-tab cost is one small GET; matches existing poll cadences
  elsewhere in the dashboard (dock, header strip).

## Migration Plan

Additive `loops.json` field — no migration. Loops armed before deploy have a
null pin: their first builder-lane run completion (D3) or re-arm stamps it;
until then the engine falls back to newest-file for the FIRST resolve only
(one-time, logged), then locks on. Rollback = revert; the extra JSON field is
ignored by old builds.

## Open Questions

_None — decisions above cover the incident's failure modes._
