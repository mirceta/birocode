## Context

The Harness acts on the Operator's behalf as **two identities**, and surfaces
neither:

- **GitHub** — through `git` (clone/fetch/push, wrapped by
  `ClaudeWeb.App/Services/Git/GitService.cs`) and `gh` (PRs, deploy/review flows).
  The identity those authenticate as is the `gh` CLI's **global** logged-in account
  — `gh auth status` reports it, and `git` push over HTTPS reuses `gh`'s credential
  helper.
- **Claude** — every agent run shells the `claude` CLI via `CliRunnerService`, which
  **removes `ANTHROPIC_API_KEY` from the child env** (line ~723) so the CLI always
  authenticates with the **Max/Pro subscription login**, never an API key. The
  identity is therefore whatever subscription account the `claude` CLI is logged
  into on this box.

Nothing in the Harness reads or shows either, so the dashboard can't answer "who am
I — to GitHub and to Claude — and are those logins healthy?".

The dashboard already has one header widget, the **Scoreboard**
(`client/src/components/dashboard/Scoreboard.jsx`), rendered full-width above the
agent docks in `Dashboard.jsx` (`<Scoreboard />` at line ~1095). It is collapsible
with a per-device `localStorage` flag (`claudeweb_scoreboard_collapsed`) and polls
`GET /api/analytics` every 5s while open. The new widget should feel like a sibling
of that — same collapse idiom, same poll cadence — but sit **beside** it on one
horizontal row so it adds no vertical height (the explicit ask: horizontal-only,
collapsible).

## Goals / Non-Goals

**Goals:**
- Two read-only backend probes — one for the **global GitHub** account (`gh`
  installed?, can authenticate / reach upstream?, login + host), one for the
  **Claude subscription** login (`claude` installed?, logged in?, account + plan).
- Two compact, collapsible dashboard chips side by side beside the Scoreboard that
  cost horizontal space only, each with three legible states (not-installed /
  not-authenticated / authenticated) and per-device collapse state.
- Degrade gracefully and fast: a missing CLI or a hung call must not block the
  dashboard or throw — it resolves to a typed status within a short timeout.

**Non-Goals:**
- No login / logout / account-switch from the UI for either identity (read-only).
- No per-repo remote identity or per-repo token resolution — the GitHub probe is the
  box's **global** `gh` account, not "who can push *this* repo".
- No token / API-key / credential-content display or storage. The Claude probe
  reflects the **subscription** login the Harness forces, never an `ANTHROPIC_API_KEY`.
- No persistence of probe results across a Harness restart (live probe + short
  cache is enough).

## Decisions

### 1. Probe via the `gh` CLI, not the GitHub API directly

Run `gh` through the existing process-runner with a short timeout (~5s) and parse a
**machine-readable** form rather than scraping human text:

- **Installed?** — resolve `gh` on PATH; a "command not found"/non-zero spawn →
  `ghInstalled = false` (terminal state, no further calls).
- **Authenticated + account?** — prefer `gh api user --jq .login` (returns the login
  on success, non-zero when unauthenticated/offline) and/or `gh auth status`. The
  active host (`github.com` vs an enterprise host) comes from `gh auth status`.
- Map results to a typed `{ ghInstalled, authenticated, account?, host?, error? }`.

*Why `gh` and not a raw token + REST call:* the Harness's *effective* identity is
whatever `gh`/its credential helper uses for push and PRs, so probing `gh` reports
the truth the Operator actually acts under — and it needs no token handling in our
code. *Alternative considered:* parse `gh auth status` stderr text only — rejected
as the sole source because its format is human-oriented and localized; use
`gh api user` for the authoritative login and treat `auth status` as supplementary
(host, hints).

### 2. A small read-only endpoint + service, no `GitService` coupling

Add a `GitHubAccountController` (`GET /api/github-account`) backed by a thin service
that shells `gh`. Keep it **separate** from `GitService` (which is per-repo and
git-only) because this is a host-global, gh-only concern. Resolve `gh`'s path /
spawn the process the same way the existing CLI runners do; never thread
`HttpContext.RequestAborted` in a way that makes a client refresh cancel a probe
mid-flight (return fast, let it complete).

*Caching:* a brief in-memory cache (a few seconds) collapses the dashboard poll +
any concurrent callers into one `gh` invocation, so opening the dashboard doesn't
spawn a `gh` process per render. A restart simply re-probes.

### 2b. Claude probe: read the subscription login the CLI already wrote

The Claude identity is the `claude` CLI's **subscription** login (the Harness forces
this by stripping `ANTHROPIC_API_KEY`). Unlike `gh`, the `claude` CLI has **no stable
machine-readable `whoami`** command, so the probe reads the login state the CLI
itself persists rather than inventing a command contract:

- **Installed?** — resolve `claude` on PATH the same way `CliRunnerService` already
  does (`claude.exe` native, or the npm `claude.cmd` shim); not found →
  `claudeInstalled = false` (terminal state).
- **Logged in + account + plan?** — read the Claude Code config/credentials the CLI
  writes for the harness's OS user (e.g. the `oauthAccount` record — email/handle,
  organization, plan tier — under the user's `~/.claude` config). Presence of a
  valid subscription session → `authenticated = true` with `account` + `plan`;
  absent/expired → `authenticated = false` with a short reason.
- Map to a typed `{ claudeInstalled, authenticated, account?, plan?, error? }`.

*Why read config rather than run a command:* there is no supported `claude whoami`
to depend on, and we must not trigger a login flow or a billable run just to read
identity. Reading the already-written login state is read-only, fast, and needs no
token handling in our code. **The exact file/field is pinned during apply** against
the installed `claude` version — treat any single path as provisional and fail soft
(unknown shape → `authenticated:false`, never throw). We never read or surface the
token itself, only the account/plan metadata.

