# Dashboard git status on agent docks — branch + sync, like the Git tab

> **Status (2026-06-14):** **Slices 1 & 2 DEPLOYED & CONFIRMED** on live :5099;
> browser-verified — slice 1 (`dash-git-status-check.mjs`: branch + position
> rows on the Git tab, cards, and docks) and slice 2 (`dash-git-refresh-check.mjs`:
> the per-dock refresh button fires a `fetch=true` request, spins, and updates
> in place). On `feature/dashboard-git-status`. Frontend-only; reuses the
> `gitInfo` the dashboard already fetches. Slice 1 merged to main; slice 2 not
> yet merged.

## Problem

The Agent Dashboard's **cards** view already shows each agent's git state —
branch name plus the "ahead/behind" sync lines — via the shared
[`gitSync.syncLines`](../client/src/lib/gitSync.js) helper. The **phone docks**
(`PinnedAgent`, the "wall of phones") do **not**: their header shows only the
dot, repo name, repo path, and run status. So when looking at the live docks you
can't tell which branch an agent is on or how it relates to its base / origin
without opening it.

## Goal

Show the same git status fields that sit at the top of the **Git tab** on the
dashboard agent docks (phones), matching what the cards already display:

- **Current branch** (`status.branch`).
- **Relation to the base branch** (main/master): *n ahead · m behind* / in sync.
- **Relation to origin** (origin/main, the upstream): *n ahead · m behind* /
  in sync, or "no upstream".

The wording must stay identical to the Git tab and the cards — that's exactly
what `syncLines` already guarantees ("uses the same explicit wording as the Git
tab").

## Current state (what's already there)

- `Dashboard.jsx` already fetches `/api/git/status` per unique repo into
  `gitInfo[repoId]` (one best-effort GET when the overlay opens).
- The **cards** branch renders `git.branch` + `syncLines(t, git)` per cell.
- The **phones** branch renders `<PinnedAgent>` and passes `status`, `recency`,
  `repoPath` — but **not** `git`. `PinnedAgent`'s `phone__bar` header has no git
  row.

So the data is in hand; the gap is purely rendering it on the dock.

## Sketch (to be refined)

- Pass the agent's git payload into the dock: `Dashboard.jsx` →
  `<PinnedAgent git={gitInfo[tab.repoId]} … />`.
- In `PinnedAgent`, render a compact git row in/under `phone__bar`: branch name
  (`⎇ {branch}`) + `syncLines(t, git)` rows, reusing the cards' markup/classes
  so the two surfaces stay visually consistent.
- Keep it best-effort: non-git repos / not-yet-loaded status simply render
  nothing (same as the cards).

## Decisions (confirmed by the user)

- **Placement** — give the git block the room it needs on the dock; **not** a
  cramped one-line strip that looks ugly. A proper git section.
- **How much** — do it **exactly like the Git tab**: branch name + the same
  `PositionRow`s ("n ahead · m behind" vs base / origin-base / upstream, with the
  in-sync and missing-upstream styling), not the simplified `syncLines`.
- **Cards too** — render it the **same way on the cards**, replacing their
  current `syncLines` summary so cards and docks match the Git tab.

## Approach

Per [doc-principles](doc-principles.md) ("extract the shared mechanism"): pull
the Git tab's branch-name + `git-rows`/`PositionRow` block into a shared
component (`components/git/GitStatusSummary`, with its own CSS) and render it on
all three surfaces — the Git tab, the dashboard cards, and the phone docks — so
they can never drift. `gitSync.syncLines` stays for the Agents tab (out of
scope here).

## Slices

- **Slice 1** — branch + sync lines on the phone dock header, reusing
  `syncLines` and the existing `gitInfo`. Frontend-only.
- **Slice 2** — a per-dock **refresh button** (↻) next to each dock's Git
  section. Re-fetches that one agent's `/git/status?fetch=true` (hits origin,
  like the Git tab's refresh) and updates `gitInfo[repoId]` in place; spins +
  disables while in flight. Frontend-only.

## Verification

Browser test (`docs/claude-web/browser-testing.md`): open the dashboard in
phones/hot view with at least one git-backed agent; confirm the dock header
shows the branch and the same ahead/behind wording the cards/Git tab show for
that repo; confirm a non-git agent shows no git row and nothing errors.
