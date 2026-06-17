# Understanding — dock colour background

## Goal
An agent's assigned colour shows as a coloured **border** on its dashboard dock. Also paint
the dock **background a very light shade** of that colour, so the colour stays identifiable
even when the **important** star overrides the border with bright red (today that makes a
coloured important agent indistinguishable from any other important one).

## Root cause / where it is
`client/src/pages/dashboard.css`:
- **Cards** already tint: `.dash-cell[data-colored='true']` sets border + a
  `color-mix(... var(--agent-color) 12% ...)` background.
- **Phone docks** don't: `.phone[data-colored='true']` sets only `border-left` → no wash, so
  important repaints the border red and the colour is lost.

Both already get `--agent-color` + `data-colored` (cards in `Dashboard.jsx`, phones in
`PinnedAgent.jsx`), so this is **CSS-only**.

## Fix (to build next)
Add the same tinted background to `.phone[data-colored='true']`. The red important border
and the background wash are independent, so important + coloured → red border + colour wash,
distinguishable again. Bump the tint % slightly if 12% reads too faint under red.

## Kickoff status
Branch `feature/dock-color-background` created off main (synced with origin). Plan entry
added to Active feature plans → [plans/dock-color-background.md](plans/dock-color-background.md).
Not implemented yet.
