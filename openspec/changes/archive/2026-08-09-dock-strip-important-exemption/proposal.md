## Why

The dock strip's filters (openspec dock-strip-filter-merge) already exempt grid-visible docks so the strip stays a superset of what's on screen — but a dock the operator has starred as **important** (openspec dock-toolbar-star-and-branch) can still vanish from the strip when it is hidden and a filter is active (e.g. an idle hidden important dock under **running**, or one on `main` under **feature**). Important is precisely the "never lose sight of this agent" flag, so the strip should honor it the same way it honors grid visibility.

## What Changes

- `matchesFilter` in `DockToolbar.jsx` gains a second exemption: a tab whose dock has the server-persisted `important` flag set matches every non-All filter state (branch and status alike), exactly like the existing grid-visible exemption.
- The +N excluded chip keeps its meaning automatically: it only ever counts hidden, non-exempt docks, so important docks never contribute to it.
- No new UI, no i18n changes, no persistence changes — the ★ indicator already renders on exempt tabs and already speaks via the aria-label.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `agent-dock`: the strip-filter requirement's exemption clause widens from "grid-visible docks match every filter state" to "grid-visible OR important docks match every filter state".

## Impact

- `client/src/components/dashboard/DockToolbar.jsx` — one added branch in `matchesFilter` plus header-comment update.
- Frontend only; no backend, API, or store changes (the `important` flag already arrives on each roster tab).
