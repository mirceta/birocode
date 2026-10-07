## 1. Build

- [x] 1.1 `management/arch-example-categories.json`: 23 ordered categories (name, description, template, tip, tools, endsInGoal, patterns, antiPatterns).
- [x] 1.2 `ArchExamplesMiner`: sources (transcripts via `SessionService.ProjectsDirectoryFor(arch home)`, `ArchStateStore.Goals()`, `AgentRequestStore.All()`), Operator-turn filter, scrub, classify, dedupe, typical examples, per-week timeline; writes `arch-examples.json`; `Current()` falls back to the committed snapshot.
- [x] 1.3 `ArchExamplesController`: `GET /api/arch/examples`, `POST /api/arch/examples/mine` (409 where mining cannot run); DI.
- [x] 1.4 `ArchExamples.jsx` + `archExamplesModel.js` + `archExamples.css`; tab `examples` in `ManageApp.jsx`; i18n en/tr. Management bundle rebuilt.
- [x] 1.5 `management/arch-examples.json`: the snapshot mined on the hub.

## 2. Verify

- [x] 2.1 xunit `ArchExamplesTests` (34 real phrasings → categories, harness-turn filter, scrub, transcript parse, report counts / examples / timeline, ISO weeks); node `archExamplesModel.test.mjs`; both full suites.
- [x] 2.2 Lab e2e `.claudeweb-preview/examples/verify.mjs` on the REAL transcripts and a copy of the live store: mine (≈300 requests, 23 categories, long tail ≈ 14 %), no token / e-mail in the report, the tab with chart, sparkline, bar pick, search, copy; screenshots `docs/screenshots/arch-examples-tab.png`, `arch-examples-category.png`.

## 3. Ship

- [ ] 3.1 PR; merge + deploy on the Operator's word. After a deploy, press Re-mine on the hub once so the data dir holds a fresh run.
