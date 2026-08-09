## 1. Feature gate

- [x] 1.1 Register `openspecDock: 'advanced'` in the capability map in `client/src/context/UiModeContext.jsx`, alongside `filesDock` / `eventConsole`
- [x] 1.2 In `PinnedAgent.jsx`, add `const openspecOn = useFeature('openspecDock')` and a `const [showOpenspec, setShowOpenspec] = useState(false)` view-state, mirroring the Files/Console pattern

## 2. Repo-scope the Cockpit view

- [x] 2.1 Give `client/src/pages/Cockpit.jsx` an optional `repoId` (and `repoName`) prop: when present, fetch with `apiGet(path, { repoId })` and label the header from `repoName` instead of the global `useRepo()` selection; when absent, behave exactly as today (Studio tab unchanged)
- [x] 2.2 Verify `GET /api/openspec/cockpit` honors the `X-Repo-Id` override with a direct request; only if it hard-depends on the global selection, add a scoping fix in `OpenspecController` (expected: no backend change)

## 3. Dock OpenSpec lane

- [x] 3.1 Add the fifth lane button (`role="tab"`, `.phone__lane`) after Console in `PinnedAgent.jsx`, gated on `openspecOn`; its handler clears `openApp`/`showFiles`/`showConsole` and sets `showOpenspec`
- [x] 3.2 Add `showOpenspec` to every mutual-exclusion site that today reads `showFiles`/`showConsole`: the other lanes' reset handlers + `aria-selected`, the `chatShowing` computation, the discover/understanding/git "chat furniture" hide guards, and the `.phone__main` render switch (render `<Cockpit repoId={tab.repoId} repoName={tab.repoName} />` when `showOpenspec`)
- [x] 3.3 Add i18n strings for the lane label and hint (e.g. `openspec.tab` / `openspec.hint`) in the locale files, matching how `files.tab` / `console.tab` are defined

## 4. Verify

- [x] 4.1 `npm --prefix client run build` is clean
- [x] 4.2 Browser check (headless Playwright per the browser-testing doc): the OpenSpec lane appears in Advanced mode, selecting it shows the Cockpit over the chat with the composer below, and the lanes are mutually exclusive (selecting another lane swaps away) — `.claudeweb-preview/playwright/verify-dock-openspec-lane.mjs`, 15/15 checks on an isolated instance built from main
- [x] 4.3 Two docks bound to different repos each show their own repo's OpenSpec state, and changing the global repo selector does not alter either dock's OpenSpec lane — same run: dock A (openspec/ present) renders the ready Cockpit named oslane-a while dock B renders the not-ready panel named oslane-b, global selection on a third repo; switching the Projects-tab selector to oslane-b leaves dock A scoped to oslane-a
- [x] 4.4 The lane is absent in Basic mode with the flag off — same run: zero OpenSpec lanes render in Basic (the agent-dock surface itself is Advanced-gated, so the lane is doubly gated)
