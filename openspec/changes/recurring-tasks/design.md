# Design

**Revision 2 (Operator, 2026-09-19): a scheduled run is a GOAL LOOP, not one prompt.** The
first draft sent the instructions once and read a closing line. The Operator's point: this
runs unattended, and the harness already has the machinery that makes unattended work
trustworthy — the goal loop sends the work prompt until the agent emits `LOOP_DONE`, then
sends a verification prompt, and only `GOAL_VERIFIED` ends it (gaps send it back to work).
D4–D6 below are rewritten around that; D1–D3 and D7–D8 stand.

## D1 — A new entity, not a loop kind and not a board card

| Option | Verdict |
|---|---|
| A fifth loop kind (`cron`) in `LoopConfigStore` | **Rejected.** One slot per agent is structural; a schedule needs *many cards per agent*. The arch loop tools already refuse `cron` on purpose. |
| A board `Node` with a `Recurrence` field | **Rejected.** The board's lifecycle, `BoardVerifier`, `BoardIntegrity`, the policeman's `InFlight` reading and the aggregate status all assume a card that gets delivered. A recurring task never is. |
| **Own store + own scheduler; each occurrence ARMS the existing goal loop** | **Chosen.** The card and the clock are new. The run itself is the harness's goal loop, armed through the one arming path (`LoopArmer`), driven by the one engine (`AutopilotService`), with its briefing, no-reply retries, `NEEDS_HUMAN`, cap, audit and dock Loop panel — none of it re-implemented. |

## D2 — Data model

```jsonc
// recurring.json — [RecurringTask]
{
  "id": "9f2c…", "title": "CI health check",
  "sourceId": null, "repoId": "c7a9…",            // the board's assignee key: sourceId|repoId (null = this harness)
  "instructions": "Look at the last 10 GitHub Actions runs on main…",
  "schedule": { "kind": "interval", "everyMinutes": 120 }
           // { "kind": "daily", "at": "07:00", "days": ["Monday", …] }   (hub-local time)
  "run":      { "mode": "goal", "maxTurns": 6 },    // "goal" (default) | "single" (one prompt, for trivial checks)
  "policy":   { "catchUp": true, "skipWhenBusy": false, "requireDefaultBranch": false },
  "enabled": true, "pausedReason": null,            // "operator" | "auto: 3 consecutive failures"
  "anchorAt": 1789800000000,                        // the grid origin: set on create / schedule edit / resume
  "lastHandledDueAt": 1789807200000,                // the newest occurrence already fired or skipped
  "runCount": 41, "createdAt": …, "updatedAt": …, "createdBy": "operator"
}
```

```jsonc
// recurring-runs.jsonl — append-only; a later line with the same id replaces the earlier (compacted at startup, 500 kept per card)
{ "id": "r-…", "taskId": "9f2c…", "n": 42,
  "dueAt": …, "missed": 0, "trigger": "schedule",    // schedule | catch-up | manual
  "status": "done",                                  // running | done | escalated | capped | error | stopped | skipped | refused
  "stopReason": "verified",                          // the loop's own: verified | needs-human | cap | by-operator | no-reply | error …
  "turns": 3, "phase": null,                         // sends so far; "work" | "verify" while running
  "armedAt": …, "endedAt": …, "durationMs": 148211, "costUsd": 0.21,
  "outcome": "attention",                            // ok | attention | failed | unreported   (null while running / when not armed)
  "summary": "2 of the last 10 runs on main failed (deploy.yml) — see run 8841",
  "reason": null,                                    // skipped/refused: "loop slot in use", "peer unreachable", …
  "sessionId": "…", "machine": "DESKTOP-POAPPP3", "agent": "birocode" }
```

## D3 — Scheduling semantics (prototyped: `Services/Recurring/Recurrence.cs`, pure, unit-tested)

- **Fixed grid.** Interval occurrences are `anchor + k·every` — a late or long run never
  shifts the next one. Creating a card does not fire it ("Run now" covers the impatient
  case). Daily occurrences are hub-local wall-clock times on the allowed weekdays (a time
  swallowed by the DST gap moves one hour forward).
- **One pending occurrence per card.** When several occurrences have passed unhandled
  (harness down, gate closed, agent busy, the previous run still looping), the pending one
  is the **newest**, and the run records `missed: n` and trigger `catch-up`. With
  `catchUp: false` an occurrence that cannot start within 10 min of its time is `skipped`.
- **Decision ladder per tick** (`Recurrence.Decide`): disabled → idle · not yet due →
  idle(next) · gate closed → **hold** · external hold reason (loop slot in use,
  precondition) → **hold** · agent busy → **hold** (or **skip** with `skipWhenBusy`) · else
  **fire**. A hold writes nothing to history; the card shows the reason.
