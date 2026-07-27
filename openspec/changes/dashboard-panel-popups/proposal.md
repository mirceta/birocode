# Dashboard aux panels open as centered pop-ups

## Why

The three summonable dashboard panels — Ideas 💡, Autopilot ⚙, Agent audit 🛡 —
currently join the dashboard's drag layout as floating citizens: summoning one
drops it wherever the flow (or a saved drag position) puts it, and the user has
to hunt for it around the canvas, drag it, resize it, collapse it. The user's
verdict: "they are hard to find on the screen". The layout machinery built for
them (free-drag positions, ideas wide/collapse/corner-resize, the grid ⇄ swap)
is exactly the tracking burden they complain about.

## What Changes

- Summoning a panel from the header rail opens it as a **big centered pop-up**
  overlaying the dashboard content, instead of inserting it into the layout.
  Pressing its chip again (or the pop-up's ×, or Esc) closes it.
- The header bar stays reachable above the pop-up, so the chip itself remains
  the on/off switch — no scrim blocking it.
- Multiple summoned pop-ups stack centered, most recently summoned on top.
- The aux panels leave the drag-layout citizen list (it keeps managing the
  agents grid only). Their citizen-era chrome goes away: Ideas wide/collapse/
  corner-resize, per-panel drag grips, the grid-mode ⇄ order swap, and the
  panels' own size grips when shown in a pop-up.

## Impact

- Affected specs: `dashboard-panels` (summon behavior → pop-up; unmount rule
  loses its layout-citizen clauses). `dashboard-free-layout` is untouched — the
  agents-panel width grip and free mode still work, now managing agents alone.
- Affected code: `client/src/pages/Dashboard.jsx` (popup layer replaces the
  three citizen sections; dead layout state removed), `dashboard.css`,
  `AutopilotPanel.jsx` / `AgentAuditPanel.jsx` (a `popup` fill mode),
  i18n en/tr. No backend change.
- Device-local state: saved ideas size/wide/collapsed, aux drag positions and
  the ⇄ swap become inert leftovers in localStorage; panel visibility keys keep
  working unchanged.
