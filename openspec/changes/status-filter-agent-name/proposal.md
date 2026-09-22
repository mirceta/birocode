# Status text filter matches the agent's visible name

## Why

The Operator (2026-09-22, fleet task 9be69c00) asked for a Status-tab textbox
that keeps, as you type, only the agents whose NAME contains the typed text —
composing with the existing filter buttons. The Status tab already carries a
search box (openspec fleet-status-filters), but its haystack was the repo
name, branch, remote URL and machine label only — NOT the agent's handle or
the label actually printed on the chip (the handle-derived "prg#2",
openspec stable-handles / fleet task 1dc2812c). Typing exactly what a chip
shows — "autodev#1", "spacex/prg" — could filter that very chip out. A
name filter that loses the visible name is not a name filter.

## What Changes

- The query matcher moves out of `FleetStatus.jsx` into a pure module
  (`client/src/manage/agentQuery.js`) and its haystack grows to every form of
  the agent's name the user can see or knows: the repo name, the FULL handle,
  and the chip's visible label (via `repoAgentLabel`), alongside the branch,
  remote URL and machine label that were already searchable.
- Behaviour is otherwise unchanged: case-insensitive substring, as-you-type,
  several words AND together, composed with the machine chips and the state
  chips (every constraint applies at once), persisted per device, the
  no-match note and × clear untouched.

## Impact

- Affected specs: `management-dashboard` (ADDED requirement pinning the
  name-matching contract of the existing filter bar).
- Affected code: `client/src/manage/agentQuery.js` (+ tests), `FleetStatus.jsx`
  (imports the module instead of its local matcher), client test script.
- Evidence: `client/tests/ui/shot-status-name-filter.mjs` →
  `docs/screenshots/status-name-filter-{before,typed,compose}.png`.
