# Recurring tasks: scheduled work for repo agents, as cards with a run history

**Status: DESIGN PASS — proposal for the Operator to react to. Nothing is wired into the
harness yet; no PR.** (Fleet task 31d0fd28, Operator 2026-09-19.)

## Why

The Operator wants work that happens **on a schedule inside a repo agent** — "every two
hours check CI", "every morning pull main and report drift" — modelled in the Management
dashboard as cards: an assigned repo agent, instructions, a time interval, and a history
of every run with its outcome.

Nothing in the harness does this today. Investigated before designing:

- **Loops** (`AutopilotService`, `LoopConfigStore`) are *turn-end* triggered, never
  wall-clock: a drive loop fires on the agent's next idle tick after its turn ends and
  runs *until done*. There is one loop slot per agent by design ("exclusive arming is
  structural"), there is no interval field, and the arch loop tools explicitly refuse a
  `cron` kind. The only wall-clock send in the codebase is the arch "quiet floor"
  (`ArchDrivenPolicy`), fenced to `@arch` conversations.
- **The queue loop** drains a dock tab's stash one prompt per turn — a to-do list, not a
  schedule.
- **Board cards** have a delivery lifecycle (todo → … → pr-merged), git/PR verification and
  the policeman. A recurring task never "delivers", so it would have to be exempted from
  every one of those rules.
- **The send path is reusable as it is**: `IAgentDirectory.SendToAgent(sourceId, repoId,
  text)` reaches a local agent (`StartRepoTurn`: run slot, user bubble with provenance, CLI
  run) or a peer (`FleetClient` → `POST /api/arch/peer/send`, with the fleet posture
  checks), and answers `sent | busy | unmanaged | …` without queueing anything.
- **Run outcomes are observable**: `RunSessionService.RunCompleted` (exactly once per
  turn, with the witnessed reply on the `RunSession`) locally; `turn.ended` on the
  collected feed plus `ReadTranscript` for a peer.

## What changes

1. **A new entity, the recurring task** — `recurring.json` in the data dir, many per agent,
   independent of the loop slot and of the board: title, assignee (`sourceId|repoId`, the
   board's key), instructions, schedule, options, enabled flag, counters.
2. **A scheduler** (`RecurringScheduler`, a hosted service on the 10 s cadence the loop
   engine uses) that decides per card: idle / hold / fire / skip. Occurrences sit on a
   **fixed grid** (no drift), missed occurrences **coalesce into one catch-up run**, a busy
   agent **holds** the occurrence until idle (the run slot stays the only arbiter — nothing
   is queued in the agent), and the whole thing is fenced by the **Operator's autopilot
   gate** like every other unattended send.
3. **A send with provenance** through the existing path, as actor `recurring`, wrapped in a
   short envelope that names the task, the run number, the previous run's outcome (memory
   across runs without owning a session) and a **closing-line contract**:
   `RUN OK: …` | `RUN ATTENTION: …` | `RUN FAILED: …`.
4. **A run history** — `recurring-runs.jsonl`, one record per occurrence: due, sent, ended,
   trigger (schedule / catch-up / manual), status (running / done / error / stopped /
   skipped / refused), the parsed outcome and its one-line summary, duration, cost, session
   id. The closing line is parsed **deterministically** from the reply's final line (the
   board's closing lines need the arch LLM; this must not).
5. **A Management tab, "Recurring"** (after Kanban): one column of cards sorted by next run.
   A card shows the assignee chip with the ⧉ worker-window button, the schedule in words,
   the next-run countdown or the reason it is being held, the last outcome, and a **run
   strip** — the last 20 runs as coloured squares, the way CI history reads. Expanded:
   instructions and schedule editors, options, **Run now**, Pause/Resume, and the history
   table. The tab label carries the count of cards needing attention.
6. **Safety rails**: minimum interval 5 min; a card **pauses itself** after 3 consecutive
   failed/refused runs; an occurrence is held while the agent has an **active drive loop**
   (the loop owns the agent); optional precondition "only on the default branch".

## Better ideas folded in (beyond the brief)

- **`RUN ATTENTION`** as a first-class outcome: a recurring check mostly says "fine"; the
  value is the run that says "look at this". It badges the card and the tab.
- **The run strip** — health at a glance without opening anything.
- **"Previous run: …" in the envelope** — continuity across runs without a dedicated
  session and without growing a private context.
- **Coalesced catch-up** instead of replaying every missed occurrence after downtime.
- **Self-pause on repeated failure** so a broken schedule cannot burn the plan every 15 min.
- **Plan-usage guard** (next step): skip a run when the account's 5-hour window is above a
  threshold — the data is already in the fleet poll (By plan / accounts).
- **Escalate to the board** (next step): on ATTENTION/FAILED, optionally create a Kanban
  card for the same agent — recurring tasks *detect*, board cards *track the fix*.

## Non-goals (this change)

No cron strings. No replication of recurring cards between harnesses (exactly one scheduler
may own a card, or it double-fires). No arch/agent tools for creating recurring tasks yet
(proposed later, created *paused*). No pre-empting or cancelling a running turn, ever.

## Open questions for the Operator

See `design.md` § Open questions — the ones that change the build are: session model
(agent's conversation vs. a thread per task), whether a held occurrence should wait or
skip by default, what to do while a drive loop is active, who owns a card assigned to a
peer's agent, and whether scheduled sends may override a "claimed" repo.
