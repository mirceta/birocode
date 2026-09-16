## 1. Backend

- [x] 1.1 `BoardIntegrity.BoardCheck` actor; the judge stamps / clears only its own; legacy "policeman" mechanical stamps migrate; going manual drops both checkers' marks.
- [x] 1.2 `BoardCheckJournal`: bounded, persisted, coalescing; `ForCard`, `CardsSeen`, `Passes`.
- [x] 1.3 `TaskVerificationPoller.VerifyOnce(trigger)` journals every pass (moves, raised / cleared, verdict, error, duration); triggers startup · timer · operator · policeman; `Running`, `LastAt`, `NextDueAt`.
- [x] 1.4 `GET /api/taskgraph/boardcheck[?card=&take=]`.
- [x] 1.5 Tests: coalescing and the exact count, a new row on any change, bounded + card timeline, restart, `Describe`, the actor split (the conversation's flag survives, the legacy stamp migrates).

## 2. Client

- [x] 2.1 `boardCheck.js` (pure words) + node test.
- [x] 2.2 `BoardCheckPanel.jsx`: bar, verdict, History (journal table, card picker → timeline, flagged now), What it is (five steps, writes, nevers, two writers side by side).
- [x] 2.3 Kanban subtabs 📋 Board · 🔎 Board check · 👮 Policeman; the board header's check line under 🔎; `by: board-check` reads as the auto-verifier on the card.
- [x] 2.4 UI evidence: `client/tests/ui/shot-kanban-boardcheck.mjs` → `docs/screenshots/kanban-boardcheck-{history,card,explain}.png`.

## 3. Understanding

- [x] 3.1 Understanding app tab 4 "Two checkers → one" (today's two writers; the merged loop); unit + screenshot tests.

## 4. Ship

- [ ] 4.1 PR; merge + deploy on the Operator's word.
