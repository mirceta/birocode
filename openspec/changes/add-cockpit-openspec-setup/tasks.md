## 1. Backend — setup endpoint & service method

- [ ] 1.1 Add a `RunSetup(workingDir, action)` method to `OpenspecCockpitService` that maps `action` to a fixed verb — `init` → `openspec init --tools claude`, `update` → `openspec update` — and runs it via the existing `RunOpenspec(workingDir, …)`; reject any other action value.
- [ ] 1.2 In `RunSetup`, enforce the no-clobber guard for `init`: if `openspecDirPresent` (an `openspec/` directory already exists in `workingDir`), do not run init; return an "already initialized" result instead.
- [ ] 1.3 After running the verb, re-run `CheckReadiness(workingDir)` and return a result object carrying `{ ok, action, exitCode, stdout, stderr, alreadyInitialized?, ready }`.
- [ ] 1.4 Add `POST /api/openspec/setup` to `OpenspecController` that resolves the repo working dir via `RepositoryResolver` (same `X-Repo-Id` / `?repo=` path as the read endpoints), reads the `action` discriminator from the body, validates it against the fixed set, calls `RunSetup`, and returns its result; never accepts a command string, args, or a path.

## 2. Frontend — actionable readiness section

- [ ] 2.1 In `client/src/pages/Cockpit.jsx`, replace the static remediation text in the "Prepared for OpenSpec?" section with conditional actions driven by the existing `ready` data: **Set up OpenSpec** when `openspecOnPath && !openspecDirPresent`; **Update instruction files** when `openspecDirPresent`; keep the install-CLI hint when `!openspecOnPath`.
- [ ] 2.2 Wire the buttons to `POST /api/openspec/setup` with the matching action, showing a "running…" state while in flight and disabling re-trigger.
- [ ] 2.3 On response, surface success or the captured failure (exitCode/stderr) inline, and re-run the existing cockpit `load()` so readiness and the rest of the tab refresh in place without a manual reload.
- [ ] 2.4 Add the button / running / result styles to `client/src/pages/cockpit.css` under the existing `.ck` namespace.

## 3. Verify

- [ ] 3.1 Build the frontend (`npm --prefix client run build`) and the harness (`dotnet build`); confirm no errors.
- [ ] 3.2 Manually verify in the running harness: select an un-ported repo (e.g. `prg-copy1`), confirm the not-ready state offers **Set up OpenSpec**, trigger it, and confirm `openspec/` is scaffolded and readiness flips to ready with no manual reload.
- [ ] 3.3 Verify the no-clobber guard: trigger the init action against a repo that already has `openspec/` and confirm it reports "already initialized" and does not touch the existing tree.
- [ ] 3.4 Verify the **Update instruction files** action runs `openspec update` against an initialized repo and surfaces its result.
- [ ] 3.5 Confirm all existing read-only cockpit views (in-flight, shipped, baseline, drill-in) are unchanged.

## 4. Spec & docs

- [ ] 4.1 Run `openspec validate add-cockpit-openspec-setup --strict` and resolve any issues.
- [ ] 4.2 On ship, `openspec archive add-cockpit-openspec-setup` to fold the delta into the `openspec-cockpit` baseline.
