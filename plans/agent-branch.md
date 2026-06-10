# Agent branch — show each agent's git branch on the Agents tab

> **Status (2026-06-10):** Implemented on `feature/agent-branch` and
> browser-verified on an isolated preview instance on :5201
> (`.claudeweb-preview/playwright/verify-agent-branch.mjs`, 3/3 checks,
> with pinned dock tabs). Not yet deployed to :5099.

## Problem

The Agents tab lists concurrent agent sessions by repo name and status, but
not which git branch each repo is on. Since agents routinely work on feature
branches, the End User can't tell from the phone what state each agent's repo
is in without opening it.

## Scope

Frontend-only — reuses the existing `GET /api/branch` endpoint
(GitController) with the tab's repo id in `X-Repo-Id`.

- `pages/Agents.jsx` — fetch the branch for every unique tab repo on mount /
  when the tab list changes; render `⎇ <branch>` on each agent card.
  Non-git repos (the branch call fails) simply show no branch line.
- `pages/agents.css` — branch line style.

No new feature flag: this is part of the Agents tab, already gated by
`agentDock` (Advanced).
