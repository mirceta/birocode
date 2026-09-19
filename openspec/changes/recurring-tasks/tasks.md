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
- [ ] 0.6 **Operator direction on the open questions** (design.md) — blocks everything below.

## 1. Backend

- [ ] 1.1 `RecurringTaskStore` (`recurring.json`, atomic writes) + `RecurringRunLog`
      (`recurring-runs.jsonl`, replace-by-id, startup compaction, 500 per card).
- [ ] 1.2 `LoopConfigStore.ArmedByRecurring`; `LoopArmer` accepts it; the peer loop API
      carries it (`recurring@<machine>`).
- [ ] 1.3 Slot borrowing: snapshot the agent's inactive loop record before arming, restore
      it when the recurring loop resolves (precedent: `RestoreStandingLoopIfNeeded`).
- [ ] 1.4 `RecurringScheduler` hosted service (10 s): `Recurrence.Decide` per card; holds
      for gate / run slot / loop slot in use / precondition / plan usage; fire → arm →
      run record `running`; `Task.Yield()` before the first pass.
- [ ] 1.5 Run closer over the feed's `loop.fired` (turns, phase) and `loop.done | escalated
      | capped | error | stopped` (`armedBy recurring`) → `Recurrence.OutcomeOfLoop`;
      peers via the collector + `ReadTranscript`; re-attach after a restart; self-pause.
- [ ] 1.6 `single` mode: `IAgentDirectory.SendToAgent(..., actor)` + `RunCompleted` closer.
- [ ] 1.7 `RecurringController` (`api/recurring`, incl. `stop`), gate-fenced mutations,
      redaction while the gate is closed; feed events `recurring.*`.
- [ ] 1.8 Policeman ignores loops armed by `recurring` when reading an assignee's words.

## 2. Management tab

- [ ] 2.1 `recurring` tab registration, i18n, pane css.
- [ ] 2.2 `recurringCards.js` (ordering, countdown/hold words, phase, strip, history rows) + tests.
- [ ] 2.3 `RecurringTab.jsx`: composer, cards, editors, Run now / Stop run / Pause / Delete,
      history, attention count on the tab label, gate banner. Rebuild + commit `events-app/manage`.

## 3. Verify

- [ ] 3.1 .NET + client suites; headless on an isolated instance with a 5-min card against a
      scratch repo: arms on the grid, work → verify → verified with a result line, holds
      while the slot is in use and restores the previous loop record, capped run = failed,
      NEEDS_HUMAN = attention, Run now, Stop run, self-pause, restart re-attaches.

## 4. Ship

- [ ] 4.1 PR on the Operator's word.
