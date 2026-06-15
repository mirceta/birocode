# Understanding — taller agent docks on the dashboard

## What you asked for

The agents on the **agent dashboard** (the "wall of phones" overlay) are too
short to be usable — you can't see enough of the chat transcript in each one.
Make them **taller** so more chat text is visible at a glance.

## Why they're short today

Every dock cell is locked to a **square** (`aspect-ratio: 1 / 1` in
`dashboard.css`). The "bigger/smaller" stepper only scales the *width* cap; the
height just follows the width to stay square. So you can't get a tall cell
without also making it very wide — and a square spends most of its area on the
chat's left/right margins instead of on more visible lines of text.

## What I'll do

- Give the dock cells (the **phones**, and the **cards**) a **taller-than-wide
  shape** so each one shows more chat without ballooning in width — a phone is
  portrait in real life anyway.
- Keep the existing **bigger/smaller stepper** working (it should scale the new
  taller shape, not fight it).
- Make sure the embedded chat still fills the taller frame correctly (the
  composer stays reachable — the `.phone__screen` / `.chat--embedded` flex
  sizing already handles this; I'll confirm it holds when the cell is tall).

## Assumptions

- This is desktop-only (the dashboard is desktop-only); the narrow-screen
  `@media (max-width: 700px)` one-per-row layout stays as is.
- "Bigger" still means bigger; this changes the *proportions* (taller), not the
  stepper's purpose.
- Scope is the dashboard docks only — the standalone `/studio` chat is untouched.

I'll confirm the exact approach in the plan before building, then verify in a
real browser (Playwright) per our flow.
