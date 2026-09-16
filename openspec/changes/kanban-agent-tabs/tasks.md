# Tasks — kanban-agent-tabs

## 1. Research

- [x] 1.1 Real-engine experiment `check-agent-tabs.mjs` (playwright-core + installed Edge): per-agent tabs, find-without-reload, focus across OS windows — 6/6, finding in design.md
- [x] 1.2 Archive the superseded kanban-worker-window change (shipped, unarchived) so this delta can replace its requirement

## 2. Implementation

- [x] 2.1 Rewrite `workerWindow.js`: `agentTabName(key)` + `focusAgentTab(key, url)` (find → navigate only if about:blank → focus; cross-origin catch = focus-only)
- [x] 2.2 KanbanBoard.jsx: the assignee chip becomes the click target (`role=button`, stopPropagation, `data-open-worker`), ⧉ demoted to an aria-hidden cue
- [x] 2.3 kanban.css: `.kb__chip--goto` cursor/hover accent; ⧉ cue inherits chip colour, brightens on hover

## 3. Verification

- [x] 3.1 `workerWindow.test.mjs` node tests (stable/distinct/sanitized/null-on-empty) wired into the client "test" script; full client suite green
- [ ] 3.2 Client + Management App bundles rebuilt
- [ ] 3.3 Understanding app updated; PR opened (no merge, no deploy)
