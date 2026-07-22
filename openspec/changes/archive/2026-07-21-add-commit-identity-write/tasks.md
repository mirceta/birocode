## 1. Backend — writer + endpoint

- [x] 1.1 Add `GitService.SetCommitIdentity(workingDir, name, email, scope)` → typed `SetIdentityResult(ok, name, email, scope, error)`; writes `user.name`/`user.email` via `RunGit` literal args at `--local` (default) or `--global`; trims inputs; rejects when both empty; re-reads identity on success; degrades errors into the result (never throws to a 500)
- [x] 1.2 Add `POST /api/git/identity` to `GitController`: resolve repo, 409 while `_runs.IsBusy`, map scope (`global`→global else local), return `{ ok, name, email, scope }` on success or `422 { ok:false, error }` on failure/empty

## 2. Frontend — editable "commits as" row

- [x] 2.1 Add `gitIdentity.edit.*` i18n keys (edit, name, email, scope local/global, save, cancel, saving, error) to BOTH `en.json` and `tr.json`
- [x] 2.2 Make `DockIdentityRows.jsx` editable: an edit affordance on the **commits as** row toggling an inline name/email (+ scope) form; on save `apiPost('/git/identity', …, { repoId })`, then call an `onSaved`/refresh so the dock re-fetches status; show inline error, disable while saving; **pushes as** row unchanged
- [x] 2.3 Pass the dock's git refresh (`onRefreshGit`) into `DockIdentityRows` from `PinnedAgent.jsx` as the save callback
- [x] 2.4 Add minimal `dockIdentity.css` for the inline editor (inputs, save/cancel, error), consistent with the compact row styling

## 3. Tests — first identity coverage

- [x] 3.1 Create `tests/ClaudeWeb.Tests` xUnit project; reference `ClaudeWeb.App`; add to `ClaudeWeb.sln`
- [x] 3.2 Temp-repo (`git init`) tests for `SetCommitIdentity`: read unset → write local → read back `scope: local`; only-name; only-email; empty rejected (no mutation)
- [x] 3.3 Global-scope test with isolated `HOME`/`GIT_CONFIG_GLOBAL` (never touch the real `~/.gitconfig`): write global → read back `scope: global`
- [x] 3.4 Guard/shape test: request with neither name nor email returns the empty-rejection result

## 4. Verify

- [x] 4.1 `dotnet build` clean; `dotnet test tests/ClaudeWeb.Tests` green
- [x] 4.2 `npm --prefix client run build` clean
- [x] 4.3 In an isolated self-dev harness build (never live :5099), open a dock, edit **commits as**, confirm the row updates and `git config --local user.name` in that repo reflects it
- [x] 4.4 `openspec validate add-commit-identity-write --strict` passes
- [x] 4.5 Update `understanding-app/index.html` to show the commits-as vs pushes-as split and the new write path (per repo convention)
