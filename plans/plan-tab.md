# Plan Tab — always-visible current plan

> **Status (2026-06-11):** In development on `feature/plan-tab`.

## Problem

While Claude works on a feature, the plan of what is being built lives in
chat scrollback — on a phone that is the worst place to reconstruct context.
The user wants a one-tap view of "what are we building, what's done, what's
next" so both Operator and End User can re-anchor at any time.

## Design

A **Plan tab** that renders the file **`plan.md` at the Repo root**, when it
exists. The contract is deliberately minimal:

- `plan.md` present → that is the current plan; the tab renders it as
  markdown (mermaid included, via the shared `Markdown` component).
- `plan.md` absent → the tab shows a friendly "no active plan" empty state.
- The file's lifecycle is the signal: Claude creates `plan.md` when starting
  a feature, keeps it updated while working, and deletes it when the feature
  ships. Repo-agnostic — works for any registered project with zero setup.

In this repo (Self-Development) the durable design record remains
`plans/<feature>.md` per the existing convention; the root `plan.md` is the
ephemeral working copy tuned to the feature in flight.

## Implementation

- **No backend changes.** The tab reads the file through the existing
  `GET /api/files/read?path=plan.md` endpoint (FileService path validation
  applies; 404 → empty state).
- `client/src/pages/Plan.jsx` — fetches on mount, on repo switch, on
  visibilitychange, and polls every 5 s while visible so the plan updates
  live as Claude edits it. Renders via the shared `Markdown` component.
- Route `/studio/plan` in `App.jsx`; nav entry in `BottomNav.jsx` and
  `PaneStrip.jsx` (order kept in sync, after Files).
- Capability `planTab: 'advanced'` in `UiModeContext.jsx` (new-features-
  default-to-Advanced convention).
- i18n strings in `en.json` / `tr.json`.
