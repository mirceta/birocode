## 1. Backend: GitHub-account probe service + endpoint

- [x] 1.1 Add a `GitHubAccountService` that shells the `gh` CLI through the existing process runner: resolve `gh` on PATH (missing → `ghInstalled=false`, terminal), else run `gh api user --jq .login` (authoritative login) + `gh auth status` (host/hints) with a short timeout; map to typed `{ ghInstalled, authenticated, account?, host?, error? }` — **done** in `Services/Accounts/GitHubAccountService.cs`; spawn via shared `Services/Accounts/ProcessProbe.cs` (5s timeout, async-drained streams)
- [x] 1.2 Add a brief in-memory cache (a few seconds) so the dashboard poll + concurrent callers coalesce into ~one `gh` invocation per window — **done** (5s TTL, locked memo)
- [x] 1.3 Add a controller exposing `GET /api/github-account` returning the typed status (always `200`; "not installed"/"not authenticated" are statuses, not HTTP errors) — **done** in `Controllers/AccountsController.cs` (one controller, two routes). Probe is request-independent (synchronous read off a cache; no `RequestAborted` threaded in), so a client disconnect cannot cancel it
- [x] 1.4 Register the service in DI — **done** via `AddAccountsModule()` in `EmbeddedApi.cs`

## 2. Backend: Claude-account probe service + endpoint

- [x] 2.1 Add a `ClaudeAccountService`: resolve `claude` on PATH the way `CliRunnerService` does; read the Claude subscription login state for account + plan; map to typed `{ claudeInstalled, authenticated, account?, plan?, error? }`. Read-only, never trigger a login/billable run, never surface the token, fail soft on any unexpected shape — **done**. Source pinned (see design): `~/.claude/.credentials.json` `claudeAiOauth.{expiresAt,subscriptionType}` (live-session check + plan) + `~/.claude.json` `oauthAccount.emailAddress` (account)
- [x] 2.2 Add the same brief in-memory cache (a few seconds) — **done** (5s TTL)
- [x] 2.3 Add a controller exposing `GET /api/claude-account` returning the typed status (always `200`); disconnect cannot cancel it — **done** (second route on `AccountsController`)
- [x] 2.4 Register the service in DI — **done** (same `AddAccountsModule()`)

## 3. Frontend: two collapsible account chips beside the Scoreboard

- [x] 3.1 Shared chip component (dot + handle + collapsible body); GitHub view: collapsed = dot + `@login` (or "gh not installed"), expanded = installed/authenticated + account + host; persist collapse in `localStorage` (`claudeweb_github_account_collapsed`) — **done** in `components/dashboard/AccountChips.jsx` (`AccountChip` + `githubView`)
- [x] 3.2 Claude view: collapsed = dot + `account · plan` (or "claude not installed"), expanded = installed/logged-in + account + plan; persist collapse (`claudeweb_claude_account_collapsed`) — **done** (`claudeView`)
- [x] 3.3 Each chip renders the three states (not-installed / not-authenticated / authenticated) with distinct dot styling; polls its endpoint on the ~5s cadence, keeping the last good value on a failed tick — **done**
- [x] 3.4 In `Dashboard.jsx`, wrap so `<Scoreboard />` and the account strip share one horizontal flex row (`.dash__scoreboard-row`), chips take only the width they need and wrap under on narrow phones — **done** (CSS in `dashboard.css` + `accountChips.css`)
- [x] 3.5 Add i18n strings to `client/src/i18n/en.json` + `tr.json` — **done** (`account.*` keys, EN + ASCII-folded TR)
- [x] 3.6 Register the widget as **Advanced** in the capability map in `UiModeContext.jsx` — **done** (`accountChips: 'advanced'`)

## 4. Understanding app + docs

- [x] 4.1 Author/refresh `understanding-app/index.html` (build-less, vendored, relative URLs) for both account-probe flows + the dashboard chips — **done** (5 tabs incl. live two-chip simulator)
- [x] 4.2 Confirm no convention/doc edits are needed (no `plan.md` edits — frozen) — no convention changed

## 5. Verify

- [x] 5.1 Build frontend (`npm --prefix client run build`) + .NET build clean — both green (only the 4 pre-existing `CliRunnerService` nullable warnings)
- [x] 5.2 Backend behavior — exercised the **real** services directly (throwaway console newing up `GitHubAccountService`/`ClaudeAccountService` + `Logger`): GitHub returned `{ghInstalled:false,…,"gh not found on PATH"}` (CLI-missing state on this box) and Claude returned `{claudeInstalled:true,authenticated:true,account:"…@gmail.com",plan:"Max"}` (token never surfaced) — confirming PATH resolution, credentials/expiry parsing, plan title-casing, fail-soft reads, and the camelCase contract. Installed-but-unauthenticated GitHub path not reproducible here (gh absent); covered by code review
- [ ] 5.3 Frontend (Playwright): both chips render beside the Scoreboard, three states each, per-chip collapse persists, narrow viewport wraps — **PENDING**: `/api/*` requires the operator's access code and live occupies `:5099`; needs an isolated preview (`:5200`) + a logged-in/seeded session. Build compiles clean; mapping logic reviewed
- [ ] 5.4 `openspec validate add-account-status --strict` → **PENDING**: the `openspec` CLI is not installed on this box (not on PATH, no npx package). Artifacts follow the established shape; install the CLI to gate
