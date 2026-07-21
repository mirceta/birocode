## Why

The agent dock's git section shows two identities: **commits as** (the repo's
`user.name`/`user.email`) and **pushes as** (the GitHub account). The **pushes as**
side is already configurable from the UI — the dashboard status panel takes a PAT and
sets the box's `gh` login. The **commits as** side is not: it is read-only everywhere
in the harness (`git-identity-surface` is explicitly "read-only surfacing only"), so
the only way to set who a repo's commits are authored as is to drop into a terminal
and run `git config`. That is the asymmetry this change closes — make **commits as**
editable in the same place it is displayed, at per-repo (local) scope, so both halves
of "who am I to git" are controllable from the harness.

## What Changes

- **New write endpoint** `POST /api/git/identity { name, email, scope }` that sets
  `user.name`/`user.email` for the current repo. Default scope is **local** (the
  repo's own `.git/config`, a per-repo override); **global** is available as an
  explicit choice. Returns the re-read identity so the UI reflects the new value.
- **Editable "commits as" row.** The dock identity row gains an edit affordance that
  opens an inline name/email editor writing through the new endpoint, then refreshes
  the dock's git status. The **pushes as** row stays as-is (already configurable via
  the PAT control).
- **Guarded like other git mutations.** The write is rejected (409) while a chat run
  is active in the repo, consistent with merge/pull/push, so it can't change the
  author under an in-flight commit.
- **First tests for identity.** A small C# test project drives the writer against a
  throwaway `git init` repo: read → write local → read back, global scope, and the
  no-identity and bad-input cases.

## Capabilities

### Modified Capabilities
- `git-identity-surface`: was read-only surfacing of commit + push identity; now the
  **commit** identity is also writable at local/global scope, and the dock "commits
  as" row is editable (the "pushes as" row and the read paths are unchanged).

## Impact

- **Backend:** add `GitService.SetCommitIdentity(workingDir, name, email, scope)` and
  `POST /api/git/identity` on the existing `GitController` (reuses `RepositoryResolver`
  + the run-busy guard). No new module/service registration needed.
- **Frontend:** make `DockIdentityRows.jsx` editable (inline editor + save), add
  `gitIdentity.edit.*` i18n keys to **both** `en.json` and `tr.json`, and a little
  CSS in `dockIdentity.css`. Editing rides the existing `gitIdentityRows` Advanced
  feature flag (no new flag).
- **Tests:** new `tests/ClaudeWeb.Tests` xUnit project covering the writer; first
  automated coverage for git identity.
- **Out of scope:** GitHub account switching/add/logout (the PAT control already
  covers login), SSH keys, credential helpers, and the broader "identity health /
  mismatch detector" idea (dropped — the PAT control plus this writer cover the real
  need).
