# The tabbed view's full-screen "Agent" tab — the landing tab for "open harness"

## Why

Fleet task 15502893 (the Operator, 2026-10-06): "open harness" from the Management board
(Status → Agents, the Kanban badges) opens the agent's harness and lands on the TABBED view
(the layout meant for mobile). What you land on depends on that view's own layout settings —
tab order, pane spans, the last route — so the first thing shown feels random.

## What the code says (verified)

- The tabbed view is `layout/Layout.jsx`: a header, the content area (the route's page, or the
  multi-pane strip on a wide Advanced window — `PaneStrip.useMultiPane` windows the user's
  ordered tabs around the active route, weighted by per-tab spans), and `BottomNav` over THE
  tab list `layout/tabRegistry.jsx` (saved order from `UiSettingsContext`, hidden tabs, feature
  gates; new tabs ship unmigrated at the end of a saved order).
- "Open harness" builds `<harness>/studio?agent=<repoId>` (`manage/harnessLink.js`), opened by
  `focusAgentTab` (the Settings-chosen window, one tab per agent, focus on a repeat click).
  `DockContext` consumes `?agent=` once per load: it activates / opens that repo's dock tab and
  strips the param — it never changes the route, so the page stays on whatever was there.
- The per-agent dashboard view is `PinnedAgent` ("one phone in the wall"), rendered by
  `pages/Dashboard.jsx`'s `renderDock` with live status, git, loops, flags, zoom and every
  handler. The Dashboard is the only thing that composes those props.

## What changes

1. **A new tab `agent`** (`/studio/agent`, label "Agent", Advanced; `pages/AgentView.jsx`): the
   active dock tab as its dashboard phone — chat, Builder / Ask / Files / Console / Tools lanes,
   git row, loop control, flags, local-app views — plus a thin strip to switch the active agent.
   **The embed is the Dashboard component itself** in a new `solo` mode (`<Dashboard
   solo={tabId} />`): the same state, polls and handlers, `renderDock` for one tab, no header /
   panels / grid. Nothing is copied; a change to the dashboard phone shows up here.
2. **Always full screen**: `Layout` renders this route in the plain content area even when the
   pane strip is active, with the frame's phone-column cap and the content padding removed;
   `useMultiPane` never includes the Agent tab as a pane. Tab order, spans and hidden tabs
   still shape every OTHER tab.
3. **The landing tab**: `DockContext`'s `?agent=` handler navigates to `/studio/agent` (when the
   feature is on) after activating the agent — deterministic, whatever this device's saved
   layout. An ordinary open of the tabbed view is unchanged (the Operator asked to leave it).
4. **The nav**: the Agent tab's default slot is right after Chat (an unplaced tab used to land
   at the end of a saved order); the Operator can reorder / hide it like any tab. The server's
   known-tab list accepts `agent`.

## Out of scope

- Changing how "open harness" picks the window / tab (untouched; verified by the same shots).
- Basic UI mode: the tab is Advanced like every new feature; a `?agent=` link in Basic mode
  lands on Chat as before.
