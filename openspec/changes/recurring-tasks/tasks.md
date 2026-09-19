## 0. Design pass (no PR)

- [x] 0.1 Investigate the existing machinery: loops / queue loop / arch quiet floor, board
      dispatch and the fleet send path, run-outcome observability, Management tabs + Kanban.
- [x] 0.2 Proposal, design, delta specs (`recurring-tasks` capability + the Management tab).
- [x] 0.3 Interactive mock of the tab + the design walk-through in `understanding-app/`.
- [x] 0.4 Prototype the pure scheduling core (`Services/Recurring/Recurrence.cs`) with unit
      tests. Not registered in DI; the harness behaves exactly as before.
- [x] 0.5 **Revision 2 (Operator 2026-09-19): a run is a goal loop.** Design D4–D6, specs,
      mock and prototype (`ComposeGoal`, `FindResultLine`, `OutcomeOfLoop`) reworked:
      fire = `LoopArmer.Start(kind goal, by recurring)`, outcome = the loop's resolution.
- [x] 0.6 Operator direction: "follow your own ideas and build it" — decisions recorded in design.md.

## 1. Backend

- [x] 1.1 `RecurringTaskStore` (`recurring.json`, atomic writes) + `RecurringRunLog`
      (`recurring-runs.jsonl`, replace-by-id, startup compaction, 500 per card).
- [x] 1.2 `LoopConfigStore.ArmedByRecurring`; `LoopArmer` accepts it; the peer loop API
      carries it (`recurring@<machine>`).
- [x] 1.3 Slot borrowing: snapshot the agent's inactive loop record before arming, restore
      it when the recurring loop resolves (precedent: `RestoreStandingLoopIfNeeded`).
- [x] 1.4 `RecurringScheduler` hosted service (10 s): `Recurrence.Decide` per card; holds
      for gate / run slot / loop slot in use / precondition / plan usage; fire → arm →
      run record `running`; `Task.Yield()` before the first pass.
- [x] 1.5 Run closer → `Recurrence.OutcomeOfLoop`. BUILT AS POLLING, not a feed subscription: each
      tick probes the loop slot (local store / the peer's `/loops`) and recognises its loop by the
      arming generation — restart-safe, and a re-armed slot is detected as `lost`. Self-pause.
- [x] 1.6 `single` mode: `IAgentDirectory.SendToAgent(..., actor)` + `RunCompleted` closer.
- [x] 1.7 `RecurringController` (`api/recurring`, incl. `stop`), gate-fenced mutations,
      redaction while the gate is closed; feed events `recurring.*`.
- [x] 1.8 Policeman ignores an assignee's words when the newest user message is a recurring run's
      (`Recurrence.IsRecurringTail`).
- [x] 1.9 Loops armed by a recurring task may start the agent's conversation (both no-session guards
      in `AutopilotService`); the peer loop API carries `by: "recurring"` → `recurring@<machine>`.

## 2. Management tab

- [x] 2.1 `recurring` tab registration, i18n, pane css.
- [x] 2.2 `recurringCards.js` (ordering, countdown/hold words, phase, strip, history rows) + tests.
- [x] 2.3 `RecurringTab.jsx`: composer, cards, editors, Run now / Stop run / Pause / Delete,
      history, attention count on the tab label, gate banner. Rebuild + commit `events-app/manage`.

## 3. Verify

- [x] 3.1 .NET 638+ / client 170 green. Headless on an isolated instance with a scratch repo and a REAL
      goal loop (`.claudeweb-preview/playwright/verify-recurring-tasks.mjs`, 34/34): create + validation;
      Run now refused while an Operator loop holds the slot (nothing recorded); Run now arms a drive
      goal loop armed by `recurring` on an agent with NO conversation yet; work → verify → verified in
      2 turns / 31 s with `RUN OK: 4 files in repo root — …`; the Operator's recipe record back in the
      slot; repo untouched; strip/history/badge in the tab; pause/resume/edit; restart with the gate
      closed: card + history kept, instructions withheld, 403s, banner, Pause works; delete.
      Unit-tested instead of E2E: holds on the grid, catch-up, capped = failed, NEEDS_HUMAN =
      attention, self-pause, usage skip, lost slot, Stop run, single mode, restart re-attach.

## 4. Ship

- [ ] 4.1 PR on the Operator's word.
