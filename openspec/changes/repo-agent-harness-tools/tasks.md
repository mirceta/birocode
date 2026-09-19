# Tasks — repo-agent-harness-tools

- [x] `HarnessKnowledge` (Services/Agents): index over the self repo's `docs/*.md` (live) with the embedded copy as fallback; topics + `##` sections; `Lookup(topic)`, `Search(query)`; "for this repo" prefix. csproj embeds `..\docs\*.md`.
- [x] `LoopArmer` (Services/Autopilot): the arch's `StartLocalLoop` / `UpdateLocalLoop` / stop extracted; `ArchAgentService` calls it; `LoopConfigStore.ArmedByAgent`.
- [x] `RepoAgentToolbox`: `HarnessHelp`, `StashPrompt`, `ArmMyLoop` over a `RepoAgentEnvironment`; `RepoAgentMcpServer`: tool defs + dispatch + instructions; `RepoAgentToolsService` builds the environment.
- [x] `ToolsController.BuildView`: the `harness` block (server + tools/list); `ToolsPanel.jsx` lists it first; i18n en + tr.
- [x] `docs/agents.md`: the Harness tools bullet names all five tools.
- [x] xunit `RepoAgentHarnessToolsTests`; `client/tests/ui/shot-dock-tools-harness.mjs`.
- [x] Understanding app (rolling latest): the pattern, the three tools, the knowledge source, the loop rules.
- [x] Branch + PR (no merge, no deploy).
- [ ] Not covered here: a live `claude -p` turn calling the three tools on a running harness (the server dispatch and the stores are unit-tested; the endpoint is the existing one).
