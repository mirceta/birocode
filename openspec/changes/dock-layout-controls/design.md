# Design — dock-layout-controls

## Context

Dock sizing today (`client/src/pages/Dashboard.jsx`, `dashboard.css`):

- Columns are auto only: `columns = ⌈√visibleCount⌉` (Dashboard.jsx ~:534).
- The grid template is inline JS: `repeat(columns, minmax(0, cap))` where cap =
  340px (cards) / 460px (phones/hot) × `SIZE_STEPS[sizeIdx]`
  (`[0.7,0.85,1,1.2,1.45]`, key `claudeweb_dash_size`). `justify-content:center`
  wastes the leftover row width as side gutters.
- Height is never direct: `.dash-cell { aspect-ratio: 1/1 }`,
  `.dash__phone-cell { aspect-ratio: 3/4 }`, wide cells `2/1`.
- Content zoom (A−/A+, key `claudeweb_dash_content_zoom`, 0.5–2.0 step 0.1) is
  a CSS `zoom` on `.phone__screen` in `PinnedAgent.jsx`.
- Spacing budget above/around docks: `.app-content` padding 16px (global.css)
  → `.dash` padding 8px 12px → `.dash__header` margin-bottom 6px; grid gap
  20px; card padding 28px.

The user's ask: zero top margin/padding for the docks bar, minimal
margins/paddings around and inside docks, and direct control — docks per row,
dock width, dock height — optimized for control, ease of use, and screen space.

## Goals / Non-Goals

**Goals:**

- Docks bar starts at the very top of the content region (0 top chrome).
- One compact popover holds all render controls (frees header width too).
- Per-row count 1–6 or Auto; explicit count ⇒ docks fill the full row width.
- Direct height control independent of width; Auto keeps aspect-ratio.
- Minimal, fixed spacing: 8px grid gap, 12px card padding, trimmed phone
  internals.
- Per-view persistence (cards vs phones/hot) so the two layouts are tuned
  independently.

**Non-Goals:**

- Per-dock individual sizing (the existing per-dock "wide" span-2 toggle
  stays as-is; it composes with explicit columns naturally via grid span).
- Drag-resize on dock cells (Ideas panel keeps its grip; docks don't get one).
- Changing the free-drag / grid layout modes, view modes, ordering, grouping.
- Backend/API changes.

## Decisions

1. **Width is controlled via columns-per-row, not a separate width slider.**
   With an explicit column count the tracks become `repeat(n, minmax(0,1fr))`
   — docks split the full row, so "fewer per row" IS "wider docks". One mental
   model, one control, no dead gutters. Alternative (keep a px width cap
   slider + centering) rejected: two interacting width controls confuse, and
   capped-and-centered layouts waste exactly the space the user wants back.
   Auto (default) keeps today's ⌈√n⌉ count with the 340/460px caps so the
   out-of-box look is unchanged.

2. **Height: `Auto` or an explicit px slider (240–900, step 20) applied as a
   CSS variable.** The grid `<ul>` gets inline `--dash-cell-h` plus a
   `dash__grid--fixed-h` modifier; CSS overrides `.dash-cell` /
   `.dash__phone-cell` with `height: var(--dash-cell-h); aspect-ratio: auto;
   min-height: 0`. Alternative (grid-auto-rows) rejected: the "together"
   group `<li>` stacks several docks in one row track, so the height must land
   on the dock boxes, not the row.

3. **One `▤` popover button replaces the −/+ and A−/A+ groups.** Contents:
   Per row segmented control (Auto·1·2·3·4·5·6), Height (Auto toggle +
   slider), Zoom slider (0.5–2.0). Click-outside and Esc close it. Rationale:
   full control needs more surface than the header bar can spare; a popover
   costs 1 button of chrome instead of 4+ and scales to future knobs.
   Sliders give continuous "full control"; the old 5 fixed steps don't.

4. **Persistence: one JSON key `claudeweb_dash_grid`** —
   `{ cards: {cols: 0|1..6, h: 0|px}, phones: {cols: 0|1..6, h: 0|px} }`
   (0 = auto; `phones` bucket serves both phones and hot views since both
   render phone docks). Zoom keeps its existing `claudeweb_dash_content_zoom`
   key untouched. The old `claudeweb_dash_size` key is no longer read —
   worst case a device falls back to default width, acceptable for a
   device-local view preference; no migration code.

5. **Zero top chrome via an `.app-content--dash` modifier** set in
   `Layout.jsx` when the dashboard overlay renders: padding
   `0 6px 8px` (BottomNav is hidden while the dashboard is open, so the big
   nav-height bottom pad is dead weight too). `.dash` drops its own padding to
   `0`. Alternative (make `.dash` position itself out of `.app-content`
   padding with negative margins) rejected as fragile.

6. **Fixed minimal spacing, no density toggle**: grid gap 20→8px, body gap
   20→10px, `.dash-cell` padding 28→12px + gap 10→8px, `.dash__group` padding
   10→6px, phone internals (`.phone__bar/lanes/apps/git`, embedded chat
   scroll) trimmed ~2–4px each side. The user asked for minimal, full stop;
   a Compact/Cozy toggle would be another control with no requested use.

## Risks / Trade-offs

- [1 column × tall height can exceed the viewport] → that is a legitimate
  "one big dock" mode; the overlay scrolls as it already does for large grids.
- [Fixed height clips card content] → `.dash-cell` children already ellipsize/
  line-clamp; fixed-height cells get `overflow: hidden` as a backstop.
- [Removing −/+ changes muscle memory] → the popover is one click away and
  strictly more capable; retired i18n keys removed to keep the surface honest.
- [Phones at 6 columns get unusably narrow] → allowed; the control is direct
  and reversible, and Auto remains the default.
- [`.dash__docktoolbar` scrollbar sits at the very top edge] → keep its 2px
  padding-bottom so the horizontal scrollbar doesn't overlap tab labels.

## Migration Plan

Pure frontend; ships with the normal build. Devices with an old
`claudeweb_dash_size` silently return to default width (auto columns) until
the operator opens the popover. Rollback = revert the commit.

## Open Questions

None — sliders' ranges (height 240–900, zoom 0.5–2.0) mirror existing
min-heights and zoom clamps.
