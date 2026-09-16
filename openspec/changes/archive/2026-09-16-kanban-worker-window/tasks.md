# Tasks — kanban-worker-window

## 1. Research

- [x] 1.1 Named-target experiment against a real engine (`check-worker-window.mjs`): reuse, cross-origin renavigation, M-reload survival — 4/4, finding documented in design.md
- [x] 1.2 Decision: pure web; WinForms/WebView2 fallback documented, not built

## 2. Deep link

- [x] 2.1 `/studio?agent=<repoId|handle|name>` in DockContext: resolve (id → handle → name), activate or open the dock tab, consume the param

## 3. Worker link + button

- [x] 3.1 `agentWorkerHref` + `harnessRootFromLocation` in harnessLink.js (peer-registry base, proxy-prefix aware, null-safe)
- [x] 3.2 Shared `workerWindow.js`: `openInWorker` with the fixed `birocode-worker` name + best-effort focus
- [x] 3.3 Kanban assignee chip ⧉ button (per assignee on multi-assignee cards; hidden when the machine is unknown) + css

## 4. Verification

- [x] 4.1 harnessLink node tests (worker href shapes, encoding, nulls, root heuristic); full client suite green
- [x] 4.2 Client + Management App bundles rebuilt
