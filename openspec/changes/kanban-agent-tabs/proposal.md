# Per-agent tabs: click an assignee chip → focus that agent's own tab

## Why

The single shared worker window (board task afed9d6d / kanban-worker-window)
works, but the Operator found the better shape: every repo agent should have
its OWN tab, and clicking the agent on a Kanban card should simply FOCUS that
tab — wherever it happens to live (any Chrome window, any monitor) — instead of
routing every agent through one window that keeps getting renavigated.

## Research finding

Engine-verified (`.claudeweb-preview/playwright/check-agent-tabs.mjs`, 6/6
against real Edge/Chromium): `window.open('', PER_AGENT_NAME)` **finds an
existing named tab without navigating it** (empty URL = no reload — planted
in-page state survives the click, proven), a brand-new tab comes back at
`about:blank` and only then gets the dock deep link, and `w.focus()` from the
click's user gesture **actually switches Chrome to that tab — including a tab
living in another OS window** (`visibility=visible`, `hasFocus=true` measured
after the click). Distinct names never collide; re-clicks never duplicate.

## What Changes

- `workerWindow.js` is rewritten from the shared-window API (`openInWorker`,
  one fixed name) to the per-agent API: `agentTabName(key)` (stable, distinct,
  sanitized per assignee key) + `focusAgentTab(key, url)` (find → navigate only
  if brand-new → focus).
- The Kanban assignee chip becomes the click target (the whole chip, `role=
  button`, with the ⧉ glyph as the cue): click = jump to that agent's own tab.
  Multi-assignee cards: each chip targets its own agent. Unknown machine
  address → chip not clickable (unchanged null-safety). An existing tab is
  focused AS-IS, never reloaded.
- The `?agent=` deep link and the harness-URL derivation are untouched; only
  the window-targeting layer changes.

## Impact

- Affected specs: `task-graph` (the worker-window requirement is superseded).
- Affected code: `workerWindow.js`, `KanbanBoard.jsx`, kanban.css, tests.
- The kanban-worker-window change (shipped, unarchived) is superseded by this
  one on the window-targeting behaviour; its deep link and URL derivation
  requirements stand.
