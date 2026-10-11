# "Open harness" lands on the card's local app — tracking cards deep-link machine + agent + app

## Why

Fleet task 95863f51 (the Operator, 2026-10-11). A tracking card names the machine, the repo agent and
optionally the local app (`appId`) the job runs in. "Open harness" opened the agent but not the app —
the Operator then had to find and click it by hand. And the card's app was a raw id typed by hand for
any agent on another machine.

## What changes

- **One opener, one more argument.** `openAgentHarness({ sourceId, repoId, label, app })` — the shared
  helper behind Status, Kanban, Task graph, Recurring and Repo Agent Requests. The deep link is
  `…/studio?agent=<repoId>&app=<appId>`; the open-agent window message carries `app` too, so an
  agent tab that is already open switches to the app without a reload (the per-agent tab, the
  dedicated harness window's launcher, and another machine's harness alike).
- **The dock opens the app as a click does.** The studio reads `?app=` with `?agent=` (and from the
  message), and the matching dock selects that local app once its app list has loaded.
- **App not there.** The agent still opens, without the app, and the shared toast says
  `app <id> not found on <agent>` — on the dashboard when the fleet status already lists the agent's
  apps, otherwise in the agent tab.
- **Apps are known fleet-wide.** A peer's describe lists each repo's local apps; the fleet status and
  `list_agents` carry them. The Recurring editor's app picker lists any agent's apps (a peer's too);
  only a peer on an older build still needs the id typed.
- **The arch.** `create_recurring` / `update_recurring` take `appId` by id or by name from the agent's
  apps and refuse an unknown one with the list; guidance + tool text updated (role v19).

## Impact

- Specs: `recurring-tasks` (ADDED), `open-agent-everywhere` (ADDED).
- Code: `openAgent.js`, `agentLink.js`, `workerWindow.js`, `harnessWindow.js`, `harnessLink.js`,
  `DockContext.jsx`, `PinnedAgent.jsx`, `RecurringTab.jsx`, `recurringCards.js`, `openNotice.js`;
  `FleetClient.PeerRepo.Apps`, the describe / fleet status / `list_agents`, `ArchAgentService.Recurring`.
- Cards without an app behave as before.
