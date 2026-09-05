## 0. Setup

- [x] 0.1 On feature/work, pulled. Specs: seed `openspec/specs/task-graph/spec.md`;
      deltas for `tasks-agent` (new), `task-graph`, `ideas`. `openspec validate
      tasks-agent --strict` passes.

## 1. Backend

- [ ] 1.1 `NotesService` / `TaskGraphService`: optional `dirOverride` ctor param.
- [ ] 1.2 `Services/Tasks/TasksToolbox.cs`: the eight tools over Notes + TaskGraph +
      audit; auto-placement of new nodes; `EdgeError` → status mapping.
- [ ] 1.3 `Services/Tasks/TasksMcpServer.cs`: JSON-RPC shell (initialize, ping,
      tools/list, tools/call, resources/prompts empty) dispatching to the toolbox.
- [ ] 1.4 `Services/Tasks/TasksStateStore.cs` (`tasks-agent.json`) +
      `TasksAgentService.cs` (reserved id `@tasks`, home, role prompt v1, settings
      fence, `DisallowedTools` = arch's, bearer token, `BuildMcpConfigJson`,
      `SendToTasks`, session pin) + `TasksModuleExtensions` + `AppConfig.TasksHomeDir`.
- [ ] 1.5 `Controllers/TasksController.cs`: `GET /api/tasks` (state), `messages`,
      `tools`, `POST send`, `GET stream`, `POST stop-turn`, `POST|GET|DELETE mcp`.
      Auth middleware exempts `/api/tasks/mcp`; `RepositoryResolver.IsReserved` knows
      `@tasks`; DI in `EmbeddedApi`.

## 2. Client

- [ ] 2.1 `useArchStream({ repoId, streamPath })` options (defaults unchanged).
- [ ] 2.2 `pages/Tasks.jsx`: Chat + Tools lanes on the arch CSS; tab registry key
      `tasks` (feature `tasksAgent`), `App.jsx` route, `SettingsController.KnownTabs`,
      `UiModeContext` (`tasksAgent`, `ideasBreakUp` advanced), i18n en + tr.
- [ ] 2.3 Management App: `tasks` tab/pane; `build:manage`, bundle committed.
- [ ] 2.4 Ideas composer "Break into tasks": send, switch to graph, poll to done,
      `TaskGraphPanel refreshKey` reload.

## 3. Tests + verification

- [ ] 3.1 `tests/ClaudeWeb.Tests/TasksAgentTests.cs`: tools/list names; create_task +
      link_tasks round trip; cycle → `ok=false`, status `cycle`, `isError`; bearer
      rejection (wrong / empty token, right token accepted). `dotnet test` green.
- [ ] 3.2 `dotnet build`, `npm --prefix client run build`, `build:manage`,
      `openspec validate --strict` all clean.
- [ ] 3.3 Isolated preview on :5200 (`.claudeweb-preview/bin`, `CLAUDEWEB_DATADIR` =
      copy of the store minus auth.json), launched detached.
- [ ] 3.4 Detached Playwright (`.claudeweb-preview/playwright/verify-tasks-agent.mjs`
      + `run-verify-tasks.cmd`, log + `@@TASKSAGENT@@` marker): log in, Ideas, paste
      the fixture, click Break into tasks, wait for the run; ≥ 4 new nodes, ≥ 2 edges,
      no cycle, present after reload; screenshot under `.claudeweb-preview/evidence/`.
- [ ] 3.5 :5200 killed; tree clean; every commit on feature/work.

## 4. Understanding app

- [ ] 4.1 `understanding-app/index.html` (+ app.js/css, relative URLs): the flow
      composer → Tasks agent → MCP → TaskGraphService → graph panel.
