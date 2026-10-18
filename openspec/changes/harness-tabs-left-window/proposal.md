# Harness tabs land in the other Chrome window — for good (fleet task d3af3b9b)

## Why

The Operator keeps two Chrome windows: the Management dashboard on the RIGHT, the repo agents' harness tabs
on the LEFT. Every "open harness" click (Status, Kanban, Recurring, Task graph, Requests…) must put the
agent's tab into the LEFT window — one tab per agent, focused without a reload on a re-click — and never into
the dashboard's window. Four earlier changes got part of the way and then lost it:

| change | mechanism | why it failed |
|---|---|---|
| kanban-worker-window (#109/#110) | one named worker tab | named tabs always open in the **dashboard's** window |
| management-settings-tab (#123) | "dedicated window" with position/size features | features make a **popup** window — it cannot hold tabs; agent tabs still went to the dashboard's window |
| harness-window-agent-tabs (#124) | a launcher tab in the other window, reached by **name** + a kept JS handle | the handle dies on every reload; the name lookup only works inside one browsing-context group, which Chrome **replaces** when the dashboard reloads through an error page (a harness restart / redeploy) and which never contains a launcher opened by hand. Then the lookup made a blank tab **in the dashboard's window**, the launcher was "recreated" there, and every agent followed it. A blocked or missing launcher also fell back to opening **beside the dashboard** on purpose |
| harness-window-reclick-raise (#125) | dashboard raises by name | correct idea, same name-lookup fragility; the default mode stayed "tabs in this window" |

Measured in real Chrome (`.claudeweb-preview/playwright/check-left-window*.mjs`): F5 and a re-typed URL keep
the name link; **a reload that went through an error page loses it** — exactly what a harness restart does to an
open dashboard.

## What changes

- A new shared mechanism, `harnessHost.js`: the dashboard reaches a small **harness host** tab in the left window
  over a same-origin **BroadcastChannel** — no window names, no handles, nothing a reload, an error page or a new
  dashboard tab can break. The host opens / raises the agent tabs next to itself (the only way a page can put a
  tab into another window).
- A **window guard**: tabs of one Chrome window report the same screen rectangle, so a host still in the
  dashboard's window only **queues** agents ("drag me into your left window") and opens them the moment it is
  moved. Nothing on this path ever opens in the dashboard's window.
- First click with no host = the host is opened beside the dashboard with the agent queued and a one-time toast;
  an older host that wakes up in another window (Chrome restores background tabs lazily) takes the queue over
  and the new one closes itself.
- Re-click: the host switches the existing tab to the agent (no reload); the **dashboard** raises it by name from
  its own click where Chrome allows that, and says plainly when it could not.
- The placement setting defaults to the left window (new storage key, so every machine lands left); "beside the
  dashboard" stays one explicit choice away. The retired popup-window / screen-picker / launcher-by-name code is
  removed. Every entry point already goes through `openAgentHarness` → `focusAgentTab`, so all of them follow.

## Impact

- Client only: `components/shared/harnessHost.js` (new), `harnessWindow.js` (placement only), `workerWindow.js`,
  `manage/HarnessLauncher.jsx` (the host page), `manage/ManageSettings.jsx`, `manage/openNotice.js`, `main.jsx`
  (the studio bundle can render the host too), i18n. No server change.
- One-time per Chrome profile: allow pop-ups for the hub's site (the host opens tabs without a click of its own).
- Supersedes the placement parts of the unarchived changes `management-settings-tab`, `harness-window-agent-tabs`
  and `harness-window-reclick-raise`.
