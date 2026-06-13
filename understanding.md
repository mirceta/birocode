# Understanding — per-tab agent spaces

## Goal

Two browser tabs open on the **same computer/browser** (call them Alice and
Bob) should each have their **own** "currently open agent" — independent
workspaces. Today, when Alice switches her active agent, Bob inherits it on his
next page refresh.

## Root cause

The agent *tab list* is backend-owned and shared on purpose (`dock.json`). But
*which agent a viewer is looking at* is kept in **`localStorage`**, which is
shared across every tab of the same browser:

- `claudeweb_dock_active` — active agent tab (`DockContext.jsx`)
- `claudeweb_chat_view` — agent/project/harness chat surface (`DockContext.jsx`)
- `claudeweb_repo` — selected project, which follows the agent (`client.js`)

So a refresh in Bob's tab re-reads Alice's last write.

## What I'll do

- Move those three "which space am I viewing" keys from `localStorage` to
  **`sessionStorage`** (isolated per browser tab; survives refresh).
- Keep a write-through `localStorage` **seed** so a brand-new tab / browser
  restart still restores the last-used agent, while existing tabs stay
  independent.
- Add a tiny `viewState.js` helper (`readTabState`/`writeTabState`) used by both
  `DockContext.jsx` and `client.js`.
- Leave genuinely shared prefs alone: Simple/Advanced UI mode, language, model,
  chat/term toggle.
- Update `plans/dock-sync.md`: the active tab is now **tab-local**, not
  device-local (was documented as device-local — flagged per repo convention).

## Assumptions

- "Two tabs on the same computer" = two tabs in the **same browser** (the only
  way shared `localStorage` could leak the selection across them).
- Per-tab selection still survives refresh; a fresh tab/restart restores the
  last selection from the seed.

## Verify

Isolated `:5200` instance, two Playwright browser **tabs in one context**
(shared storage): tab A opens agent X, tab B opens agent Y, A refreshes and must
still show X (not Y). Plus existing dock/chat regression tests.
