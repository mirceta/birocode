## Context

The Harness drives git for each registered repo through
`ClaudeWeb.App/Services/Git/GitService.cs` and exposes it via
`ClaudeWeb.App/Controllers/GitController.cs` (`/api/git/status`, `/api/save`,
`/api/git/push-current`, …). Two facts pin this design:

- **Commit identity is inherited, not set.** `GitService` runs `git commit -m …`
  with no `-c user.*` / `--author`, so commits take whatever `git config user.email`
  resolves on disk. On this box that is the **global** `~/.gitconfig`
  (`mirceta` / `kristijan.mirceta@gmail.com`); there is no `includeIf` and no repo
  has a local `user.*` override.
- **Push auth is delegated.** Pushes run with `GIT_TERMINAL_PROMPT=0` and no token,
  so authentication comes entirely from the system credential helper
  (`credential.helper=manager`, Git Credential Manager), which is **host-keyed** —
  one `github.com` credential shared by every repo. No `github.com` token is stored
  yet.

The dashboard already surfaces the **global** GitHub account via the
`add-account-status` work (`AccountChips.jsx` → `GET /api/github-account`, backed by
`Services/Accounts/GitHubAccountService.cs` + the shared `ProcessProbe.cs` `gh`
resolver). The dock git section (`PinnedAgent.jsx:507-578` + `GitStatusSummary.jsx`)
shows branch + ahead/behind + action buttons and no identity. `gh` 2.95.0 is now
installed but not logged in.

This change adds (1) a per-repo **commit-identity** read folded into the existing git
status, surfaced as two dock rows alongside the already-available GitHub account; and
(2) a write-only **token control** that establishes the global GitHub credential from
a pasted PAT.

## Goals / Non-Goals

**Goals:**
- Show, per agent dock, the **effective commit identity** (name + email) with a
  `global` vs `local` scope badge, and the **GitHub account** pushes authenticate as.
- Let the Operator establish a **global, host-keyed** GitHub credential from a PAT
  entirely in-app, so one token serves both the GitHub API and `git push`.
- Handle the token as a secret: write-only, never echoed/logged/persisted in plaintext.

**Non-Goals:**
- No UI control over the **commit-author** identity (`user.name`/`user.email`); this
  change reads it, never writes it. The token control sets **auth only**.
- No per-repo credentials, per-repo `includeIf`, or per-repo token resolution.
- No OAuth/web/device-flow login — token paste only (the one flow that is fully
  non-interactive and server-drivable).
- No reading, display, masking-then-revealing, or export of any stored token.
- No non-GitHub hosts.

## Decisions

### 1. Commit identity rides on `/api/git/status`, not a new endpoint

The dock already polls `GET /api/git/status` per repo. Add a `commitIdentity` object
to that payload rather than a second request:

```json
"commitIdentity": { "name": "mirceta", "email": "kristijan.mirceta@gmail.com", "scope": "global" }
```

- Read via `git config --show-origin --get user.name` and `… user.email` in the
  repo's working dir. The `--show-origin` prefix (`file:<path>`) tells us whether the
  value came from the repo's own `.git/config` (→ `scope: "local"`) or an outer file
  such as `~/.gitconfig` / system (→ `scope: "global"`). No value → `scope: "unset"`,
  `name`/`email` null.
- Read-only and cheap (two `git config` reads); reuse `GitService`'s existing
  `RunGit` helper and its `GIT_TERMINAL_PROMPT=0` env. A failure to read identity must
  **not** fail the whole status call — degrade to `scope: "unset"`.

*Why fold in rather than a new endpoint:* the value is per-repo and already wanted at
exactly the moments status is fetched; a separate endpoint would double the dock's
git chatter for one extra field.

### 2. "pushes as" reuses the existing global GitHub probe

The push/auth account is host-global (one `github.com` credential), and
`GET /api/github-account` already reports it. The dock's "pushes as" row consumes
that existing probe result — no new backend. The row therefore reads the same in
every dock (correctly — it *is* global), and flips to authenticated once a token is
established. This keeps the two identities visibly distinct: "commits as" is per-repo
config; "pushes as" is the global gh login.

### 3. Token control: `gh --with-token` + `gh auth setup-git`, stdin only

A new `POST /api/github-credentials` (write-only) takes `{ token }` in the body and:

1. Resolves `gh` via the shared `ProcessProbe` resolver (404-style typed result if
   `gh` is not installed — same not-installed state the chip already models).
2. Runs `gh auth login --with-token` with the **token written to the process's
   stdin**, never as an argument (argv is visible in process listings) and never in
   an env var that could be logged.
3. On success, runs `gh auth setup-git` so `git push` over HTTPS uses gh as its
   credential helper — one token then serves both the API and pushes.
