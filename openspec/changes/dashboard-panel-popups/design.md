# Design — dashboard-panel-popups

## Pop-up layer

- Rendered by `Dashboard.jsx` after the header, outside `.dash__body`:
  one `.dash__popup` per summoned panel, `position: fixed`, horizontally
  centered, `top` below the dashboard header row and `bottom` near the viewport
  edge, `width: min(1120px, 94vw)` — big and central by construction.
- **No scrim.** The user's stated dismissal gesture is pressing the chip again;
  a backdrop would swallow that click. The pop-up floats (strong shadow +
  border) and the dashboard stays interactive around it. × in the pop-up
  header and Esc (closes the topmost) are conveniences on top of the chip.
- **Stacking:** a `panelOrder` state array records summon order (seeded from
  the persisted visibility on mount); summoning appends, dismissing removes.
  Pop-ups render in that order with increasing z-index (base 30 — above the
  old mission-control 20), so the most recently summoned paints on top.
- The pop-up supplies one slim header (icon + title + ×). Content: `IdeasPanel`
  directly; `AutopilotPanel` / `AgentAuditPanel` with a new `popup` prop.

## `popup` mode on the two dock panels

Both panels keep their dock chrome for the routed/embedded cases, but with
`popup` they fill the pop-up instead of sizing themselves: skip the saved
size style and the corner resize grip, render always-expanded (the collapse
chevron is dropped — a pop-up you don't want is closed, not folded), keep
their summary bar and full console/table content. Their own headers stay,
so the pop-up header stays generic.

## What gets deleted from Dashboard.jsx

Citizen-era machinery with no remaining purpose once the aux panels leave the
layout: `ideasWide` / `ideasCollapsed` / `ideasSize` states, keys and the
corner-grip handlers; `ideasFloating` + `floatTop` (the grid-mode overlay
hack); `gridSwapped` + the ⇄ button (it only flipped Ideas vs agents);
aux entries in `dragKeys` (now `['agents']` — free mode still drags/resizes
the agents panel; `seededPositions`/`clampPos` are unchanged, just smaller).
Stale localStorage entries (old positions, ideas size…) are ignored, not
migrated. i18n keys that served the deleted controls are removed.

## Alternatives rejected

- **True modal with scrim + focus trap:** blocks the chip the user explicitly
  wants to keep using; these panels are glanceable consoles, not forms.
- **One-at-a-time (summoning closes the others):** silently flips other chips
  off; stacking keeps chip state honest and still shows the newest on top.
