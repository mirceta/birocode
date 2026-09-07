# Claude / Codex reconciliation

Implemented 2026-09-07 on `feature/codex-real-run`, based on `af635d7`. This replaces the initial audit with changes and verification results. The production harness was not replaced.

## What was broken

The original integration normalized live CLI events, but still treated Claude's conversation store as the harness's history. Codex could answer while reload, loop observation and auxiliary workflows remained Claude-dependent. Switching engines cleared the incompatible native ID without transferring the preceding conversation; old bubbles misleadingly stayed visible. Provider choice was persisted, but model choice and injected tools did not consistently reach automation.

Live verification also exposed a Windows failure: the installed Codex npm shim truncated multiline arguments. The launcher now resolves the packaged native executable, and both adapters receive multiline or long prompts through stdin. Stderr is drained concurrently to prevent pipe deadlock.

## The portability contract

**They do not share conversation JSONL files.** Claude stores project transcripts under its native projects directory; Codex stores rollouts under `CODEX_HOME/sessions` (default `~/.codex/sessions`). Their schemas and session identities differ. The harness reads both, normalizes messages and tool records, and never rewrites one provider's native files into the other's schema.

| Area | Reconciliation |
| --- | --- |
| History, reload, picker | `NativeTranscripts` converts Codex rollout messages/tools for the incremental `SessionService` readers. Discovery checks exact session ID and working directory. The picker labels the engine. Duplicate message events and injected environment/instruction rows are filtered. |
| Same-engine continuation | Resume the native session after repository/provider ownership validation. |
| Engine switch | The shared runner transfers recent visible conversation into a new native session and emits a visible notice. `ConversationHandoff` persists prior messages and tools in harness app-data, preserving reload and repeated switches. Above 12,000 transcript characters, recent text is inlined and the full visible transcript is exported to a file whose path is supplied to the agent. Missing source history is an explicit error. Hidden reasoning and native compaction state are not transferred. |
| Manual turns, loops, dispatch | The shared runner resolves repository provider, saved model and enabled harness MCP tools. Loop and management observers use provider-aware history. Each dashboard model picker targets its own repository. |
| Instructions | Codex receives `project_doc_fallback_filenames=["CLAUDE.md"]`; native AGENTS.override.md / AGENTS.md precedence remains. If root CLAUDE.md is absent, Claude is instructed to read root AGENTS guidance and applicable nested files. When both exist, reference a common guide from both to align their rules. |
| MCP | Server names retain their identities. Stdio env, bearer tokens and arbitrary HTTP headers are forwarded without injected secret values in argv. A private stdio proxy isolates conflicting per-server environment values. Per-run config files are removed on completion. Malformed configs fail explicitly. Native MCP/OAuth settings remain separate. |
| Tool display | Codex MCP inputs, output/error previews, shell commands and plan events are normalized. Persisted native function/custom-tool calls and outputs restore history; common error and exit-code fields preserve failures. |
| Helpers | Production discovery/structured asks, loop classification and Understanding use the selected provider. Helpers start ephemeral sessions. Understanding receives a transcript snapshot without resuming or mutating the user's native conversation. |
| Lifecycle, usage | Both engines use shared cancellation, detached-run, monitoring and loop lifecycle. A late error overrides an earlier done event. Codex cached tokens are not added to input tokens twice; the GUI labels turn input rather than claiming context occupancy. |

## Differences exposed in the GUI

`ProviderCapabilities` appears beside chat and dashboard engine/model controls.

- **Claude-in-Chrome:** requires Claude. Codex hides the Chrome toggle, offers a switch-to-Claude action, and the HTTP endpoint rejects unsupported browser requests explicitly.
- **Management:** remains Claude because its restricted tool interface depends on Claude's structural tool-denial capability. It can dispatch work to Codex repository agents. A Codex-only installation still cannot use this management interface.
- **Ask:** Codex uses a read-only filesystem sandbox; Claude uses plan mode. Neither statement guarantees external mutating MCP services are blocked. The Codex GUI states this boundary.
- **Native skills, hooks, plugins, login, auto-memory and hidden reasoning:** remain native to each CLI. They are not copied between private stores. Put shared procedures and durable memory in repository files referenced by project instructions. Native extension APIs are not made compatible.
- **Streaming:** Codex exec may deliver completed message items rather than token deltas. The common interface supports both; timing and native billing counters are not identical.

## Verification

- Full backend suite: **468 passed**, zero failures/skips. Covers scoped native history, incremental resilience, durable/bounded handoffs and full exports, MCP fidelity and environment isolation, Windows executable resolution, shared runner model/tools, noisy stderr and late-error finalization.
- Client suite: **67 passed**. Production client build passed. Existing bundle-size and unrelated xUnit analyzer warnings remain.
- Real authenticated CLI + browser suite: **29 checks passed**, isolated on port 5238 with a new test repository. Evidence: `.claudeweb-preview/parity-live-1788787305069/verdict.json`, turn logs and `studio.png`. Terminal marker: `.claudeweb-preview/provider-parity-live.log`.
- Live checks cover Claude → Codex → Claude handoffs, native Codex resume, CLAUDE.md loading, durable messages/tools, MCP file work, filesystem Ask denial, a Codex loop with inherited MCP and completion sentinel, discovery, Understanding, ephemeral helpers and browser reload without JavaScript exceptions. Credentials were reused without modification; the MCP probe uses a fake token.
- Subsequent handoff-export, late-error and model-selection refinements passed the offline suites. The separate UI-only regression passed **11 checks** for independent dock models, capability guidance and explicit HTTP errors without model calls. Evidence: `.claudeweb-preview/parity-ui-1788788617157/verdict.json`, `capabilities.png` and `docks.png`; terminal marker in `.claudeweb-preview/provider-parity-ui.log`.

[Reproduction instructions](../tests/provider-parity/README.md). No production deployment, real repository model change or account migration was performed.

## Implementation entry points

- [Shared runner](../ClaudeWeb.App/Services/Chat/CliRunnerService.cs), [native reader](../ClaudeWeb.App/Services/Chat/NativeTranscripts.cs), [history](../ClaudeWeb.App/Services/Chat/SessionService.cs), [handoffs](../ClaudeWeb.App/Services/Chat/ConversationHandoff.cs)
- [Codex adapter](../ClaudeWeb.App/Services/Chat/CodexCliAdapter.cs), [Claude adapter and executable resolver](../ClaudeWeb.App/Services/Chat/ClaudeCliAdapter.cs), [MCP proxy](../ClaudeWeb.App/Services/Chat/McpStdioProxy.cs), [helpers](../ClaudeWeb.App/Services/Chat/AgentHelperRunner.cs)
- [GUI capabilities](../client/src/components/chat/ProviderCapabilities.jsx), [model/chat state](../client/src/context/ChatContext.jsx), [regression tests](../tests/ClaudeWeb.Tests/ProviderParityTests.cs)
- [Interactive explanation](../understanding-app/index.html)

## Official references checked during implementation

- [Codex instruction discovery](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)
- [Codex app-server thread persistence](https://learn.chatgpt.com/docs/app-server). This harness uses exec; it does not require an app-server migration.
