# Plan Tab — raw text view

> **Status (2026-06-11):** Deployed and confirmed. Live on the :5099 harness,
> browser-verified (`.claudeweb-preview/playwright/verify-plan-raw-view.mjs`,
> 14/14 checks) and confirmed by the End User.

## Problem

The Plan tab always renders plan files as markdown. When the user wants to
see the actual source — link targets, status-header syntax, exact wording to
copy — they have to leave the tab (Files tab or an editor).

## Design

A **Raw** toggle button in the Plan tab's sticky header, immediately right of
the **⌂ plan.md** home button.

- Toggle, not a separate page: pressed state (`aria-pressed`) renders the
  current file's already-fetched text in a monospace `<pre>`; pressing again
  returns to rendered markdown. No re-fetch — same content, different view.
- The mode is a reading preference, so it **sticks across navigation** (home
  button and subplan links still work via rendered mode; in raw mode links
  are literal text). Switching repos resets it, same as `currentPath`.
- Empty state (missing file) is unchanged; the toggle stays in the header.
- **Advanced-only**: capability map entry `planRawView: 'advanced'`
  (redundant today since `planTab` is itself advanced, but keeps the
  convention and makes future promotion a one-line change).
- No backend changes.

## Implementation

1. **`client/src/pages/Plan.jsx`** — `raw` state (default false, reset on
   repo switch); Raw button in the header gated by `useFeature('planRawView')`;
   content branch renders `<pre className="plan__raw">` when raw.
2. **`client/src/pages/plan.css`** — `.plan__raw-toggle` (matches the home
   button, with an active/pressed style) and `.plan__raw` (monospace,
   pre-wrap).
3. **`client/src/context/UiModeContext.jsx`** — `planRawView: 'advanced'`.
4. **i18n** — `plan.raw` / `plan.rawAria` in `en.json` and `tr.json`.

## Verification

`.claudeweb-preview/playwright/verify-plan-raw-view.mjs` against the isolated
:5201 harness: header shows the Raw button; toggling shows literal markdown
source (`# heading` visible as text, no rendered `<h1>`); links not clickable
in raw mode; toggling back restores rendered view; mode survives subplan
navigation; screenshot read before claiming success.
