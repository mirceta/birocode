# Proposal: dock-strip-status-filters

## Why

The dock strip's filter control (openspec `dock-strip-amendments`) narrows the roster by
git branch, but the operator's other triage question is about run state: which agents are
**running right now** (the near-black pulsing dot), and which **finished while hidden**
(the latched `!` unseen-result marker). With a full roster those are exactly the tabs
worth finding fast, and today the operator scans dot by dot.

## What Changes

- **Two status states on the existing strip filter.** The segmented control gains
  **running** (only tabs whose dot currently shows the running state) and **unseen**
  (only tabs currently showing the `!` unseen-result marker), alongside All / on main /
  not on main. One control, five mutually exclusive states — a tab matches the selected
  state or it doesn't render.
- Classification reuses exactly what the dot already renders: `running` is the same
  liveness the strip's busy indicator reads (the `/api/runs` poll), `unseen` is the same
  displayed-`!` condition (hidden from the grid, not running, server `unseenResult`
  latched). No new polling, no new server state.
- Everything the branch filter already guarantees extends unchanged to the new states,
  because they are states of the same control: the +N excluded-tab count, view-only
  semantics (grid, persisted visibility, roster order untouched), ephemerality (reload →
  All), and reorder-mode suspension.
- Status is live by nature: a run starting/finishing re-buckets tabs on the next poll,
  and clicking an unseen tab under the **unseen** state shows the dock — which clears the
  server latch, so the tab then leaves the filtered strip. That is the designed workflow
  ("triage the unseen pile until it is empty"), not a glitch.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `agent-dock`: the dock strip's filter control gains two status states — running and
  unseen-result — classifying tabs by what their dot currently shows; display-only and
  ephemeral like the branch states.

## Impact

- **Frontend only.** `client/src/components/dashboard/DockToolbar.jsx` (two more
  segments + status classification), `client/src/i18n/en.json` / `tr.json` (labels; the
  filter group's label generalizes from "by branch" to "filter agents"). The `live` map
  and `unseenResult` flag already reach the toolbar — no backend changes.
- Advanced-mode gate unchanged (strip is already behind it). Basic mode unaffected.
