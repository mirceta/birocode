# Add account-status chips — show which GitHub and Claude accounts the box is logged into, beside the Scoreboard

## Why

The Harness acts on the Operator's behalf as two distinct identities, and the
dashboard surfaces neither:

- **GitHub** — it drives `git` and (for PRs) the `gh` CLI, but never says **which
  GitHub identity the box is acting as**. When several accounts share one machine —
  or a `gh` login silently expires — the first symptom is a failed push or a PR
  opened under the wrong account, discovered only after the fact.
- **Claude** — every agent run shells the `claude` CLI, which the Harness forces to
  use the **Max/Pro subscription login** (`CliRunnerService` deliberately removes
  `ANTHROPIC_API_KEY` so it never falls back to an API key). But nothing shows
  **which Claude account / plan that login is**, or whether it's still valid — an
  expired or wrong subscription login surfaces only as a failed run.

There is no at-a-glance answer to "who am I — to GitHub and to Claude — and are
those logins healthy right now?" Today nothing surfaces it: `GitService` shells
`git` for status/diff/PR-base but never `gh`, no service reads the `claude` login,
and the dashboard's only header widget is the **Scoreboard**. The natural home is
right next to it — but the Scoreboard already owns the full width above the agent
docks, and vertical space on a phone is precious, so stacked panels are the wrong
shape. Two compact chips on the Scoreboard's row are the right one.

## What Changes

- **Two new backend probes** (read-only, never log in/out or switch accounts):
  - **GitHub** — runs the `gh` CLI to report the **current global GitHub account**
    the box would act as: (1) is `gh` **installed / on PATH**, (2) can it
    **authenticate to GitHub / reach upstream** now, (3) the **login name** + active
    host (e.g. `github.com`). Typed `{ ghInstalled, authenticated, account?, host?, error? }`.
  - **Claude** — reports the **current Claude subscription login** the `claude` CLI
    runs as: (1) is the `claude` CLI **installed / on PATH**, (2) is it **logged in /
    is the subscription session valid**, (3) the **account** (email/handle) and
    **plan** (e.g. Max / Pro). Typed `{ claudeInstalled, authenticated, account?, plan?, error? }`.
- **Two new dashboard chips, side by side** on the **Scoreboard's horizontal row**
  (not stacked below it), so they cost horizontal space only — no extra vertical
  height. Each is **collapsible**: collapsed = a status dot + account handle;
  expanded = installed/authenticated state, account name, and host (GitHub) / plan
  (Claude). Collapsed/expanded state is **per-device** (localStorage), matching the
  Scoreboard's pattern. They share a small "account status" strip so the two chips
  align as siblings.
- **Three legible states each**: CLI missing → "not installed"; installed but not
  authenticated / unreachable → a clear "not authenticated" warning; authenticated →
  the account handle with a healthy indicator. Both poll on the dashboard's existing
  cadence so an expiring login shows up without a manual refresh.

## Capabilities

### New Capabilities
- `github-account-status`: the Harness exposes the current global GitHub identity
  (gh-installed, can-authenticate, account name + host) via a read-only backend
  probe, and the dashboard renders it as a collapsible chip beside the Scoreboard.
- `claude-account-status`: the Harness exposes the current Claude subscription login
  (claude-installed, logged-in, account + plan) via a read-only backend probe, and
  the dashboard renders it as a collapsible chip beside the GitHub one.

### Modified Capabilities
<!-- none -->

## Impact

- **Backend (`ClaudeWeb.App`)**: two read-only controller+service pairs through the
  existing process runner, each with a short timeout and graceful "CLI not on PATH"
  handling. **GitHub** shells `gh` (e.g. `gh auth status` / `gh api user`) → typed
  `{ ghInstalled, authenticated, account?, host?, error? }`. **Claude** surfaces the
  `claude` subscription login (the CLI has no stable `whoami`, so read the
  credentials/config the CLI itself writes — mechanism pinned during apply) → typed
  `{ claudeInstalled, authenticated, account?, plan?, error? }`. No change to
  `GitService`, `CliRunnerService`'s run path, or any existing flow.
- **Frontend (`client/`)**: new `GitHubAccount` and `ClaudeAccount` dashboard
  components placed beside `Scoreboard` in `Dashboard.jsx`, with the header row
  becoming a horizontal flex container holding a small account-status strip; shared
  chip styles; i18n strings in `client/src/i18n/en.json` + `tr.json`. New UI feature
  → **Advanced mode** by default (capability map in `UiModeContext.jsx`) unless the
  Basic-mode End User is later deemed to need it.
- **Understanding app**: add/refresh `understanding-app/index.html` for both
  account-probe flows (per the repo's Understanding-app convention).
- **Out of scope**: switching, adding, or logging into GitHub **or** Claude accounts
  from the UI; per-repo remote identity (GitHub chip reports the **global** `gh`
  account only); reading/showing tokens, API keys, or credential contents. The
  Claude chip reflects the **subscription** login the Harness forces (API-key auth is
  intentionally disabled in `CliRunnerService`), not any `ANTHROPIC_API_KEY`. Read-only
  status surfacing, nothing mutating.
