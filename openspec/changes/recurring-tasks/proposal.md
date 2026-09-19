# Recurring tasks: scheduled goal loops for repo agents, as cards with a run history

**Status: BUILT on `feature/recurring-tasks-design` (Operator 2026-09-19: "follow your own ideas
and build it"); not pushed, no PR.** (Fleet task 31d0fd28.) The open questions were settled with
the proposed defaults — see design.md § Decisions taken and § Found while building.

Revision 2 takes the Operator's correction of the first draft: a scheduled run is **a goal
loop, not one prompt**. Unattended work needs the thing the harness already built for
unattended work — keep sending the work prompt until the agent declares `LOOP_DONE`, then
send a verification prompt, and accept only `GOAL_VERIFIED`.

## Why

The Operator wants work that happens **on a schedule inside a repo agent** — "every two
hours check CI", "every morning pull main and report drift" — modelled in the Management
dashboard as cards: an assigned repo agent, instructions, a time interval, and a history
of every run with its outcome.

Nothing in the harness does this today. Investigated before designing:

- **Loops** (`AutopilotService`, `LoopConfigStore`) are *turn-end* triggered, never
  wall-clock, with one loop slot per agent; no loop record has an interval, and the arch
  loop tools refuse a `cron` kind on purpose. So the *clock* is missing — but the **goal
  loop is exactly the right way to run one occurrence**: work until `LOOP_DONE`, verify
  against the actual repo state, `GOAL_VERIFIED` or back to work, `NEEDS_HUMAN` escalates,
  a cap bounds it, every send is briefed and audited, reply-less runs are retried.
- **One arming path exists** (`LoopArmer.Start`, shared by the dock panel, the arch's
  `start_loop` and the agent's `arm_my_loop`), and it already reaches **peers**
  (`FleetClient.Loop` → `POST /api/arch/peer/loop`).
- **Loop resolutions are already events** (`loop.done | escalated | capped | error |
  stopped`, with reason, detail, iterations and `armedBy`) on the harness feed, collected
  across the fleet.
- **Board cards** assume delivery and git/PR verification; a recurring task never delivers.

## What changes

1. **A new entity, the recurring task** — `recurring.json`, many per agent, independent of
   the board: title, assignee (`sourceId|repoId`), instructions, schedule, run mode and
   turn budget, options, enabled flag, counters.
2. **A scheduler** (hosted service, 10 s) deciding per card: idle / hold / fire / skip.
   Occurrences sit on a **fixed grid**, missed ones **coalesce into one catch-up run**, and
   everything is fenced by the **Operator's autopilot gate**.
3. **Fire = arm a goal loop** on the assignee through `LoopArmer` (peer: `FleetClient.Loop`),
   `armedBy: recurring`, goal = the card's instructions in a short envelope (task, run
   number, previous run's outcome, the result-line contract), cap = the card's turn budget.
   The existing engine drives it; the agent's dock Loop panel shows it live.
4. **The agent's one loop slot is the arbiter.** Slot or run slot in use → the occurrence is
   **held** and shown as such; two cards on one agent run one after the other. The slot is
   **borrowed**: the Operator's previous loop parameters are restored after the run.
5. **The run's outcome is the loop's resolution**: `verified` → the agent's result line
   (`RUN OK: …` / `RUN ATTENTION: …`, placed above `GOAL_VERIFIED`); `needs-human` →
   attention with the agent's question; `capped`, `error`, Operator stop → failed. Read
   deterministically — no model, no arch relay.
6. **A run history** — `recurring-runs.jsonl`: due, trigger, loop status and stop reason,
   turns, duration, cost, outcome, one-line summary, session. The per-turn trail is the
   existing autopilot audit.
7. **A Management tab, "Recurring"** (after Kanban): one column of cards sorted by next run
   — assignee chip with ⧉, schedule in words, next run or hold reason, live `work → verify`
   phase while running, last outcome, and a **run strip** of the last 20 runs. Expanded:
   instructions/schedule/run-mode editors, **Run now**, **Stop run**, Pause/Resume, history.
   The tab label counts cards needing attention.
8. **Safety rails**: min interval 5 min; turn budget per run (default 6); self-pause after
   3 consecutive failed/refused runs; **plan-usage guard** (skip above a 5-hour-window
   threshold — a goal run is at least two turns); optional "only on the default branch".
9. **`single` mode stays as a per-card option** for trivial read-only checks (one prompt,
   closing line). Default is `goal`.

## Better ideas folded in

- **A run is a goal loop** (the Operator's) — and with it, for free: verification,
  escalation, caps, briefing, audit, the dock's live loop display, the Stop button.
- **`RUN ATTENTION`** as a first-class outcome; **the run strip**; **"Previous run: …"** in
  the goal text; **coalesced catch-up**; **self-pause**; **borrowed loop slot**.
- Later: **escalate to the board** (ATTENTION/FAILED → a Kanban card for the same agent);
  agents/arch may **propose** a recurring task (created paused).

## Non-goals (this change)

No cron strings. No replication of recurring cards between harnesses (exactly one scheduler
may own a card). No new loop kind and no change to the goal loop's semantics. No pre-empting
or cancelling a running turn except the Operator's own Stop.

## Decisions

The nine open questions of the design pass were settled with the proposed defaults on the
Operator's word ("just follow your own ideas and build it") — `design.md` § Decisions taken.
What the build itself turned up is in § Found while building.
