## Why

The multi-pane layout lets a tab span 1–4 "tab-spaces" so its content gets more
horizontal room, but a tab that spans the full visible width doesn't actually
*use* that room: its page content stays capped and centered, leaving empty
gutters on both sides. The point of widening a tab is to see more at once — when
it spans everything visible, it should fill everything visible, not float
centered in the middle.

## What Changes

- A pane whose content area is wide (a tab spanning multiple tab-spaces, up to
  filling the whole strip) SHALL let its page content **stretch to fill the
  pane's horizontal width** instead of rendering at a fixed `max-width` centered
  with side gutters.
- The fix is **frontend CSS only**, driven by the pane's own width (each
  `.app-content` already establishes a `container-type: inline-size` container),
  so a page widens *per pane* based on the room that pane actually has — narrow
  panes keep their current comfortable reading width; wide/full-span panes fill.
- Apply this to the pages that currently cap-and-center themselves and so exhibit
  the gutter on a wide pane: Cockpit (`.ck`), Settings (`.settings-page`),
  Terminal (`.terminal-page`), and any other page with the same
  `max-width` + `margin: 0 auto` pattern.
- No change to the span model, the 1–4 range, the `tabWidths` store, the span
  controls, or any backend/API. A single-pane (full-width) view keeps its
  existing reading-width behavior; only the multi-space / wide-pane case changes.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `multi-pane`: add a requirement that a wide pane (a tab spanning more than one
  tab-space) fills the available horizontal width with its content, rather than
  centering page content at a fixed cap. Existing span-control and 1–4 range
  requirements are unchanged.

## Impact

- **Layout fix (primary):** `client/src/layout/PaneStrip.jsx` — a tab whose span
  consumes the whole budget now renders as a lone pane in the uncapped strip
  instead of falling back to the `--max-width: 720px`-capped single view (the
  actual centering bug); span steppers stay gated to ≥2 visible panes.
- **Frontend CSS (complementary).** Affected stylesheets under `client/src/`:
  - `pages/cockpit.css` (`.ck` `max-width: 1200px; margin: 0 auto`)
  - `pages/settings.css` (`.settings-page` `max-width: 560px; margin: 0 auto`)
  - `pages/terminal.css` (`.terminal-page` `max-width: 1100px; margin: 0 auto`)
  - possibly `styles/global.css` if a shared rule is the cleanest carrier.
- Relies on existing structure: `.app-content` already has
  `container-type: inline-size`, and `.app-frame--multi` already sets
  `max-width: none`; the pane (`PaneStrip.jsx`, inline `flexGrow`) already
  stretches. Only the inner page content needs to follow.
- **No backend, no API, no data model.** `tabWidths` (`UiSettingsContext.jsx`,
  `PUT /settings/ui`) and the span controls are untouched.
- Supersedes the frozen note `plans/plan-tab-stretch.md` (the `plans/*` system is
  historical; this OpenSpec change is the live plan).
