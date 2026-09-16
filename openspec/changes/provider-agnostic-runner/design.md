# Design — provider-agnostic-runner

## D1. The seam: adapter owns the dialect, the runner owns the lifecycle

A turn has two halves:

1. **Lifecycle** (provider-neutral, stays in `CliRunnerService.RunAsync`):
   CallLog record, scoreboard ledger, `turn.start`/`turn.ended` feed events,
   temp MCP-config file, process spawn/await/kill-tree, cancellation, stderr,
   exit-code handling, finalization. Because busy/available, loops, dispatch
   and the arch's wake-ups all key off this half, they work for any provider
   without change.
2. **Dialect** (provider-specific, moves behind `IAgentCliAdapter`):

```csharp
public interface IAgentCliAdapter
{
    string Provider { get; }               // "claude" | "codex"
    string CliLabel { get; }               // for error messages
    string DisplayCommand(TurnSpec spec);  // GUI command line
    ProcessStartInfo CreateProcessInfo(TurnSpec spec);
    Task TranslateLineAsync(string line, TurnSink sink);
}
public sealed record TurnSpec(
    string Message, string? SessionId, string? WorkingDirectory, string? Model,
    bool ReadOnly, string? McpConfigJson, string? McpConfigPath, bool Browser,
    IReadOnlyList<string>? DisallowedTools);
```

`TurnSink` carries the emit callback, the `CallRecord`, an update delegate
(instead of `CallLog` so adapters unit-test with a bare record), session-id and
error callbacks, and the optional audit hook. `AgentProviderRegistry` resolves
`"codex"` → Codex adapter and everything else → Claude (safe default).

## D2. How Claude maps (unchanged behaviour)

The existing `CreateProcessInfo`/`BuildDisplayCommand`/`TranslateLine` (+ its
six handlers) move verbatim into `ClaudeCliAdapter`. Argv order, the
`--resume`-before-`-p` contract, `--mcp-config <tempfile>`, `--chrome`,
plan-mode vs `--dangerously-skip-permissions`, `--disallowedTools` last, and
the `ANTHROPIC_API_KEY` strip are all golden-asserted by tests so the default
path is provably byte-identical. `CliRunnerService.ClaudeExecutable` keeps
forwarding the resolved exe for the autopilot classifier.

## D3. How Codex maps

| concern | Claude | Codex |
|---|---|---|
| spawn | `claude -p <msg> --output-format stream-json …` | `codex exec --json [flags] <msg>` |
| resume | `--resume <sessionId>` before `-p` | `codex exec resume <threadId> --json … <msg>` |
| builder lane | `--dangerously-skip-permissions` | `--dangerously-bypass-approvals-and-sandbox` |
| ask lane (read-only) | `--permission-mode plan` | `--sandbox read-only` |
| model | `--model <m>` | `--model <m>` |
| MCP tools | `--mcp-config <tempfile>` | `-c mcp_servers.<name>.command/args/env=…` overrides parsed from the same injected JSON (stdio servers; url servers skipped with a log — deferred) |
| session id | `system/init.session_id` | `thread.started.thread_id` |
| answer text | `text_delta` tokens | `item.completed` `agent_message` (one token event — exec mode has no deltas) |
| reasoning | `thinking_delta` | `item.*` `reasoning` |
| tool calls | `tool_use`/`tool_result` blocks | `command_execution` / `file_change` / `mcp_tool_call` / `web_search` items (started → tool start+input, completed → tool end with exit/status) |
| usage | `result.usage` (4 counts + USD) | `turn.completed.usage` (input/cached/output tokens; no USD — cost stays null) |
| done | `result` | `turn.completed` |
| errors | `result.is_error`, `rate_limit_event` | `turn.failed` / `error` events |
| exe resolve | claude.exe > npm exe > .cmd fallback | codex.exe > npm exe > .cmd fallback; `Providers:Codex:Path` config override |
| credentials | CLI auth (`ANTHROPIC_API_KEY` stripped) | Codex CLI's own login / `OPENAI_API_KEY`; env passed through untouched |

Unknown JSONL event types are logged and skipped — a Codex CLI schema drift
degrades to a quieter transcript, never a crash. `--chrome` has no Codex
equivalent: the controller only engages browser mode when the effective
provider is claude. `DisallowedTools` (the arch's structural fence) has no
Codex equivalent: the Codex adapter refuses to build the invocation, so a
management agent cannot silently run unfenced — arch-on-Codex is deferred.

## D4. Selection

Precedence per turn: `ChatRequest.Provider` (per-conversation/turn override) →
`RepositoryConfig.Provider` (per-agent, persisted, dock-settable via
`POST /api/repo/{id}/provider`) → `claude`. The repo listing, dock
(PinnedAgent select) and `list_agents` (`provider` on local agents) surface it.
Normalization accepts only `claude|codex`; anything else reads as claude.

## Testing

Golden argv for Claude (builder/ask/resume/mcp/disallowed/env-strip) and Codex
(new/resume/read-only/model/mcp overrides/refusal of disallowedTools); Codex
JSONL translation end-to-end over a scripted event sequence (session → token →
tool start/end → usage → done; failed → error); registry resolution and
normalization; repo provider persistence round-trip.
