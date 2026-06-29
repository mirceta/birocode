# Surface git identity in the dashboard and add a global GitHub token control

## Why

The Harness commits and pushes on the Operator's behalf, but the dashboard never
says **who** those actions are attributed to, and there is no in-app way to set the
credential pushes use. Two distinct identities are involved and both are invisible:

- **Commit identity** — who a commit is *authored as* (`user.name` / `user.email`),
  baked permanently into every commit. `GitService` runs `git commit -m …` with **no
  identity argument**, so it silently inherits whatever git config resolves on disk.
- **GitHub auth identity** — who a push *authenticates as*. `GitService` pushes with
  `GIT_TERMINAL_PROMPT=0` and no token, delegating entirely to the system credential
  helper (Git Credential Manager, host-keyed). When no token is stored, a push fails;
  when the wrong account's token is stored, work lands under the wrong identity —
  discovered only after the fact.

The just-shipped account-status chips (`add-account-status`) answer "which GitHub
account" — but **globally**, once, at the top of the dashboard. They don't tell you
what *a given agent's repo* will commit and push as, and they offer no way to fix a
missing/expired credential. The dock git section (`PinnedAgent.jsx`,
`GitStatusSummary.jsx`) shows branch + ahead/behind + actions and **no identity at
all**. And nothing in the app can establish a GitHub credential — today that requires
a terminal.

> **Honest scope note.** On this box both identities are **global**: commit identity
> comes from `~/.gitconfig` (no `includeIf`, no per-repo `user.*` overrides) and the
> credential store is host-keyed. So the per-dock rows will read identically across
> docks today; they earn their place by showing the **effective** identity for each
> repo (so the moment a repo gets a local override, they diverge correctly) and by
> giving the missing/expired case a visible home.

## What Changes

- **Backend: commit-identity probe.** Extend the existing `GET /api/git/status`
  payload (per repo) with a typed `commitIdentity { name?, email?, scope }` read from
  `git config --show-origin user.name|user.email` in that repo, where `scope` is
  `global` | `local` | `unset` (derived from the config origin). Read-only; never
  writes config.
- **Backend: global GitHub token control.** A new write-only endpoint that accepts a
  Personal Access Token and establishes it **once, host-keyed**, via the `gh` CLI:
  `gh auth login --with-token` (token on stdin) followed by `gh auth setup-git`, so
  one token serves both the GitHub API and `git push`. The token is **never** echoed
  back, never logged, never persisted in `repositories.json` or app state in
  plaintext. A companion read path reuses the existing GitHub account probe to report
  the resulting login.
- **Frontend: two dock identity rows.** Add to each agent dock's git section a
  `commits as <name> <email>` row (with a `global`/`local` badge from `scope`) and a
  `pushes as <gh login | not authenticated>` row (from the GitHub account probe).
  Read-only display; Advanced mode (new-feature default).
- **Frontend: token control.** An Advanced-mode textbox + "Save token" action that
  POSTs the PAT over the authenticated `/api` channel to the new endpoint, shows
  success/failure, and on success lets the existing GitHub chip flip to authenticated
  on its next poll. The field is write-only — it never displays a stored token.

## Capabilities

### New Capabilities
- `git-identity-surface`: the dashboard shows, per agent dock, the **effective commit
  identity** (name + email + global/local scope) and the **GitHub account pushes
  authenticate as**, backed by a read-only commit-identity probe folded into
  `/api/git/status`.
- `github-credentials`: the Harness can establish a **global, host-keyed GitHub
  credential** from a user-supplied Personal Access Token via a write-only endpoint
  (gh `--with-token` + `setup-git`), so one token serves the API and `git push`,
  without the token ever being read back, logged, or stored in plaintext.

### Modified Capabilities
<!-- The git-status capability gains a commitIdentity field; captured as an ADDED
     requirement under git-identity-surface rather than editing a seeded baseline,
     since no git-status spec is seeded yet. -->

## Impact

- **Backend (`ClaudeWeb.App`)**: `GitService`/`GitController` git-status path gains a
  `commitIdentity` object (one extra `git config --show-origin` read; no behavior
  change to existing fields). A new controller+service pair for the token write,
  reusing the `gh` resolution already added in `Services/Accounts/ProcessProbe.cs`;
  the PAT is taken from the request body, piped to `gh` via stdin, and discarded —
  never assigned to a logged field or persisted.
- **Frontend (`client/`)**: two new rows in the dock git section
  (`PinnedAgent.jsx` / `GitStatusSummary.jsx`); a token-entry control (likely beside
  the existing GitHub chip or in its expanded body); shared styles; i18n in
  `client/src/i18n/en.json` + `tr.json`. New features → **Advanced** in
  `UiModeContext.jsx`.
- **Understanding app**: `understanding-app/index.html` already refreshed this session
  to explain the two-identity model and mock both surfaces; keep it the rolling latest.
- **Operational note (not code)**: the live harness must be restarted before it sees a
  newly-PATH-installed `gh`; `gh` is currently installed but not logged in. The token
  control is the in-app path to that login once the restarted harness is live.
- **Out of scope**: changing the **commit-author** identity from the UI (this control
  sets auth/push only; `user.email` is untouched); per-repo credentials or per-repo
  `includeIf` management; OAuth/device-flow login (token paste only); reading,
  displaying, or exporting any stored token; non-GitHub hosts.
