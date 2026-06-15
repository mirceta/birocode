# Understanding — Scoreboard / analytics

## Goal

A **scoreboard / analytics** view over agent activity. Metrics the user asked
for:

1. **Longest-running agent** (single longest run / total).
2. **Max agents running at the same time** (peak concurrency).
3. **Prompts sent today** (count).
4. **Graphs** for the above (timeline / charts).
5. **Per agent:** the window it was used (from → to), its **idle time** vs
   **work time**.
6. **All agents combined:** total work time.

## This step

- On `main` synced with `origin/main` (confirmed); branch
  `feature/scoreboard-analytics` created.
- Add an **Active feature plans** entry in `plan.md` + write the plan
  (`plans/scoreboard-analytics.md`). Design/plan only — not built.

## Decisions (locked)

- **Data source:** a new append-only **`activity.jsonl`** events ledger (run
  start/finish, per repo) — the `deploys.jsonl` pattern. The in-memory `CallLog`
  is live-only, so the ledger is what makes "today"/history accurate.
- **Work vs idle:** a *run* is one prompt→answer (CLI start→finish). **Work** =
  sum of run durations; an agent's **window** = first start→last finish;
  **idle** = window − work; **peak concurrency** = max overlapping runs.
- **"Today":** local midnight on the host.
- **UI:** a **panel on the dashboard, above the agent docks** (not a new tab);
  hand-rolled **SVG** charts (no lib).
- **Backfill** (reconstructing pre-ledger history from transcripts): **deferred**
  to a future feature; noted in the plan.

Design recorded in `plans/scoreboard-analytics.md`. Next: build once confirmed.
