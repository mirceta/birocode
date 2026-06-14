# Dashboard git status on agent docks — branch + sync, like the Git tab

> **Status (2026-06-14):** PROPOSED — starter plan, not started. New feature on
> `feature/dashboard-git-status`. Expected frontend-only; reuses data the
> dashboard already fetches.

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

## Open questions / decisions

- **Placement on the phone** — git row inside the existing `phone__bar` header
  (tight, one line) vs. a thin strip below it. The phone screen is a live chat,
  so vertical space is precious; lean toward a single compact line.
- **How much** — full base + origin sync lines (mirror the cards), or just
  branch + a terse "↑n ↓m" against origin to save space? Default: mirror the
  cards for consistency; revisit if too tall.
- **Cards too?** The cards already have this, so scope is the phone docks only —
  confirm we're not also changing the cards.

## Slices

- **Slice 1** — branch + sync lines on the phone dock header, reusing
  `syncLines` and the existing `gitInfo`. Frontend-only.

## Verification

Browser test (`docs/claude-web/browser-testing.md`): open the dashboard in
phones/hot view with at least one git-backed agent; confirm the dock header
shows the branch and the same ahead/behind wording the cards/Git tab show for
that repo; confirm a non-git agent shows no git row and nothing errors.
