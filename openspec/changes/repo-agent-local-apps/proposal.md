# A repo agent discovers and operates its own local apps: `my_local_apps`

## Why

Fleet task f1b0526c (the Operator, 2026-09-22): each repo agent has its own registered local
apps, each with a filesystem path and a port. When the Operator prompts an agent about one, the
agent hunts the disk for where it lives and what it is. It should be able to ask the harness:
what local apps do I have, where are they, how do I run them — and, where it is clean, start and
stop them.

## What the code says the source of truth is (verified)

- **Registration** is the repo's local-app list in the repository registry
  (`repositories.json`, `RepositoryConfig.LocalApps`, edited by the Operator's Local setup form
  and `POST /api/repos/{id}/local-apps`): id, name, port, kind. Kind `repo` is a product the
  agent runs on a loopback port, proxied at `/api/localview/<repo>/app/<id>/`; kind `harness` is
  an always-on app the harness serves itself (Understanding and Goal on every repo, the Lab and
  the events feed on the self repo). A registration carries **no folder and no command**.
- **Folders and commands** live only in the **discovery cache** (`local-app-cache/<repo>.json`,
  written by the Local Apps panel's Discover scan or an imported findings file): name, port,
  repo-relative folder, evidence, start command, build command. The panel's Run / Stop / Restart
  resolve everything by port from this cache.
- There is no `tool.json` manifest anywhere in the harness; the Operator's phrase maps to the
  discovery cache.
- Running is never stored: the panel reads it live off the port (`LocalAppRunner.IsListening`).

## What changes

One more tool on the repo agents' `claude-web` MCP server (the PR #126 pattern — a toolbox
method, a dispatch arm, a catalogue entry; no new endpoint):

**`my_local_apps(action?, app?)`** — the agent's own apps as one list, joined by port:

| field | from |
|---|---|
| id, name, kind, registered | the registry (or `port-<n>` for a discovered app nobody registered) |
| port, url (`http://127.0.0.1:<port>/`), servedAt (`http://127.0.0.1:<harness>/api/localview/<repo>/app/<id>/`) | the registry; servedAt only when registered |
| folder (absolute, inside the repo), startCommand, buildCommand, evidence, discoveredAt | the discovery cache |
| running | live off the port on every call |
| howToRun, howToStop | words, always present — including what is missing and how to get it |

Actions: `list` (default; one app with `app`), `status` (the same, live), `start`, `stop`,
`restart` — the last three through the Local Apps panel's own runner and guards: the cached
start command launched detached in the app's folder; stop resolves the port's live owner and
ends its process tree, structurally never the harness or its host; restart waits for the port
to free before relaunching; harness-served apps answer `always-on`. Every start / stop lands in
the dock's Event Console (titled "… (agent)") and the autopilot audit.

Read on every call: a new registration or a fresh scan is the next answer. Listed in the dock's
Tools lane with the rest of the catalogue.

## Impact

- Backend: `LocalAppCatalog` (pure join), `RepoAgentToolbox.LocalApps.cs`, `ILocalAppOps` +
  `RunnerOps`, five environment fields, one tool on the server.
- Docs: `docs/agents.md` names the tool. No new endpoint, no storage, no client code beyond the
  UI test's fixture.
