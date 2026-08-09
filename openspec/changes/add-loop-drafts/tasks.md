## 1. Backend — store + API

- [ ] 1.1 Add `Services/Autopilot/LoopDraftsStore.cs`: `loop-drafts.json` under `AppPaths.DataDir`, shape `{ repoId: { type: { text, savedAt } } }`, atomic temp+rename write, never-reseed-on-unreadable load, no seeding; `Get(repoId, type)`, `Put(repoId, type, text)` (returns savedAt), `Summary()` (per-repo per-type nonEmpty + savedAt)
- [ ] 1.2 Register the store in `Program.cs` / DI the same way `BriefingRulesStore` is built and passed
- [ ] 1.3 Add endpoints to `AutopilotController` next to `briefing`: `GET /api/autopilot/drafts` (summary joined against `RepositoryRegistry` — registered repos only), `GET /api/autopilot/drafts/{repoId}/{type}`, `PUT /api/autopilot/drafts/{repoId}/{type}` — session-auth only, NOT operator-gated, repo id validated against the registry, type validated against the closed set, body cap ~256 KB, PUT returns the saved stamp
- [ ] 1.4 Build backend to the isolated self-dev dir (never the running app's bin) and smoke the three endpoints with curl (login → PUT → GET → summary), including unknown-repo and unknown-type rejections and gate-off writability

## 2. Frontend — Drafts root tab

- [ ] 2.1 Register `loopDrafts: 'advanced'` in `client/src/context/UiModeContext.jsx`
- [ ] 2.2 Add the 📝 Drafts root tab to `AutopilotConsole.jsx`: root row button, per-repo `SubTabs` row fed by `GET /api/repos`, subtab memory via the existing `pickSub` pattern, NOT fenced by the gate (render like Overview/Research when gate is off)
- [ ] 2.3 Build the draft editor view: three-way type switcher (🗒️ Queue plan / 🎯 Goal / ✍️ Freestyle) with non-empty badges from the summary endpoint, large textarea, explicit Save + Reload, last-edited stamp, unsaved-changes hint
- [ ] 2.4 Styles in `client/src/pages/autopilot.css` (reuse ap-tabs/ap-subtabs idioms) + i18n strings in `en.json`/`tr.json`
- [ ] 2.5 Frontend build + headless browser check (per docs/claude-web/browser-testing.md) on an isolated preview: tab renders, repos listed, save/reload round-trips, badges and stamps update, gate-off editing works

## 3. Convention doc

- [ ] 3.1 Write `docs/loop-drafts-convention.md`: the three types and their content shapes (queue-plan = one self-contained prompt per `---`-separated block; goal = one coherent goal statement; freestyle = anything), the exact HTTP flow (login → GET → edit → PUT) with curl examples, and the read-then-rewrite etiquette (fetch current text, integrate, PUT the whole draft)

## 4. Homepage — "Fill the loop" topic

- [ ] 4.1 Add `homepage/assets/loopdrafts-topic.js` in the systest-topic style: operator form (base URL, access code, repo, draft type, what-the-draft-should-cover), live-generated paste-ready prompt pointing at the convention doc with the type-specific content expectation, copy disabled until required fields filled
- [ ] 4.2 Register the script in `homepage/index.html` and add any topic-specific styles to `homepage/assets/styles.css` (relative URLs only)
- [ ] 4.3 Verify the topic on :5305: form fills, placeholder highlighting, copy gating, generated prompt text correct for all three types

## 5. End-to-end round trip

- [ ] 5.1 Paste a generated prompt into an agent, let it write one (repo, type) draft via the API, and confirm the edit appears in the Drafts tab after Reload — the full fill-the-loop path
- [ ] 5.2 `openspec validate add-loop-drafts --strict` passes; update this checklist and hand off for the user's deploy decision
