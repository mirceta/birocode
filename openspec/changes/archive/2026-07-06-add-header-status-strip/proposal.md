# Header status strip

## Why

The scoreboard, the GitHub/Claude account chips, and the host clock are the harness's
at-a-glance status surface, but today they are buried at the top of the agent dashboard —
you must open the Dashboard overlay to see any of them, and they occupy dashboard real
estate that the agent grid needs. Promoting them to a top-level strip directly under the
app header makes status glanceable from every screen without opening anything, while a
collapsed-by-default design keeps them out of the way on phones.

## What Changes

- A new **header status strip** renders directly below the app header (`.app-header` —
  the bar with the title, Hello button, project chip, language toggle, Save button and
  mode toggle), on every route/screen of the studio shell.
- The strip stretches the full horizontal width available to it and is **collapsible,
  collapsed by default** (device-local persistence, same localStorage idiom the sections
  already use). Collapsed it is a slim bar with a summary + chevron; expanded it shows
  the four sections in a responsive row.
- The strip hosts the four sections currently in the dashboard's `.dash__scoreboard-row`:
  - the **Scoreboard** (`Scoreboard.jsx`, polls `/api/analytics`)
  - the **GitHub chip** (`AccountChips.jsx`, polls `/api/github-account`; includes the
    GitHub token control)
  - the **Claude/cloud chip** (`AccountChips.jsx`, polls `/api/claude-account` +
    `/api/claude-usage`)
  - the **host clock / datetime** (`HostClock.jsx`, polls `/api/host-time`)
- The `.dash__scoreboard-row` is **removed from the Dashboard** — the sections move,
  they are not duplicated (no double polling).
- Polling is gated on the strip being expanded, so the collapsed-by-default strip does
  not add background API traffic on every screen.
- Per the UI-modes convention (`plans/ui-modes.md`), the strip is a new UI feature and
  therefore defaults to **Advanced** mode via the capability map — "always shown" means
  on every screen for users who have the capability, not shown in Basic mode.
  *(Open question for the user: should End Users / Basic mode see it? The truncated
  request said "always-shown", which could mean Basic too.)*

## Capabilities

### New Capabilities

- `header-status-strip`: the always-available, full-width, collapsible status strip
  under the app header — placement, collapse/expand behavior and persistence, default
  state, what it hosts, mode gating, and its polling discipline.

### Modified Capabilities

- `dashboard-host-clock`: the host clock's stated home ("the dashboard ... on the
  Scoreboard row") moves to the header status strip; tick/poll cadence requirements are
  unchanged but re-anchored to the strip's visibility instead of "while the dashboard
  is open".
- `claude-usage`: the "Dashboard Claude chip renders usage" requirement is re-anchored —
  the chip lives in the header status strip; the polling/caching requirements stay as-is
  (the strip polls on the same cadence the dashboard did).
- `github-credentials`: the Advanced-mode token-submission control moves with the GitHub
  chip from the dashboard to the header status strip.

## Impact

- **Frontend only** — no backend/API changes; all four sections keep their existing
  endpoints and cadences.
- `client/src/layout/Layout.jsx` (`StudioShell`) — mount point for the new strip, right
  after `</header>`.
- `client/src/pages/Dashboard.jsx` + `client/src/pages/dashboard.css` — remove the
  `.dash__scoreboard-row` and its feature gates.
- New `client/src/components/header/HeaderStatusStrip.jsx` (+ CSS) hosting the moved
  components unchanged.
- `client/src/context/UiModeContext.jsx` — new `headerStatusStrip` capability
  (Advanced); existing `accountChips` / `hostClock` keys keep gating their sections
  inside the strip.
- `client/src/i18n/en.json` / `tr.json` — strip title/expand/collapse keys.
- Existing Playwright dashboard tests that assert the scoreboard row inside the
  Dashboard will need updating.
