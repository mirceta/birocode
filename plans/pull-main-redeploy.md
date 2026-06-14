# Pull main & redeploy — a one-button "make live = latest main"

> **Status (2026-06-14):** **PLAN ONLY — not started.** Branch
> `feature/pull-main-redeploy` created off `main`. No code yet. The open
> question in [Goal](#goal) needs the user's call before slicing begins.

## Problem

This repo is the Harness itself (Self-Development — `docs/claude-web/self-dev.md`).
While you're mid-feature on a branch, someone else (often a second harness
checkout — `birocode` / `birocode-copy`, "last deploy wins") ships to `main` and
deploys. To get the **live** harness on `:5099` back onto the latest `main` you
currently have to leave your branch, fast-forward main, run the self-dev deploy
scripts by hand, and come back. There's no in-app way to say "make live = latest
main" without disturbing the branch you're working on.

## Goal

A single button — **"Pull main & redeploy"** — that, regardless of which branch
the Repo is checked out on:

1. Fetches `origin` and brings the latest `main` into play.
2. Redeploys the Harness from it, so live (`:5099`) runs the latest `main`.
3. Leaves your current feature-branch checkout and working tree **untouched**.

### Open question (needs the user) — what does "redeploy it" mean?

- **(A — default) Deploy `origin/main` itself.** Live becomes latest main; your
  branch checkout is never switched. Best when another instance shipped to main
  and you just want live to catch up. Requires building from a main worktree, not
  the current checkout.
- **(B) Merge main into the current branch, then redeploy the branch.** Live
  becomes "your branch + latest main." This is `pull-base` + `merge-base` +
  deploy. Mutates your branch (a merge commit), so it's not "untouched."

The title says "redeploy **it**" (it = main), so this plan **defaults to (A)**.

## What already exists (build on it, don't reinvent)

Git plumbing (`GitController` / `GitService`):
- `POST /api/git/pull-base` — fetch + fast-forward **local** `main`/`master` from
  `origin` (does not touch the current branch). This is the "pull main" half.
- `POST /api/git/merge-base`, `POST /api/git/pull-current` — exist for option (B).
- `GET /api/git/status?fetch=true` — branch + ahead/behind vs origin/main, already
  surfaced on the Git tab and the dashboard docks
  ([dashboard-git-status.md](dashboard-git-status.md)).

Deploy plumbing (`DeployService` / `DeployController`, `plans/deployments-tab.md`):
- The append-only `deploys.jsonl` ledger (written by `swap.ps1`/`rollback.ps1`),
  `GET /api/deploy/status` (what's live, ancestry, armed-rollback), `POST
  /api/deploy/rollback` (runs `rollback.ps1` **detached** — the model for
  triggering a self-restarting script from a request), and the
  `ClaudeWebAutoRollback` arm/disarm safety net.
- The self-dev deploy scripts under `_config.DeployScriptsDir`
  (`.selfdev-build/`), which already build to an **isolated** dir and swap, per
  `docs/claude-web/self-dev.md` (never build into the running app's own bin/port).

## The gap

There is **no UI-triggered "deploy now."** Today a deploy is run by the Operator
at the host PC. `DeployService` can only read the ledger, disarm, and roll back —
it cannot roll *forward*. So the new work is essentially:

- A **deploy-from-main trigger**: a `swap.ps1`-style script (or a parameter to the
  existing one) that builds the latest `origin/main` in an isolated worktree and
  swaps it live, writes a `deploy` ledger entry, and arms auto-rollback — fired
  **detached** from a request the way `TriggerRollback()` fires `rollback.ps1`.
- A backend endpoint (e.g. `POST /api/deploy/pull-main`) that runs `pull-base`
  then kicks that script.
- A UI button (Deployments tab and/or the Git tab) — Advanced/Operator-only,
  with a typed/explicit confirm like rollback has, since it restarts live.

## Risks / constraints to respect

- **Self-dev isolation** (`docs/claude-web/self-dev.md`): build to an isolated
  dir, never the running app's bin/ or port. A redeploy that restarts the very
  process serving the request must be detached and self-restarting (rollback.ps1
  is the proven pattern).
- **Concurrency** ("last deploy wins" across the two checkouts): document that
  this button makes *this* host's live = main; it doesn't coordinate with the
  other checkout.
- **Don't disturb the branch** (option A): operate on a detached/worktree build
  of `origin/main`, leaving the working tree's branch and edits alone.
- **Safety net**: reuse the armed auto-rollback so a bad main can't brick live.

## Slices (provisional — pending the A/B decision)

- **Slice 1** — backend `POST /api/deploy/pull-main` = `pull-base` + a detached
  deploy-from-main script + ledger entry + armed rollback. Verify via the
  existing `GET /api/deploy/status` (live commit contains origin/main).
- **Slice 2** — UI button (Deployments tab) with confirm + in-flight/spinner
  state, reusing the rollback button's confirm pattern.
- **Slice 3** (maybe) — surface the same button on the Git tab next to the
  ahead/behind-vs-origin rows, where the need is most visible.

## Verification (when built)

Browser test (`docs/claude-web/browser-testing.md`): on a feature branch with
live behind origin/main, click the button → confirm → live restarts → `GET
/api/deploy/status` shows the new live commit contains `origin/main`, and `GET
/api/git/status` shows the working-tree branch unchanged.
