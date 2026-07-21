## Context

`GitService.ReadCommitIdentity` already reads `user.name`/`user.email` and derives
local/global/unset scope; it rides on `GET /api/git/status.commitIdentity` and is
rendered by `DockIdentityRows.jsx`. There is no writer. `RunGit` passes literal values
via `ArgumentList` (no shell), so a name/email needs no escaping. Other git mutations
(`merge-base`, `pull-current`, `push-current`) live on `GitController`, resolve the
repo via `RepositoryResolver.Current()`, and 409 while `RunSessionService.IsBusy`.
There is no test project in the repo yet.

## Goals / Non-Goals

**Goals:**
- Set a repo's commit identity from the UI at local (default) or global scope.
- Reflect the write immediately in the dock without a full reload.
- Establish the first automated coverage for identity read/write.

**Non-Goals:**
- GitHub account management (login already exists via the PAT control; switch/logout
  are not in scope).
- SSH keys, credential helpers, and any "mismatch/health" detection.

## Decisions

**D1 — Extend `git-identity-surface`, not a new capability.** The write is the missing
half of the same "who commits/pushes" surface; modeling it as a MODIFIED delta keeps
one coherent capability rather than splitting read and write. The MODIFIED requirements
drop the "read-only" / "SHALL NOT mutate" clauses for the commit row and add a write
requirement; the push row and all read behaviour are unchanged.

**D2 — Endpoint on the existing `GitController`, no new service.** `POST
/api/git/identity` reuses the injected `GitService` + `RepositoryResolver` + the
run-busy guard. Cheaper and more consistent than a new controller/module for one
write. Response returns the re-read `{ name, email, scope }` so the client shows the
authoritative post-write state.

**D3 — Scope: local default, global explicit.** The dock is per-repo, so local
(`.git/config`) is the safe default and matches the "per-repo override" the badge
already highlights. Global is offered but separately labelled, because it changes every
repo on the box. `git config --local user.name <value>` / `--global` via `RunGit`
literal args.

**D4 — Busy guard.** Reject with 409 while a run is active in the repo, exactly like
the other mutations, so identity can't change under an in-flight commit.

**D5 — Partial writes allowed, empty rejected.** Setting only name or only email is
allowed (git stores them independently); a request with neither is a 422. Values are
trimmed. No heavy email-format validation — git itself is permissive and the read-back
shows the result.

**D6 — Optimistic-then-authoritative UI.** On save, the row calls the endpoint, then
invokes the dock's existing `onRefreshGit` so the next `git/status` reflects the change
(same refresh the git actions already use). No new polling.

**D7 — Tests: real temp repo.** `tests/ClaudeWeb.Tests` (xUnit) creates a temp dir,
`git init`s it, and exercises `SetCommitIdentity`: read unset → write local → read back
local; write global into an isolated config → read; only-name and only-email; empty
rejected. Global-scope tests set `HOME`/`GIT_CONFIG_GLOBAL` to a temp path so the
developer's real `~/.gitconfig` is never touched.

## Risks / Trade-offs

- **[Global write hits every repo on the box]** → Local is the default; global is a
  deliberate, separately-labelled choice.
- **[Changing identity mid-run]** → 409 busy guard blocks it while a run is active.
- **[Global test could clobber the dev's real gitconfig]** → Tests isolate the global
  config path via env; never write global against the real `HOME`.
- **[New test project is the first in the repo]** → Keep it minimal (one project, one
  fixture helper) and wire it into `ClaudeWeb.sln` so `dotnet test` just works.

## Open Questions

- Should "commits as: not set" offer a one-click prefill from the active GitHub
  account (login + noreply email)? Nice-to-have; deferred unless asked — the plain
  name/email editor covers the stated need.
