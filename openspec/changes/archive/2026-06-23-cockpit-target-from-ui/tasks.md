## 1. Server — per-request target

- [x] 1.1 Rename the module constant to `DEFAULT_ROOT` (env var or app parent); add async `resolveRoot(raw)` that returns the default when `raw` is empty and otherwise validates it is an existing directory (clean userFacing error if not)
- [x] 1.2 Thread a `cwd`/`root` argument through `runExec`, `execJson`, `cockpitState`, `readArchive`, `readArchivedChange`, `changeTouches`, `readTasks`
- [x] 1.3 `/api/cockpit`, `/api/cockpit/show`, `/api/cockpit/archived` read `?root=`; `/api/exec` left on the default (Console untouched)
- [x] 1.4 `cockpitState` returns the resolved `repoRoot`; invalid root → 400 `{error}`

## 2. Frontend — repo-root textbox

- [x] 2.1 Add a repo-root input + Go button to the Cockpit toolbar
- [x] 2.2 Track the current root in JS; append `root` to the three cockpit fetches (state + both drill-ins)
- [x] 2.3 Pre-fill the textbox from the resolved `repoRoot` on first load; submit (Enter / Go) re-reads against the typed path
- [x] 2.4 Surface a rejected root (400) in the Cockpit body

## 3. Verify

- [x] 3.1 `node --check serve.mjs`; default load still inspects birocode
- [x] 3.2 Typing another repo's root re-reads against it; textbox pre-fills with the default
- [x] 3.3 Bad path returns a clean error in the UI
- [x] 3.4 `openspec validate cockpit-target-from-ui --strict` clean; restart live :5310; archive on ship
