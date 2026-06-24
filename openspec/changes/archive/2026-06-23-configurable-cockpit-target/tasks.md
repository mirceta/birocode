## 1. Make the target configurable

- [x] 1.1 In `openspec-port-app/serve.mjs`, resolve `const REPO_ROOT = process.env.OPENSPEC_REPO_ROOT || dirname(ROOT)` (default = the app's parent folder, preserving current behaviour)
- [x] 1.2 Update the run-header comment to document `OPENSPEC_REPO_ROOT=… node serve.mjs`
- [x] 1.3 Print the resolved `REPO_ROOT` (and whether it came from the env var) in the startup log

## 2. Verify (still a local app, independent of the harness)

- [x] 2.1 Default path unchanged: `node serve.mjs` with the env var unset inspects the app's parent repo (byte-for-byte prior behaviour)
- [x] 2.2 Override works: `OPENSPEC_REPO_ROOT=<other repo>` makes one instance inspect that repo's `openspec/` (verified via `/api/cockpit` returning the other repo's state)
- [x] 2.3 `openspec validate configurable-cockpit-target --strict` clean; archive on ship
