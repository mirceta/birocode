## 1. Backend: commit-identity on git status

- [x] 1.1 In `GitService`, add a read of the effective commit identity for a repo via `git config --get user.name|user.email` plus `--local --get` to decide scope; `scope` = `local` (a repo-local override exists) / `global` (effective value from an outer/user/system config) / `unset` (no value) — **done** (`ReadCommitIdentity` in `GitService.cs`, reuses `RunGit` + `GIT_TERMINAL_PROMPT=0`)
- [x] 1.2 Add a typed `commitIdentity { name?, email?, scope }` to the `/api/git/status` response model; a failure to read degrades to `scope: "unset"` and never fails the rest of status — **done** (`CommitIdentity` record on `StatusResult`; serialized in `GitController.Status`)
- [x] 1.3 Confirm the three scopes against real repos — **done**: this repo → `{mirceta, kristijan.mirceta@gmail.com, global}`; a temp repo with a local `user.email` → `local`; both-empty → `unset` (guard)

## 2. Backend: global GitHub token control

- [x] 2.1 `GitHubCredentialsService`: resolve `gh` via `ProcessProbe`, `gh auth login --with-token` with the token on **stdin** (added a stdin param to `ProcessProbe.Run`), then `gh auth setup-git`, then re-derive the account via `GitHubAccountService.Refresh()`; typed `{ Ok, Host?, Account?, Error? }` — **done**
- [x] 2.2 `POST /api/github-credentials` taking `{ token }`; gh-not-installed → `ok:false` (no throw); empty/whitespace → `ok:false` "No token provided" — **done** (`GitHubCredentialsController`, always 200) and exercised
- [x] 2.3 Secret handling: token never echoed, never logged (outcome only), never persisted; `Scrub()` strips any token-like substring from gh error text — **done**; verified a bogus token does not appear in the result
- [x] 2.4 Register the service in DI — **done** (`AddAccountsModule`)

## 3. Frontend: dock identity rows

- [x] 3.1 `commits as <name> <email>` row with a `global`/`local` badge from `commitIdentity.scope`; `unset` → "not set" — **done** (`DockIdentityRows.jsx`)
- [x] 3.2 `pushes as <login | not authenticated>` row sourced from `GET /api/github-account` (dot + login, or a warning) — **done** (self-contained poll, reuses `account.*` states)
- [x] 3.3 Register the rows as **Advanced** (`gitIdentityRows`) and wire into the dock git section (`PinnedAgent.jsx`) — **done**
- [x] 3.4 i18n for both rows + badges in `en.json` + `tr.json` — **done** (`gitIdentity.*`)

## 4. Frontend: token control

- [x] 4.1 Advanced-mode masked, write-only PAT input + Save, in a column under the GitHub chip (the chip is a `<button>`, so the control sits adjacent, not nested); clears on submit, never pre-filled — **done** (`GitHubTokenControl.jsx`)
- [x] 4.2 POST to `/api/github-credentials`; inline success/failure; on success the GitHub chip flips on its next poll (server `Refresh()` busts the cache) — **done**
- [x] 4.3 Register as **Advanced** (`githubTokenControl`); i18n in en.json + tr.json — **done** (`ghToken.*`)
- [x] 4.4 Copy states it sets the push/auth identity, not the commit author — **done** (`ghToken.hint`)

## 5. Understanding app + docs

- [x] 5.1 `understanding-app/index.html` refreshed this session for the two-identity model + both mocked surfaces — kept as rolling latest
- [x] 5.2 No convention/doc edits needed (no `plan.md` — frozen)

## 6. Verify

- [x] 6.1 Build frontend (`npm --prefix client run build`) + .NET build — both clean (only the 4 pre-existing `CliRunnerService` warnings)
- [x] 6.2 Backend behavior exercised via a throwaway console: `commitIdentity` global (real) + local (temp repo) + unset; credentials endpoint handles empty/whitespace and gh-missing; **grepped the diff — the token symbol never reaches a logger, the response record, or any persisted field** (only trim → stdin → Scrub)
- [~] 6.3 Frontend (isolated preview) — **PENDING**: `/api/*` needs the operator access code and live owns `:5099`; build compiles clean and logic reviewed. The gh-token happy path additionally needs a restarted harness that sees `gh` on PATH + a valid PAT
- [x] 6.4 Security pass: token write-only end-to-end (request → stdin → gh), scrubbed errors, outcome-only logs, no plaintext persistence — confirmed
- [ ] 6.5 `openspec validate add-git-identity-surface --strict` — **PENDING**: the `openspec` CLI is not installed on this box