- **Minimum interval 5 min**, maximum 30 days.

## D4 — A run is a goal loop

**Fire = arm.** `LoopArmer.Start(repoId, repoName, { kind: goal, mode: drive, goal: <goal
text>, maxIterations: card.run.maxTurns }, by: "recurring", pin: <the dock's session>)` —
byte-identical to the path the dock panel, the arch's `start_loop` and the agent's
`arm_my_loop` use. For a peer's agent: `FleetClient.Loop(sourceId, { action: "start", … })`
→ `POST /api/arch/peer/loop`, which already exists for the arch loop tools (the receiver's
accept-sends, gate and scope apply; armed by `recurring@<machine>`).

From there the existing engine does everything (`GoalLoop.DecideCore`):

```
work prompt ──▶ reply … ──▶ work prompt ──▶ reply ends LOOP_DONE
                                              │
                          verify prompt ◀─────┘   "Critically verify against the ACTUAL state…"
                              │
        reply ends GOAL_VERIFIED ──▶ done · verified        gaps listed ──▶ back to work
        NEEDS_HUMAN: … anywhere   ──▶ escalate · needs-human
        turn budget reached       ──▶ capped                no reply ×3 ──▶ error · no-reply
```

**The goal text** (`Recurrence.ComposeGoal`) is what the templates wrap, so it appears in
both the work and the verify prompt:

```
[Recurring task] CI health check
Recurring id: 9f2c… · run #42 · due 2026-09-19 14:00 · every 2 h · armed by the harness scheduler on DESKTOP-POAPPP3
Previous run: 2026-09-19 12:00 — OK: all 10 runs green

<instructions>

This is an unattended, recurring run. Do what the instructions say and nothing else; …
When you confirm the goal is verified, put ONE result line directly above GOAL_VERIFIED:
"RUN OK: <one-line result>" or "RUN ATTENTION: <what the Operator should look at>".
```

**The loop slot is the constraint — and a useful one.** An agent has exactly one loop slot.
A recurring run needs it, so:

