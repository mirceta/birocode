# Agent repo sync — selecting an agent selects its project

> **Status (2026-06-11):** Implemented and browser-verified on an isolated
> preview instance on :5201
> (`.claudeweb-preview/playwright/verify-agent-repo-sync.mjs`, 4/4 checks:
> no sync on load, selector follows selected agent, agent becomes active,
> Git tab then queries the agent's repo). Not yet deployed to :5099.

## Problem

Agents (dock tabs) are tied to a repo, but the global project selector is
independent. Selecting an agent on the Agents tab leaves the selector on
whatever project it was on — so switching to the Git/Files/History tab right
after shows a *different* project than the agent the End User just opened.

## Scope

Frontend only (`context/DockContext.jsx`):

- `setActiveTab(id)` — also calls `selectRepo(tab.repoId)` for the selected
  tab, syncing the global project selector to the agent's project.
- `openTab(repoId, ...)` — same, a new agent selects its project.
- One-directional by design: changing the project selector manually does NOT
  touch the active agent.
- The implicit fallback in `refresh()` (first tab auto-activated on mount /
  when the active tab disappears) does NOT sync, so merely loading the app
  never overrides the device's project selection.

## Out of scope

- Backend changes; selector→agent direction.