4. Returns a typed `{ ok, host, account?, error? }` — the **account is re-derived by
   re-probing** (`gh api user`), never reflected from the submitted token. The token
   itself is **never** in the response.

*Why gh over writing GCM directly:* gh is already a dependency of the account probe,
`--with-token` is the one fully non-interactive login, and `setup-git` wires the same
credential into git's push path — so a single paste fixes both surfaces and also turns
the existing GitHub chip green. *Alternative considered:* `git credential approve`
piped to GCM — rejected as the primary path because it authenticates `git` but not the
`gh` API calls the harness also makes (PR/review flows), so it would leave the chip
red and the API unauthenticated.

### 4. Secret handling

- The token exists only as a request-body string and a stdin write; it is never
  assigned to a logged field, never put in argv/env, never written to
  `repositories.json` or any app state. `gh` owns persistence in its own secure store.
- The endpoint logs only **outcome** (`ok` / a sanitized error), never the token or
  any substring of it. Errors from `gh` are passed through **scrubbed** so a token
  echoed in a gh error message can't leak.
- The request rides the existing authenticated `/api` channel (the
  `PasswordAuthMiddleware` gate); over the preview proxy it must be POST (bodies on
  the sub-path), consistent with other mutating endpoints.
- The frontend field is write-only: it submits and clears; it never fetches or
  displays a stored token. Browser autofill/`autocomplete=off`, `type=password`.

### 5. Frontend placement

- **Dock identity rows** — render inside the existing git section in
  `PinnedAgent.jsx` (or `GitStatusSummary.jsx`), below the branch/ahead-behind row:
  `commits as <name> <email>` with a small `global`/`local` chip from `scope`, and
  `pushes as …` from the GitHub account probe (dot + login, or a "not authenticated"
  warning). Both read-only.
- **Token control** — an Advanced-mode entry point, most naturally in the GitHub
  chip's expanded body or an adjacent "Set token" affordance, so the place that
  *reports* the GitHub identity is also where you *fix* it. A text input
  (`type=password`), a Save action, and an inline result.
- **UI mode** — both register as **Advanced** in `UiModeContext.jsx` (new-feature
  default). The commit-identity field on the status payload is harmless in Basic
  (simply unused) — but the rows and the token control are Advanced-gated.

## Risks / Trade-offs

- **Token leakage** — the dominant risk; mitigated by stdin-only transport, scrubbed
  gh errors, outcome-only logging, no persistence in our code, and a write-only field.
  Reviewed explicitly during apply (grep the diff for the token symbol reaching any
  logger/serializer).
- **Rows read identically across docks today** — accepted and surfaced (they show the
  *effective* identity; they diverge only when a repo overrides). Documented in the
  Understanding app so it isn't mistaken for a bug.
- **`gh` not installed / not on PATH for the live harness** — the token endpoint
  returns the typed not-installed state (no throw); operationally the harness must be
  restarted after installing gh before the endpoint works. Called out in the proposal.
- **`gh auth setup-git` alters the user's git credential config** — it's the intended
  effect (wire gh as helper), but it is a real mutation of global git config; the
  endpoint does only this one documented mutation and nothing else.
- **`--show-origin` format / locale** — parse only the `file:`-vs-not distinction and
  the path prefix, not localized prose; unknown shape → `scope: "unset"` rather than a
  wrong badge.

## Migration Plan

Additive. `commitIdentity` is a new optional field on an existing payload (old
clients ignore it). The token endpoint and the two dock rows are new and
Advanced-gated. No data migration; `repositories.json` is untouched. Verify on an
isolated preview port: the dock rows render the effective identity and scope badge;
the token control reaches the endpoint and (with a valid PAT) flips the GitHub chip to
authenticated on its next poll while never echoing the token. Rollback is a straight
revert — no persisted state on our side (gh's own credential store is the user's and
is left as-is, exactly as a manual `gh auth login` would leave it).

## Open Questions (resolve during apply)

- **Exact dock placement** of the two identity rows and the token affordance — settle
  against the rendered dock (inside `GitStatusSummary` vs `PinnedAgent`'s git block).
- **Token validation depth** — whether to pre-validate the PAT shape client-side
  (e.g. `ghp_`/`github_pat_` prefixes) or rely solely on gh's accept/reject; lean on
  gh as the source of truth, with at most a light non-empty check.
- **Error surface** — how much of gh's failure reason to show (scrubbed) vs a generic
  "couldn't authenticate"; pin a scrub rule that strips any token-like substring.
- **Whether to offer a "commit identity" setter later** — explicitly deferred; this
  change reads commit identity only. Captured here so the boundary is intentional.
