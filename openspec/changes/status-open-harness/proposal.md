# Status panel: "open harness" from an agent's details, the badge's way

Board task `b06d56c4ae2c46a2914949bc8c581265` (Operator, 2026-09-22).

## Why

Management → Status lists the repo agents and an agent's expanded details show its facts and
the free/occupied controls — but there was no way to open that agent's harness from there.
The Kanban card badge already does exactly what is wanted (openspec management-settings-tab,
harness-window-agent-tabs, harness-window-reclick-raise): it opens the agent's harness in the
Settings-chosen window, one tab per repo agent, and focuses the existing tab on a repeat click
instead of reloading it.

## What changes

The agent details block gains an **open harness ↗** button beside the occupancy control that
calls the badge's own helper (`focusAgentTab` in `workerWindow.js`) with the badge's own
inputs: the agent tab key as the badge derives it (`sourceId|repoId`, empty source for this
machine) and the machine's studio link from the same `agentWorkerHref` over the peer registry's
address. Nothing is reimplemented, so the placement setting, the one-tab-per-agent rule and
focus-not-reload hold by construction. A machine whose address the fleet does not know gets a
disabled button that says so.

## Out of scope

The dock-lane variants of the same action; changing the badge.
