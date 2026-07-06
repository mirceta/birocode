# Dock Layout Controls

## Why

The dashboard is the Operator's main monitoring surface and screen space on it is
scarce, yet today the docks sit inside generous chrome (16px content padding +
8px overlay padding above the docks bar, 20px grid gaps, 28px card padding) and
the only sizing controls are indirect: a 5-step "bigger/smaller" width cap and a
√n auto column count. The Operator cannot say "3 docks per row", cannot make
docks taller, and docks never use the full row width. We want direct, compact
control over how docks render — per-row count, dock size (width via fill,
height explicitly) — while stripping every non-essential margin/padding around
and inside the docks.

## What Changes

- **Zero top chrome**: no margin/padding above the docks bar — the shared header
  bar starts immediately under the status strip (the `.app-content` 16px inset
  and `.dash` top padding go away while the dashboard overlay is open).
- **Minimal spacing everywhere**: grid gap 20px → 8px, body gap 20px → 10px,
  card padding 28px → 12px, tighter phone-dock internal paddings, tighter
  header bar spacing.
- **New Layout popover** (one compact `▤` button on the shared bar) replacing
  the two-button size stepper and the two-button zoom group, giving:
  - **Per row**: Auto (today's ⌈√n⌉) or an explicit 1–6 columns; explicit
    columns make docks **fill the full row width** (bigger docks, no wasted
    side gutters).
  - **Dock height**: Auto (today's aspect-ratio) or an explicit height slider,
    independent of width.
  - **Content zoom**: the existing 0.5–2.0 zoom as a slider (same persisted
    key/behavior as the old A−/A+ buttons).
  - Settings are per device and remembered **separately for the cards view and
    the phones/hot views**, so tuning one doesn't wreck the other.
- **REMOVED**: the 5-step `SIZE_STEPS` width-cap stepper (−/+) and its
  `claudeweb_dash_size` key; the standalone A−/A+ zoom buttons (capability
  moves into the popover, key kept).

## Capabilities

### New Capabilities

- `dock-grid-layout`: how the dashboard's agent grid lays out docks — column
  count (auto/explicit), dock width fill, dock height (auto/explicit), content
  zoom, per-view persistence, and the minimal-spacing budget around and inside
  docks.

### Modified Capabilities

- `dashboard-chrome`: the shared header bar's control roster changes (size
  stepper + zoom buttons replaced by the single Layout popover trigger), and
  the compact-chrome requirement tightens to zero top margin/padding above the
  docks bar.

## Impact

- `client/src/pages/Dashboard.jsx` — remove SIZE_STEPS/zoom-button groups, add
  layout state (+persistence) and the popover, new grid template logic.
- `client/src/pages/dashboard.css` — spacing budget, popover styles, fixed
  height overrides.
- `client/src/layout/Layout.jsx` + `client/src/styles/global.css` — a
  dashboard-open modifier on `.app-content` to drop its padding.
- `client/src/components/dashboard/PinnedAgent.jsx` — unchanged API (still
  receives `contentZoom`); phone internal padding trims in CSS only.
- i18n: new `dashboard.*` keys for the popover; `sizeSmaller/sizeBigger` keys
  retired.
- localStorage: new `claudeweb_dash_grid` key; `claudeweb_dash_size` retired
  (stale values ignored); `claudeweb_dash_content_zoom` unchanged.
- Playwright verify script `.claudeweb-preview/playwright/verify-dock-layout.mjs`.
- No backend/API changes.
