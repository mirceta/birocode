# Design

## D1 — A new entity, not a loop kind and not a board card

| Option | Verdict |
|---|---|
| A fifth loop kind (`cron`) in `LoopConfigStore` | **Rejected.** One slot per agent is structural; a schedule needs *many per agent*. Loop semantics are "resend until a sentinel"; a recurring run is one complete unit. The arch loop tools already refuse `cron` on purpose. |
| A board `Node` with a `Recurrence` field | **Rejected.** The board's lifecycle, `BoardVerifier`, `BoardIntegrity` (stuck/dishonest), the policeman's `InFlight` reading and the aggregate status all assume a card that gets delivered. A recurring task never is; it would need an exemption in each. |
| **Own store + own scheduler, existing send path and UI vocabulary** | **Chosen.** New: `RecurringTaskStore`, `RecurringRunLog`, `RecurringScheduler`, `RecurringController`, the tab. Reused: `IAgentDirectory.SendToAgent`, the run slot, `AutopilotGate`, `RunSessionService.RunCompleted`, the collected feed, `/arch/fleet/status` for the assignee picker, the board's assignee key/colours/⧉ button, `StatusBadge`. |

## D2 — Data model

```jsonc
// recurring.json — [RecurringTask]
{
  "id": "9f2c…", "title": "CI health check",
  "sourceId": null, "repoId": "c7a9…",            // the board's assignee key: sourceId|repoId (null = this harness)
  "instructions": "Look at the last 10 GitHub Actions runs on main…",
  "schedule": { "kind": "interval", "everyMinutes": 120 }
           // { "kind": "daily", "at": "07:00", "days": ["Monday", …] }   (hub-local time)
  "policy":   { "catchUp": true, "skipWhenBusy": false, "holdWhileLoopActive": true,
                "requireDefaultBranch": false },
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
  "status": "done",                                  // running | done | error | stopped | skipped | refused
  "sentAt": …, "endedAt": …, "durationMs": 48211, "costUsd": 0.07,
  "outcome": "attention",                            // ok | attention | failed | unreported   (null while running / when not sent)
  "summary": "2 of the last 10 runs on main failed (deploy.yml) — see run 8841",
  "reason": null,                                    // skipped/refused: "agent busy", "peer unreachable", "gate closed", …
  "sessionId": "…", "machine": "DESKTOP-POAPPP3", "agent": "birocode" }
```

## D3 — Scheduling semantics (prototyped: `Services/Recurring/Recurrence.cs`, pure, unit-tested)

- **Fixed grid.** Interval occurrences are `anchor + k·every` — a late or long run never
  shifts the next one. Creating a card does not fire it; the first occurrence is one
  interval after the anchor ("Run now" covers the impatient case). Daily occurrences are
  hub-local wall-clock times on the allowed weekdays (a time swallowed by the DST gap moves
  one hour forward).
- **One pending occurrence per card.** When several occurrences have passed unhandled
  (harness down, gate closed, agent busy), the pending one is the **newest**, and the run
  records `missed: n` and trigger `catch-up`. After downtime a card runs **once**, not n
  times. With `catchUp: false` a run that cannot go out within 10 min of its time is
  recorded as `skipped` instead.
- **Decision ladder per tick** (`Recurrence.Decide`): disabled → idle · not yet due →
  idle(next) · gate closed → **hold** · external hold reason (active drive loop,
  precondition) → **hold** · agent busy → **hold** (or **skip** with `skipWhenBusy`) · else
  **fire**. A hold writes nothing to history; it shows on the card as the reason the run is
  waiting. Fire and skip move `lastHandledDueAt`.
- **Busy is never a queue.** The arch-agent spec's rule ("contention is arbitrated by the
  run slot only; nothing is queued or stashed") holds: the occurrence stays pending in the
  *scheduler*, and the send is attempted again on a later tick. `SendToAgent` answering
  `busy` (a race) is the same hold.
- **Minimum interval 5 min**, maximum 30 days.

## D4 — The send

