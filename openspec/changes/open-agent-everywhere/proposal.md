# One way to open a repo agent's harness from every management surface — never in silence

## Why

Fleet task 720b3e0c (the Operator, 2026-10-07 evening): after PR #154, opening the harness
from Kanban card `10922cb3` (the pers-dec tracking card) still does nothing on the hub.

## What was found

- The card's target is sound: a local card (`SourceId: null`) for repo `f28d758d…` = pers-dec,
  registered on the hub, with a dock tab and a session. In a fresh browser the chip opens pers-dec
  on the Agent tab. So the failure is not the target — it is the Operator's browser state, and
  what the card did about it.
- PR #154 fixed the opener (`focusAgentTab`) for every state of the agent's tab, but its
  **notice** lived only on the Status tab. From the Kanban the same outcomes — the tab is in
  another window and the browser did not raise it, it did not answer, the pop-up was blocked —
  happened silently, exactly as before. The dedicated-harness-window mode had a branch
  (`no-launcher`: the launcher tab was closed) that ended in nothing at all. The card's title
  double-click renames; the card had no explicit "Open harness" control; the Task graph's
  chips opened nothing; the Repo Agent Requests rows had no open control; and each surface
  resolved the machine on its own.

## What changes

1. **One opener for all**: `openAgentHarness({ sourceId, repoId, label })` in
   `components/shared/openAgent.js` resolves the machine from the fleet status (the last one any
   surface fetched is remembered), builds the deep link, and either hands it to the tab opener
   or **announces why not**: `no-fleet`, `unknown-machine`, `no-address`, `unknown-agent`,
   `unreachable` (the last one opens anyway, with a warning).
2. **One notice for all**: `OpenAgentNotice` is mounted once at the top of the Management App
   (and on the studio's Ideas page), so the Kanban, the Task graph, Recurring, Requests and
   Status all show what happened, with the "open … in a new tab ↗" link where the tab may not
   have come to the front.
3. **Entry points**: the Kanban chip always opens through the helper and the expanded card gets
   an explicit **⧉ Open harness** per agent assignee; Task-graph nodes and assignee chips open
   their agent; each Repo Agent Requests row gets **⧉ open harness**; the Recurring chip and the
   Status tab go through the helper.
4. The dedicated-window mode falls back to a tab beside the dashboard when its launcher is gone
   or blocked, and announces its own outcomes.

## Impact

- Affected specs: `management-dashboard` (ADDED requirement).
- Affected code: `openAgent.js` (new), `OpenAgentNotice.jsx` (new), `workerWindow.js`,
  `openNotice.js`, `FleetStatus.jsx`, `ManageApp.jsx`, `IdeasPanel.jsx`, `KanbanBoard.jsx`,
  `TaskGraphPanel.jsx`, `RecurringTab.jsx`, `AgentRequests.jsx`, styles; Management bundle.
- Evidence: `openAgent.test.mjs`; lab e2e `.claudeweb-preview/card/verify.mjs` on the real board
  — card 10922cb3 from the chip and the button in the fresh, existing-tab and dashboard-in-the-
  named-tab situations with the notice on the Kanban, the Task graph node, the Status tab
  regression; screenshots `docs/screenshots/card-open-*.png`.
