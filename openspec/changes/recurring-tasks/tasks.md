## 0. Design pass (this commit — no PR)

- [x] 0.1 Investigate the existing machinery: loops / queue loop / arch quiet floor, board
      dispatch and the fleet send path, run-outcome observability, Management tabs + Kanban.
- [x] 0.2 Proposal, design, delta specs (`recurring-tasks` capability + the Management tab).
- [x] 0.3 Interactive mock of the tab + the design walk-through in `understanding-app/`.
- [x] 0.4 Prototype the pure scheduling core (`Services/Recurring/Recurrence.cs` — grid,
      coalescing, decision ladder, closing-line parser, envelope) with unit tests. Not
      registered in DI; the harness behaves exactly as before.
- [ ] 0.5 **Operator direction on the open questions** (design.md) — blocks everything below.

## 1. Backend

- [ ] 1.1 `RecurringTaskStore` (`recurring.json`, atomic writes) + `RecurringRunLog`
      (`recurring-runs.jsonl`, replace-by-id, startup compaction, 500 per card).
- [ ] 1.2 `IAgentDirectory.SendToAgent(..., actor)`; user bubble + audit kind `recurring`.
- [ ] 1.3 `RecurringScheduler` hosted service (10 s): `Recurrence.Decide` per card, gate,
      loop-active and precondition holds, fire → run record `running`; `Task.Yield()`
      before the first pass (the verifier-startup lesson).
- [ ] 1.4 Run closer: `RunCompleted` (local) and collected `turn.ended` + `ReadTranscript`
      (peer) → outcome, summary, duration, cost; dangling `running` closed at startup;
      self-pause after 3 consecutive failed/refused.
- [ ] 1.5 `RecurringController` (`api/recurring`), gate-fenced mutations, redaction while
      the gate is closed; feed events `recurring.*`.
- [ ] 1.6 Policeman ignores turns with actor `recurring` when reading an assignee's words.

## 2. Management tab

- [ ] 2.1 `recurring` tab registration, i18n, pane css.
- [ ] 2.2 `recurringCards.js` (ordering, countdown/hold words, strip, history rows) + tests.
- [ ] 2.3 `RecurringTab.jsx`: composer, cards, editors, Run now / Pause / Delete, history,
      attention count on the tab label, gate banner. Rebuild + commit `events-app/manage`.

## 3. Verify

- [ ] 3.1 .NET + client suites; headless on an isolated instance with a 5-min card against a
      scratch repo: fires on the grid, holds while busy, records the closing line, Run now,
      self-pause, restart closes a dangling run.

## 4. Ship

- [ ] 4.1 PR on the Operator's word.
