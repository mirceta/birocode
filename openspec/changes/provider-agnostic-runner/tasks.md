# Tasks â€” provider-agnostic-runner

## 1. Abstraction

- [x] 1.1 `IAgentCliAdapter` + `TurnSpec` + `TurnSink` + `AgentProviderRegistry` (default claude)
- [x] 1.2 `ClaudeCliAdapter`: existing argv/translation moved verbatim; `CliRunnerService.ClaudeExecutable` still forwards
- [x] 1.3 `CliRunnerService`: lifecycle only; provider parameter; adapter delegation

## 2. Codex runner

- [x] 2.1 `CodexCliAdapter`: exe resolution (+ `Providers:Codex:Path`), argv for new/resume turns, laneâ†’sandbox mapping, model
- [x] 2.2 MCP config JSON â†’ `-c mcp_servers.*` overrides (stdio servers; url skipped with log)
- [x] 2.3 JSONL translation: thread.started/item.*/turn.completed/turn.failed â†’ session/token/thinking/tool/usage/done/error
- [x] 2.4 Refuse disallowedTools (management agents deferred); browser stays claude-only

## 3. Selection + surfaces

- [x] 3.1 `RepositoryConfig.Provider` + `RepositoryRegistry.SetProvider` + `RepositoryInfo.Provider`
- [x] 3.2 `RepoController`: provider in listing + `POST /api/repo/{id}/provider`
- [x] 3.3 `ChatController`: `ChatRequest.Provider` override, effective-provider resolution, browser gate claude-only
- [x] 3.4 `list_agents`: provider on local agents; dock `PinnedAgent` provider select

## 4. Spec, docs, tests

- [x] 4.1 OpenSpec deltas (chat, arch-agent) validate --strict
- [x] 4.2 docs/providers.md (Codex install/auth/path config, per-repo selection, deferred list)
- [x] 4.3 Tests: Claude argv golden (unchanged), Codex argv, Codex translation, registry/normalization, provider persistence

