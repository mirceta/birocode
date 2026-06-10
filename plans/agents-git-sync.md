# Agents git sync — branch position on agent cards + "Pull main" button

> **Status (2026-06-11):** Implemented and browser-verified on an isolated
> preview instance on :5201
> (`.claudeweb-preview/playwright/verify-agents-git-sync.mjs`, 5/5 checks:
> card shows vs-main + vs-origin lines and branch, pull reports per-repo
> success, failed pull shows the reason). Not yet deployed to :5099.

## Problem

The Agents tab shows each agent's branch name, but not where that branch
stands — vs `main`/`master`, or vs its own branch on origin. The End User has
to open each agent and switch to the Git tab to find out. There is also no
way to bring every agent repo's main line up to date in one tap.

## ⚠️ Convention exception

`plans/git-tab.md` made the git UI read-only ("the agent performs all git
mutations through chat"). The **Pull main button is the first git mutation
triggered directly from the UI** — an explicit End-User decision (2026-06-11)
after the conflict was surfaced. The exception is limited to fast-forwarding
the base branch; everything else stays read-only.

## Scope

Backend (`GitService` / `GitController`):

- `PullBase(workingDir)` — detect the local base branch (`main` then
  `master`); if HEAD is on it, `git pull --ff-only`; otherwise
  `git fetch origin <base>:<base>` (fast-forwards the local ref without
  touching the checkout). Returns base, before/after hashes, error.
  Shared-worktree caveat: if the base is checked out in a sibling worktree
  git refuses the fetch — reported as that repo's error, not fatal.
- `POST /api/git/pull-base` (repo-scoped via X-Repo-Id) →
  `{ baseBranch, ok, updated, error }`.

Frontend (`pages/Agents.jsx`):

- Agent cards: replace the `/branch` lookup with `/git/status` (no fetch) per
  unique repo and render, under the branch name, the same explicit wording
  the Git tab uses — position vs base (`git.base*` keys) and vs origin
  upstream (`git.ahead/behind/noUpstream` keys).
- Header gains a **Pull main** button: POSTs `/git/pull-base` for every
  unique repo that has an agent, shows a per-repo result list
  (updated / already up to date / failed + reason), then reloads card info.
- i18n: `agents.pullMain`, `agents.pulling`, `agents.pullUpdated`,
  `agents.pullUpToDate`, `agents.pullFailed` (en/tr).

## Out of scope

- Pulling all registered repos (agents-only by request); merging/rebasing the
  feature branches themselves — that stays with the agent via chat.
