# Design — dashboard-focus-docks

## Context

`Dashboard.jsx` mounts four layout "citizens" unconditionally (modulo feature
gates): Autopilot (`autopilotTab`), Agent audit (`agenticAudit`), Ideas, and
the docks grid. All the existing relief valves — Ideas collapse/wide/resize,
free-drag, grid swap — reposition or shrink panels but never remove them, and
every mounted panel keeps polling/fetching. The Operator wants a docks-only
dashboard as the normal state, with the aux panels one tap away.

## Goals / Non-Goals

**Goals:**

- Docks-only dashboard by default; aux panels summoned per device.
- Hidden = unmounted (no fetches, no layout participation).
- Zero behavior change inside the panels themselves.

**Non-Goals:**

- No redesign of the drag/grid layout systems, the panels' internals, or the
  header bar layout (dashboard-chrome requirements stand as-is).
- No backend or cross-device persistence; this is a device-local view setting
  like view/zoom/grid.
- No change to the standalone Ideas/Autopilot routes or tabs — only their
  dashboard embeddings.

## Decisions

1. **Rail of toggle chips on the existing shared bar** — one chip per aux
   panel (💡 Ideas, ⚙ Autopilot, 🧾 Audit), rendered as a compact
   `role="switch"`-style group next to the Layout popover trigger.
   *Alternatives*: a slide-in drawer hosting the panels (rejected: creates a
   second layout system that duplicates what free-drag already does, and
   overlays the very docks the Operator wants to watch); a "Docks | Ops"
   sub-view switch (rejected: heavier navigation, loses mixed layouts users
   already built).

2. **Default hidden, single storage key** — `claudeweb_dash_panels` holding
   JSON `{ ideas, autopilot, audit }` booleans; absent/malformed → all
   `false`. One key (like `claudeweb_dash_grid`) rather than three, read with
   the same try/catch-degrade pattern as every other dashboard key.
   *Alternative*: default-visible to avoid surprising existing devices
   (rejected: it would preserve exactly the clutter this change exists to
   remove; restoring a panel is one remembered tap).

3. **Conditional mount, derived citizen list** — visibility gates the JSX
   (`{showIdeas && <aside …>}`), and `dragKeys` is computed from *visible*
   panels only, so `freePlaced`, seeding, clamping, and grid flow all keep
   working on the reduced set. Effective visibility = chip state AND feature
   gate (`autopilotOn`, `agentAuditOn`).
   *Alternative*: CSS `display:none` (rejected: panels would keep fetching —
   IdeasPanel, AutopilotPanel, and AgentAuditPanel poll on mount — and
   would still be seeded by the free-layout code).

4. **Layout state is kept, not cleared, on hide** — `claudeweb_dash_pos`,
   Ideas size/wide/collapsed, and agents width are untouched by toggling;
   a re-shown panel reapplies them. When the free canvas is already placed
   (`freePlaced`) and a panel is shown with no saved position, seed it from
   its natural flow offset on next drag exactly as `seededPositions()` does
   today — plus re-run the `floatTop` measurement effect (its dep list gains
   the visibility flags) so the Ideas float re-anchors.

5. **No new UI-mode capability** — the dashboard is already `agentDashboard:
   'advanced'`; the rail rides that gate. Chips for Autopilot/Audit reuse the
   existing `useFeature` results already in the component.

## Risks / Trade-offs

- [Operators used to always-on Ideas open the dashboard and "lose" it] →
  one-tap restore from a rail chip in the same header they already use;
  remembered per device thereafter.
- [Showing a panel onto an already-free-placed canvas has no saved {x,y}] →
  it renders at its flow position inside the absolute canvas until first drag
  (which seeds it); acceptable and matches today's pre-seed behavior.
- [A saved-hidden panel whose feature is later re-enabled] → chip reappears,
  panel stays hidden until toggled — feature gate and chip state compose with
  AND, no state migration needed.
- [Playwright suites that assume Ideas/Autopilot are present on the dashboard]
  → tests must seed `claudeweb_dash_panels` via addInitScript (or toggle the
  chips) before asserting on aux panels.

## Migration Plan

Pure frontend, device-local. Ship normally; no data migration, no rollback
concern beyond the standard deploy dead-man switch. Existing localStorage keys
keep their meaning.

## Open Questions

- Chip glyphs/labels: icon-only chips (with tooltips + aria-labels) vs
  icon+text — decide in implementation against the bar's remaining width on
  narrow viewports (dashboard-chrome's wrap scenario must keep passing).
