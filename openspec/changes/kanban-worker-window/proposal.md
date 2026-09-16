# Kanban → one reused worker window onto any machine's harness

## Why

From the management dashboard (M) the Operator wants to jump straight to the
worker: click a Kanban card and see THAT machine's harness with THAT repo
agent's dock open, in one dedicated worker surface (W) that every click reuses
— never a new window per click. The Operator suspected plain Chrome cannot
retarget an open tab from another tab, so a two-window WinForms/WebView2 app
was on the table; the brief ordered research first.

## Research finding (browser vs WinForms)

**The browser does it; no native app is needed.** `window.open(url, NAME)` with
a fixed window name reuses the auxiliary browsing context this page opened
under that name and NAVIGATES it to the new URL — cross-origin included. The
"tabs can't retarget each other" instinct is true only for *unrelated* tabs; a
named window the page itself opened is always navigable by its opener. Proven
against real Chromium/Edge in
`.claudeweb-preview/playwright/check-worker-window.mjs` (three origins, real
clicks): **4/4 PASS** — one worker opens, the second and third clicks reuse and
renavigate it cross-origin, and the name association even survives a reload of
M. Platform limits, accepted: the association is scoped to the opener's tab
(a second management tab gets its own worker — still one worker per management
window, which is the M/W model), and `focus()` is best-effort (navigation is
reliable; raising a background OS window is the browser's call). The WinForms
fallback (two WebView2 forms, host-relayed messaging) is documented in
design.md but NOT built.

## What Changes

- **Deep link** (the dependency): `/studio?agent=<repoId|handle|name>` —
  on load the dock activates that repo's existing agent tab or opens one, then
  consumes the param. Without this no URL could open "that exact agent".
- **Worker link builder**: `agentWorkerHref(machine, root, agent)` — the same
  never-guessed peer-registry address the Fleet Status "open harness" link uses
  (`harnessHref`), plus `/studio?agent=<the target machine's own repoId>`.
  Null when the machine's address is unknown → no button, never a broken href.
- **Kanban card button**: each assignee chip gets a quiet ⧉ that calls
  `openInWorker(url)` — `window.open(url, 'birocode-worker')` + best-effort
  focus, from the shared `workerWindow.js`. Multi-assignee cards get one per
  assignee (each targets its own machine + agent).

## Impact

- Affected specs: `task-graph` (Kanban card affordance), `agent-dock` (deep link).
- Affected code: `DockContext` (param), `harnessLink.js`, new shared
  `workerWindow.js`, `KanbanBoard`, kanban.css; research script under
  `.claudeweb-preview/playwright/`.
- No backend change; no native app.