`IAgentDirectory.SendToAgent` gains an `actor` parameter (today it is fixed to `arch`), so
the user bubble reads `🔁 recurring · <title>` and the audit row has kind `recurring`.
Everything else is the existing path: local → `StartRepoTurn` (run slot, dock session, MCP
config, `FollowSession`); peer → fleet posture checks, then `POST /api/arch/peer/send`
(the receiver's accept-sends + gate apply). A refusal becomes a `refused` run with the
named reason — history stays honest about sends that never left.

Envelope (`Recurrence.ComposePrompt`):

```
[Recurring task] CI health check
Recurring id: 9f2c… · run #42 · due 2026-09-19 14:00 · every 2 h · sent by the harness scheduler on DESKTOP-POAPPP3
Previous run: 2026-09-19 12:00 — OK: all 10 runs green

<instructions>

This is an unattended, recurring run. Do what the instructions say and nothing else; …
End your reply with ONE closing line, exactly one of:
"RUN OK: <one-line result>" · "RUN ATTENTION: <what the Operator should look at>" · "RUN FAILED: <why>".
```

## D5 — Learning how the run ended

- **Local:** a hosted service subscribes to `RunSessionService.RunCompleted` (template:
  `DockUnseenResultTrigger`). The scheduler's send claimed the builder slot, so the next
  completion for that `repoId`/`builder` is this run. Reply text: the transcript's last
  assistant message, else `RunSession.ReplyText` when `ReplyTextAtUtc > sentAt` (the loop
  engine's freshness guard). Cost/turn count from the `turn.ended` event.
- **Peer:** watch the collected feed for that source+repo's `turn.ended` after `sentAt`,
  then `ReadTranscript(sourceId, repoId, tail)`.
- **Outcome** (`Recurrence.OutcomeOf`): run `error` → failed; `stopped` → failed ("stopped
  by the Operator"); `done` → parse the **final non-empty line** (markdown-tolerant) for
  `RUN OK|ATTENTION|FAILED: …`; no such line → `unreported` with the last line as summary.
- A run still `running` when the harness restarts is closed as `unreported · harness
  restarted` on startup (never left dangling).

## D6 — Safety

- **Gate:** the scheduler does nothing while `AutopilotGate` is closed; mutating API
  routes answer 403 like the loop routes; reading cards/history stays open (with
  instructions redacted while closed, the `/autopilot/loops` precedent).
- **Explicit arming:** a card is created by an Operator action in the tab. (Later: arch /
  agent tools may *propose* a card; it is created paused.)
- **Self-pause:** 3 consecutive `failed`/`refused` runs → `enabled: false`,
  `pausedReason: "auto: …"`, attention badge. Resume re-anchors the grid.
- **Drive loop active on the agent** → hold (default). A loop judges "the reply after my
  send"; an interleaved recurring turn would be judged as the loop's reply.
- **Policeman:** its `Said` reading must ignore turns whose user bubble has actor
  `recurring`, or a recurring run's words are read as progress on an in-flight board card.
  (Listed as a build task.)
- **Events:** `recurring.fired | recurring.ended | recurring.skipped | recurring.paused`
  on the harness feed, so the Events tab shows them; none of them wakes the arch in v1.

## D7 — API

`[Route("api/recurring")]`: `GET /` (cards + next due + hold reason + last run + the last
20 outcomes for the strip) · `POST /` · `PATCH /{id}` · `DELETE /{id}` ·
`POST /{id}/run` (Run now; same ladder minus the clock) · `POST /{id}/pause|resume` ·
`GET /{id}/runs?before=&limit=` (history page). Client polls `GET /` every 5 s while
visible (the Kanban cadence).

## D8 — UI

Tab key `recurring`, after `kanban` (`ManageApp.jsx` TABS / weights / label / pane, i18n,
`.mg__pane--recurring`). `RecurringTab.jsx` + pure `recurringCards.js` (+ tests) +
`recurring.css` (`rc__` prefix). Card order: needs-attention first, then by next due,
paused last. The interactive mock in `understanding-app/` is the visual proposal.

## Open questions

1. **Session model.** v1 sends into the agent's own dock conversation (what "sent to that
   repo agent" says; visible where the Operator already looks). Cost: recurring chatter in
   the working conversation and a growing context. Alternative: a dedicated thread per
   card (clean, reproducible, cheap) — needs `StartRepoTurn` to run a session the dock tab
   does not follow. Which do you want as the default?
2. **Busy default:** hold until idle (proposed) or skip this occurrence?
3. **Active drive loop on the agent:** hold (proposed), skip, or send anyway?
4. **Ownership of a card assigned to a peer's agent:** the hub owns and sends over the
   fleet (proposed; one store, fires only while the hub is up) — or the card lives on the
   assignee's harness (fires without the hub; the tab then has to aggregate cards across
   machines)?
5. **Claimed repos:** `SendToAgent` overrides a claim. Should a *scheduled* send respect it
   (skip while the repo sits on a branch nobody assigned), or offer it per card
   (`requireDefaultBranch`, proposed off by default)?
6. **Schedules:** are "every N min/h/d" and "daily at HH:mm on these weekdays" enough, or
   do you need cron-style ("first Monday", "every 15 min between 9 and 17")?
7. **Who may create cards:** Operator only (proposed v1) — or also the arch agent / a repo
   agent proposing one for itself (created paused)?
8. **Next-step ideas — want them in the first build?** plan-usage guard (skip when the
   5-hour window is above X %), escalate ATTENTION/FAILED to a Kanban card, instruction
   templates from the prompt library.