- slot in use (the Operator's own loop, the arch's, or another recurring card's run) →
  the occurrence is **held** with that reason. Two cards on one agent therefore run one
  after the other, never interleaved. This replaces the first draft's "hold while a drive
  loop is active" option — it is structural now.
- **The slot is borrowed, not taken.** An inactive slot still holds the Operator's last
  loop parameters (the dock panel rehydrates from them). The scheduler snapshots the
  inactive record before arming and restores it when the run resolves — the arch
  "standing loop" precedent (`RestoreStandingLoopIfNeeded`). A build task, not free.
- The previous run still looping when the next occurrence comes → held by its own slot,
  then coalesced. The turn budget (`maxTurns`, default 6, the loop's cap) bounds a run.

**`single` mode** stays available per card for trivial read-only checks (one prompt through
`IAgentDirectory.SendToAgent` with actor `recurring`, closing line `RUN OK | ATTENTION |
FAILED`). A goal run costs at least two turns; a 15-minute "is the port up" check does not
need them. Default is `goal`.

## D5 — Learning how the run ended

The loop resolves itself; the scheduler only listens.

- **Local:** `LoopConfigStore.Resolve` publishes `loop.done | loop.escalated | loop.capped
  | loop.error | loop.stopped` with `{repoId, status, reason, detail, iterationsDone,
  armedBy}` on the harness feed. The run closer takes the event whose `armedBy` is
  `recurring` for that agent, reads the final reply (transcript, else the witnessed
  `RunSession.ReplyText`), and completes the run record. `loop.fired` events update
  `turns` / `phase` while it runs — the card shows `work → verify` live, and the agent's
  dock Loop panel shows the same loop.
- **Peer:** the same `loop.*` events arrive through the collector; the final reply through
  `ReadTranscript`.
- **Outcome** (`Recurrence.OutcomeOfLoop`):

  | loop resolution | outcome | summary |
  |---|---|---|
  | `done · verified` | the result line's: **ok** or **attention** (no line → ok) | the result line's text |
  | `escalate · needs-human` | **attention** | the agent's `NEEDS_HUMAN:` question |
  | `capped` | **failed** | "not verified within N turns" |
  | `stopped · by-operator` | **failed** | "stopped by the Operator" |
  | `error` (incl. `no-reply`, `repo-missing`) | **failed** | the loop's detail |

  The result line is the last `RUN OK|ATTENTION: …` line of the final reply (it cannot be
  the final line — that is `GOAL_VERIFIED`). Parsed deterministically, no model.
- A run still `running` when the harness restarts: the loop record survives in
  `loops.json` and the engine resumes it; the run record is re-attached by `armedBy` +
  agent. A run whose loop record is gone is closed as `unreported · harness restarted`.

## D6 — Safety

- **Gate:** arming already requires the Operator's `AutopilotGate`, and the engine stops
  ticking when it closes. The scheduler holds while closed; API mutations answer 403;
  reads stay open with instructions redacted (the `/autopilot/loops` precedent).
- **Explicit arming:** "loops are armed only by explicit user action" — creating/enabling
  a recurring card *is* that action, standing for every occurrence; the card says so. The
  loop's `armedBy: recurring` makes every such loop attributable in the dock, the console
  and the audit.
- **Every send is already audited** (`autopilot-audit.jsonl`: kind, phase, exact sent text,
  briefing revision) — the per-turn trail of a run comes free; the run row links to it.
- **Self-pause:** 3 consecutive `failed`/`refused` runs → paused, attention badge.
  `escalate` does not count as a failure (the agent asked a question; that is attention).
- **Plan usage:** a goal run is ≥ 2 turns, so the usage guard moves from "later" to the
  first build: skip (recorded) when the account's 5-hour window is above the card's
  threshold (default 85 %), using the usage the fleet poll already has.
- **Policeman:** must not read a recurring run's words as progress on a board card — it
  can tell by the loop's `armedBy`. Build task.
- **Events:** `recurring.fired | recurring.ended | recurring.skipped | recurring.paused`
  on the harness feed next to the loop's own `loop.*` events.

## D7 — API

`[Route("api/recurring")]`: `GET /` (cards + next due + hold reason + the live run's phase
and turns + last run + the last 20 outcomes for the strip) · `POST /` · `PATCH /{id}` ·
`DELETE /{id}` · `POST /{id}/run` (Run now; same ladder minus the clock) ·
`POST /{id}/pause|resume` · `POST /{id}/stop` (stops the running loop — `LoopArmer.Stop`) ·
`GET /{id}/runs?before=&limit=`. Client polls `GET /` every 5 s while visible.

## D8 — UI

Tab key `recurring`, after `kanban`. `RecurringTab.jsx` + pure `recurringCards.js` (+
tests) + `recurring.css` (`rc__`). Card order: needs-attention first, then by next due,
paused last. A running card shows the loop's phase chips (`work → verify`, the
`LoopStateStrip` vocabulary) and its turn count; the history table has a **turns** column
and says whether the run was verified. The mock in `understanding-app/` is the visual
proposal.

## Decisions taken (Operator, 2026-09-19: "regarding the open questions just follow your own ideas and build it")

1. **`single` mode stays**, per card; the default is `goal`.
2. **Turn budget** default 6 (2–30 per card).
3. **Busy / slot in use:** per card, default **hold** until free; `skipWhenBusy` records a skip instead.
4. **The loop slot is borrowed:** the agent's previous inactive loop record is snapshotted
   before arming and restored when the run resolves (`LoopConfigStore.SnapshotInactive` /
   `RestoreSnapshot`, which only restores over the recurring run's own resolved loop). Local
   agents only — a peer's slot keeps showing the recurring goal (no peer API for it yet).
5. **Ownership:** the harness the card was created on owns it and arms peers' agents over
   the fleet (`POST /api/arch/peer/loop`, now carrying `by: "recurring"`).
6. **Claimed repos:** armed anyway; per card "only on the default branch" (default off) holds instead.
7. **Schedules:** `interval` and `daily` only.
8. **Who creates cards:** the Operator, in the tab.
9. **Session:** the agent's own conversation (the goal loop pins the dock's session).

## Found while building

- **An agent nobody has spoken to yet.** The loop engine refuses to drive a repo agent that
  has no session ("wait for the agent to speak") — in two places. The first real run armed
  the loop and then sat forever. Arch conversations already had an exemption (the send
  starts the conversation and the engine pins the session the CLI creates); loops armed by
  a recurring task now share it (`LoopConfigStore.IsRecurring`). A schedule has to work on
  a fresh agent. The run's conversation has no dock tab until the Operator opens one.
- **Peers:** the peer loop API attributed every loop to `arch@<machine>`; it now accepts
  `by: "recurring"` → `recurring@<machine>`, so the exemption and the slot-hold wording
  work on a peer on this build. An older peer ignores the field and still runs the loop
  (as `arch@<hub>`), provided its agent has a conversation.
- **`single` mode locally needs the repo in the arch's scope** — it rides
  `IAgentDirectory.SendToAgent`, which refuses unmanaged repos. `goal` mode does not.
- **Everything is polled, nothing is subscribed:** the engine asks the loop store (or the
  peer's `/loops`) how the run's loop stands each tick, recognising its loop by the arming
  generation. A restart therefore re-attaches by itself, and a slot re-armed by someone
  else is detected (`lost`) instead of being mistaken for this run's result.
