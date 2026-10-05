# Status agent details: "Open harness" becomes the obvious primary action

## Why

The Operator (2026-10-05, fleet task 15e00e7d): the "open harness" control in
an agent's Status details is so small (a 104×24 px text button, fourth row
down) that they hunt for it every time, to the point of avoiding it. Opening
the harness is the single most common reason to click an agent chip — it
should be mindless.

## What Changes

- Presentation only. The open-harness button becomes the details' one primary
  action: accent-filled, ≥44 px tall / ≥230 px wide, 14.5 px bold label with
  icon ("🖥 Open harness ↗"), always in the same place — the first row under
  the agent's identity line, for every agent. The dark scheme flips the label
  to near-black on the light-blue dark accent (≥4.5:1 both ways).
- Everything else in the details (badges, occupancy control, hand-to-arch,
  open dock) keeps its small secondary styling, so the hierarchy is obvious.
- Deliberately unchanged: the handler, tab key, URL derivation and every data
  hook (task b06d56c4 / openspec status-open-harness) — same harness
  window/tab as the Kanban badge, one tab per agent, focus-not-reload; the
  unknown-address case stays a disabled button with the honest note.

## Impact

- Affected specs: `management-dashboard` (ADDED requirement for the primacy).
- Affected code: `FleetStatus.jsx` (the row moved + classes), `manage.css`.
- Evidence rig `client/tests/ui/shot-status-harness-button.mjs`: before/after
  shots in light, dark and at 1100 px, plus assertions (first focusable
  action, hit-target size, others smaller, behaviour untouched).
