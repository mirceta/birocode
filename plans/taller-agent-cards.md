# Taller agent docks on the dashboard

**Status:** Planning (branch `feature/taller-agent-cards`). Not built.

## Problem

On the agent dashboard overlay (`plans/agent-dashboard.md`), each agent dock is
locked to a **square** — `aspect-ratio: 1 / 1` on both `.dash__phone-cell` and
`.dash-cell` in `client/src/pages/dashboard.css`. The "bigger/smaller" stepper
(`SIZE_STEPS` in `Dashboard.jsx`) only scales the **width** cap; height follows
to keep the square.

For the "phones" view (each cell embeds a live `<Chat>`), a square is the wrong
shape: most of the area goes to the chat bubble's horizontal margins, leaving
only a few lines of transcript visible. The dock is "barely usable" because you
can't read enough chat. A chat surface wants to be **portrait** (taller than
wide) — fittingly, since these cells are literally called *phones*.

## Goal

Make the dock cells **taller than wide** so each shows more chat at a glance,
without making them wider. Keep the bigger/smaller stepper working (it scales
the taller shape). Keep the embedded chat filling its frame with a reachable
composer.

## Approach (to confirm before building)

Replace the square `aspect-ratio: 1 / 1` with a **portrait ratio** so height
exceeds width. Candidate: `aspect-ratio: 3 / 4` (or taller, e.g. `2 / 3`) for
the phones; the width cap stays driven by the stepper, so height = width ÷
ratio grows automatically.

Open questions for the build:
- One ratio for both views, or only make **phones** taller and leave **cards**
  roughly square? (Cards are a cheap status summary — they don't need the
  height as much; phones are where the chat-reading pain is.)
- Should "taller" be the fixed shape, or a separate axis the user can adjust?
  Leaning **fixed portrait shape** — the stepper already covers overall size,
  and a second knob is more UI than the request needs. Revisit if a single
  ratio doesn't satisfy.

## Touch points

- `client/src/pages/dashboard.css` — the `aspect-ratio` rules on
  `.dash__phone-cell` and `.dash-cell`, plus the `min-height` floor; check the
  `@media (max-width: 700px)` `grid-auto-rows: 70vh` still reads well.
- `client/src/pages/Dashboard.jsx` — only if the width-cap math
  (`340 * SIZE_STEPS` / `460 * SIZE_STEPS`) needs rebalancing once height is
  decoupled from width.
- Confirm `.phone__screen` / `.chat.chat--embedded` flex sizing
  (`plans/dashboard-chat-scroll.md`) still bounds the scroll + keeps the
  composer in-flow when the frame is tall.

## Verify

Per our flow: browser-verify on an isolated harness instance with Playwright
(`.claudeweb-preview/playwright/`) — open the dashboard in **phones** view,
confirm cells are visibly taller and show more transcript lines, and that the
composer is still reachable at the bottom of a tall cell. Screenshot before/
after. Then preview-verify on the live port before "deploy".
