# Proposal: dock-strip-amendments

## Why

The dashboard's dock toolbar (the horizontal strip listing every agent dock) shows each
tab's git branch, but with a full roster the operator can't narrow the strip by what they
actually triage on: which agents sit on the mainline (`main`/`master`) and which are out on
feature branches. Scanning branch rows tab by tab doesn't scale; the strip needs a filter.

## What Changes

- **Branch filter on the strip.** A three-state filter control on the dock toolbar:
  **All** (today's behavior, default), **on main** (only tabs whose repo's current branch
  is `main` or `master`), and **not on main** (only tabs whose repo's branch is known and
  is neither). It filters which tabs the strip renders — nothing else: the dashboard grid,
  the persisted per-dock `dashboard` visibility state, and the Agents page are untouched.
- Branch classification reuses the branch the strip already shows (the dashboard's
  per-repo git map); tabs with no known branch appear only in **All**.
- While a filtered view is active, the strip conveys that tabs are filtered out (a count
  of hidden tabs) so agents never just silently vanish.
- The selection is device-local and ephemeral (resets to All on reload), like reorder
  mode. Reorder mode suspends the filter (the full roster shows while reordering) and the
  selection reapplies on exit.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `agent-dock`: the dock toolbar gains a three-state branch filter (all / on
  main-or-master / not on main-or-master) over its tabs, display-only and ephemeral.

## Impact

- **Frontend only.** `client/src/components/dashboard/DockToolbar.jsx` (filter control +
  tab filtering), `client/src/pages/dashboard.css` (control styling),
  `client/src/i18n/en.json` / `tr.json` (labels). Branch data already reaches the toolbar
  via the `git` prop — no backend changes, no new polling, no persisted state.
- Advanced-mode gate unchanged (strip is already behind it). Basic mode unaffected.
