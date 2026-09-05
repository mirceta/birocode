# Proposal: tasks-agent — an agent with tools over the Ideas board and the Task graph

## Why

The Ideas tab holds the operator's backlog and the Task graph holds the ordered,
dependency-linked work — but both are typed in by hand. When the operator writes a
long, mixed prompt ("for the Ideas tab we want an agent … also a dock lane … also
tests …") nothing turns it into tasks; they have to split it themselves. The arch
agent proved the pattern for an agent whose only power is a small, audited harness
tool surface. The same pattern, pointed at ideas and tasks instead of repo agents,
gives the operator an agent that breaks a prompt into ordered, linked tasks and
writes them where the Task graph already shows them.

## What

- A **Tasks MCP server** (`POST /api/tasks/mcp`, JSON-RPC over HTTP, per-run
  bearer token, built like the arch server) exposing eight tools that are thin
  wrappers over `NotesService` and `TaskGraphService`: `list_ideas`, `create_idea`,
  `update_idea`, `list_tasks`, `create_task`, `update_task`, `link_tasks`,
  `delete_task`. Every call is recorded in the autopilot action audit.
- A **Tasks agent role**: its own home folder, a versioned role prompt written to
  `CLAUDE.md`, a settings fence, and the arch agent's disallowed-tools list, so its
  only capability is the Tasks MCP. It splits a prompt into ordered tasks with
  dependencies, writes them to the graph, and replies with a numbered summary.
- A **Tasks surface** with a Chat lane and a Tools lane, reachable as a studio tab,
  as a tab/pane in the Management App (which the dashboard's Management layer
  embeds), so the operator can talk to it from the dashboard.
- A **"Break into tasks"** action on the Ideas composer that hands the draft to the
  Tasks agent and refreshes the Task graph section when the run ends.
- Unit tests for the tool layer and a browser verification on an isolated preview.

## Out of scope

Autopilot loops for the Tasks agent (it is operator-driven only); giving normal repo
agents the Tasks MCP (a later Tools-lane toggle); editing ideas from the graph.
