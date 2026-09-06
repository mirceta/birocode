# Provider-agnostic agent runner: Claude and Codex

## Why

Today every agent turn is a `claude -p` spawn hard-wired through
`CliRunnerService`: the argv, the `stream-json` translation, the session-resume
semantics and the MCP injection are all Claude-shaped. The Operator wants the
harness usable through OpenAI's Codex CLI as well — same dock, same transcript,
same tools, same board — with the provider chosen per agent.

## What Changes

- **Provider abstraction**: `IAgentCliAdapter` owns the provider-specific
  quarter of a turn — building the process invocation, translating the CLI's
  stream into the harness's stable SSE events (session/token/thinking/tool/
  usage/done/error), session-resume argv, and how the harness's MCP tool config
  reaches the agent. `CliRunnerService` keeps everything provider-neutral:
  the run record, the activity ledger, turn.start/turn.ended events, the
  process lifecycle, cancellation, and cleanup — so busy/available, loops,
  dispatch and wake-ups work identically for every provider.
- **Claude adapter**: the existing behaviour moved verbatim; byte-identical
  argv and translation. The default provider.
- **Codex adapter**: drives `codex exec --json` headless — sandbox flags map
  the builder/ask lanes, `exec resume <threadId>` maps session resume, JSONL
  events (thread/turn/item) map onto the same SSE contract, and the per-repo
  MCP config is passed as `-c mcp_servers.*` overrides so a Codex agent calls
  the same repo tools.
- **Selection + config**: `provider` (claude | codex, default claude) per repo
  agent — persisted on `RepositoryConfig`, settable from the dock, overridable
  per turn via the chat request — and surfaced in the repo listing, the dock
  and `list_agents`. Codex CLI path override via `Providers:Codex:Path`;
  credentials stay with the Codex CLI itself (`codex login` / `OPENAI_API_KEY`),
  the harness stores nothing.

## Vertical slice and deferred work

This change delivers the abstraction plus one repo agent end-to-end under
Codex (open a turn, stream into the dock transcript, call repo MCP tools,
produce commits). Deferred as follow-ups: management agents (arch/tasks) on
Codex (their structural tool denials have no Codex equivalent yet — a Codex
run refuses `disallowedTools`), Claude-in-Chrome stays Claude-only, and
Codex-side cost reporting (Codex reports tokens, not USD).

## Impact

- Affected specs: `chat` (pluggable provider), `arch-agent` (list_agents
  provider field).
- Affected code: `CliRunnerService` (seam extraction), new
  `AgentProviders`/`ClaudeCliAdapter`/`CodexCliAdapter`, `ChatController`,
  `RepositoryConfig`/`RepositoryRegistry`/`RepoController`,
  `ArchAgentService.ToolListAgents`, dock `PinnedAgent`, docs/providers.md.
- Claude path: argv and event translation unchanged (golden-asserted in tests).
