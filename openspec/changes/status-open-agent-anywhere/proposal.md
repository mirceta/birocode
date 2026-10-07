# Status → Agents: "open harness" opens the agent whatever its tab is doing, and says so

## Why

Fleet task 608f281a (the Operator, 2026-10-07, second report): double-clicking the pers-dec
agent of DESKTOP-POAPPP3 on Management → Status does nothing, while other agents open fine.

## What happened (reproduced on a lab hub fed with a copy of the live store)

pers-dec has a dock tab, a session and a sendable address — the target was never the problem.
The opener was: `focusAgentTab` called `window.open('', <per-agent tab name>)`, and whatever
handle came back was treated as success. A first open works (a fresh tab, navigated to
`/studio?agent=…`, landing on the Agent tab). After that, three everyday situations did nothing
visible and said nothing:

1. the Management App itself lives in the tab named for pers-dec (opened from a badge once, then
   navigated to the dashboard — pers-dec is the Operator's most-used agent): the handle IS the
   dashboard's window, nothing is navigated, nothing is focused;
2. pers-dec's tab was navigated to another page: an existing tab is "focused as-is, never
   renavigated", so it stays on that page;
3. pers-dec's tab lives in another window and shows another agent: the browser did not raise it
   and nothing switched it.

Other agents "worked" because they had no tab yet — the only case the old code handled.

## What changes

- The handle is read, not trusted: the caller's own tab → the name is released and the agent
  opens in a fresh tab beside the dashboard; a new or parked same-origin tab → navigated to the
  agent; the studio (same origin) or another machine's harness (cross-origin) → asked by a window
  message to show the agent, which the harness answers with an ack; no handle → pop-up blocked.
- `DockContext` handles the message with the same act as the `?agent=` deep link (activate the
  dock tab, open one when the repo has none, land on the Agent tab) and acknowledges it.
- Every outcome is announced on the page; the Status tab shows one line under the filters —
  the quiet ones fade, and when the agent's tab may not have come to the front (no ack, blocked,
  another window) the line stays with a plain "open … in a new tab" link. A click never does
  nothing in silence.
- The details' primary "Open harness" button and the Kanban badge go through the same opener.

## Impact

- Affected specs: `management-dashboard` (ADDED requirement, refining status-agent-dblclick).
- Affected code: `workerWindow.js`, new `agentLink.js`, `DockContext.jsx`, `FleetStatus.jsx` +
  `openNotice.js`, `manage.css`; Management bundle rebuilt.
- Evidence: unit tests (opener plans, dock request parsing, notice text); lab e2e
  `.claudeweb-preview/open/verify.mjs` on the live store copy — pers-dec in all four situations
  plus a local and a remote agent; screenshots in `docs/screenshots/status-open-pers-dec-*.png`.
