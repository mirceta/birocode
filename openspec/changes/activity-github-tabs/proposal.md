# Proposal: activity-github-tabs

## Why

The events-app primary page has grown two distinct jobs: **agent activity across the fleet** (the attention queue, per-machine sources with running agents, the merged event log) and **GitHub administration** (repo tiles, the in-app PR browser). Today they share one long scroll. As the GitHub side gained PR list/detail drill-down and fleet-wide repo coverage, the page reads as two tools stapled together — the operator scrolls past fleet status to reach PRs, and the PR panel expands in the middle of the activity content. Separating them into two top-level tabs gives each job its own focused surface.

## ⚠️ Convention conflict — operator decision required

This change **modifies an established, deliberately-decided requirement**. The `status-monitor` spec's *Fleet status on the events-app primary page* requirement states **"There SHALL be no separate board page … source administration, the attention queue, per-machine agent status, and GitHub state are all present on that one page"** — and notes it *"Supersedes the withdrawn separate-page rule; operator decision 2026-07-03."* Splitting Activity and GitHub into tabs means they are **no longer simultaneously visible** on one surface, which walks back part of that decision.

Two things soften it, but the operator (you) should confirm:
- It stays **one page, one URL, one board poll** — tabs switch client-side. `board.html` is **not** resurrected, so the *"old board page is gone → 404"* scenario still holds. This is in-page navigation, not a second page to visit.
- **Display mode is unchanged.** The third-monitor wallboard (`?display=1`) keeps showing the attention queue, fleet, and GitHub tiles together in one enlarged glance — tabs apply to the interactive view only. So the *Display mode* requirement is untouched.

If you'd rather keep everything on one scroll, we stop here. This proposal assumes you want the split.

## What Changes

- The events-app interactive view gains a **two-tab shell** at the top: **Activity** (attention queue · Sources + add-harness · merged feed) and **GitHub** (repo tiles · in-app PR browser). Exactly one tab's content is visible at a time.
- Tab selection is **device-local and URL-addressable** (like the existing Simple/Advanced toggle and `?display=1`): persisted in `localStorage`, reflected in a query param so a tab is linkable, defaulting to Activity.
- The **attention queue placement** is reconsidered: because it is the "needs me now" signal, it either stays pinned above both tabs or lives on Activity — a design decision to settle in `design.md`.
- **Display mode keeps its current single-glance layout** (no tabs), preserving the wallboard contract.
- One board poll still feeds both tabs; switching tabs does not add round-trips. GitHub-panel degradation and display-mode inertness are unchanged.

## Impact

- Specs: `status-monitor` — MODIFY *Fleet status on the events-app primary page* (one surface → tabbed interactive view; display mode unchanged); ADD a tabbed-navigation requirement.
- Code: `events-app/index.html` only (markup + CSS tab shell + a few lines of JS for tab state). No server, endpoint, or React-client changes; the `board` endpoint and `GitHubPrService` are untouched.
- UX: GitHub and activity are no longer visible at once in interactive mode — the tradeoff this change deliberately makes.
- Understanding app: worth a small update showing the tab split and where display mode sits.