*Symmetry with the gh probe:* same service shape, same short timeout, same in-memory
cache, same typed three-state result — so the two chips are true siblings.

### 3. Endpoint contract

`GET /api/github-account` → `200` with:

```json
{ "ghInstalled": true, "authenticated": true, "account": "octocat", "host": "github.com", "error": null }
```

- `ghInstalled: false` → `gh` not on PATH; other fields null. (Still `200` — "not
  installed" is a valid status, not an HTTP error.)
- `ghInstalled: true, authenticated: false` → installed but not logged in **or**
  upstream unreachable; `error` carries a short reason; `account`/`host` null.
- `authenticated: true` → `account` + `host` populated.

This three-field shape lets the frontend pick its state without parsing prose. The
Claude endpoint `GET /api/claude-account` mirrors it:

```json
{ "claudeInstalled": true, "authenticated": true, "account": "you@example.com", "plan": "Max", "error": null }
```

with the same `installed:false` and `authenticated:false` degradations.

### 4. Frontend: two collapsible chips beside the Scoreboard

Wrap the dashboard header in a horizontal flex row so `<Scoreboard />` and a small
account-status strip holding `<GitHubAccount />` + `<ClaudeAccount />` sit side by
side, each chip taking only the width it needs and wrapping under the Scoreboard on a
narrow phone rather than forcing height. The two chips share one chip component shape
(dot + handle + collapsible body) so they read as siblings.

- **Collapsed:** a status dot + the account handle (GitHub `@login` / "gh ✗"; Claude
  `email` + plan / "claude ✗") — one line, minimal width. **Expanded:** GitHub shows
  host + gh-installed/authenticated + account; Claude shows claude-installed/logged-in
  + account + plan. Collapse persists per-device in `localStorage`
  (`claudeweb_github_account_collapsed`, `claudeweb_claude_account_collapsed`),
  mirroring the Scoreboard key.
- **States → presentation:** not-installed (muted "not installed"), not-authenticated
  (warning color + "not authenticated"), authenticated (healthy dot + account). Each
  chip polls its endpoint (`GET /api/github-account`, `GET /api/claude-account`) on
  the same ~5s cadence as the Scoreboard while the dashboard is open, so an expired
  login surfaces on its own.
- **UI mode:** register both widgets as **Advanced** in `UiModeContext.jsx`
  (new-feature default) — the Basic-mode End User doesn't need account plumbing
  unless later decided otherwise.

## Risks / Trade-offs

- **Spawning `gh` on a poll** → mitigated by the short server-side cache so the 5s
  dashboard poll coalesces to ~one `gh` call per cache window, not one per request.
- **`gh` hangs on a network call** → bounded by the probe timeout; on timeout the
  status resolves to `authenticated: false` with an "unreachable" reason rather than
  hanging the endpoint.
- **`gh auth status` text is localized / format-drifts** → don't depend on its prose
  for the login; take the login from `gh api user --jq .login` and use `auth status`
  only for host/supplementary hints.
- **Global vs per-repo identity confusion** → the widget is labelled as the box's
  global GitHub account; per-repo push identity is explicitly out of scope and can be
  a later capability if needed.
- **Claude login file shape is undocumented / version-dependent** → there is no
  supported `claude whoami`; the config/credential layout could change between CLI
  versions. Mitigate by treating the path/field as provisional, failing soft to
  `authenticated:false` on any unexpected shape, and never throwing — the chip simply
  shows "not authenticated" rather than breaking. Pin the concrete source during apply.
- **Privacy of the Claude account** → show only account/plan metadata, never the
  token or credential contents; the email/handle is the same identity already visible
  in the Claude UI, surfaced read-only.
- **Horizontal crowding on small phones** → the flex row wraps the chips below the
  Scoreboard when width is tight, so they never clip; collapsed-by-narrow keeps each
  to one line.

## Migration Plan

Purely additive: a new endpoint, a new component, new i18n keys, one capability map
entry. No data migration, no change to existing git/PR flows. Ship behind the
Advanced-mode capability flag. Verify on an isolated preview port with the headless
browser (chip renders beside the Scoreboard; the three states render correctly with
the probe stubbed; collapse persists across reload) before the normal deploy cycle.
Rollback is a straight revert — no persisted state.

## Open Questions (resolve during apply)

- **Exact `gh` invocation** — `gh api user --jq .login` vs `gh auth status --active`
  (or both): pin the minimal command set that yields login + host + authenticated
  reliably across `gh` versions, during apply against the installed `gh`.
- **Exact Claude login source — RESOLVED (pinned on this box, claude v2.x).** The
  subscription login lives in two files under the harness user's home:
  `~/.claude/.credentials.json` → `claudeAiOauth { accessToken, expiresAt,
  subscriptionType, rateLimitTier }` carries the **plan** (`subscriptionType`, e.g.
  `max`) and an `expiresAt` epoch-ms used for the live auth check; `~/.claude.json` →
  `oauthAccount { emailAddress, displayName, organizationName }` carries the
  **account**. So: `authenticated` = a token is present and not past `expiresAt`;
  `account` = `emailAddress`; `plan` = title-cased `subscriptionType` when present.
  The `accessToken`/`refreshToken` are **never** read out — only the metadata above.
  Both files are read fail-soft (missing/odd shape → `authenticated:false`, never
  throw), so a future format drift degrades to "not authenticated" rather than breaking.
- **Cache window** — confirm a concrete TTL (e.g. 3–5s) that coalesces the dashboard
  poll without making an expired login look healthy for too long.
- **Placement detail** — whether the chip sits left or right of the Scoreboard title
  row and its exact collapsed footprint; settle against the rendered dashboard.
