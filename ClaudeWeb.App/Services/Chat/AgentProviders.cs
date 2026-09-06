using System.Diagnostics;
using ClaudeWeb.Models;

namespace ClaudeWeb.Services.Chat;

/// <summary>
/// Provider names for the pluggable agent runner (openspec provider-agnostic-runner).
/// Anything unrecognized normalizes to <see cref="Claude"/> — a stray value from an
/// old client or a sync peer must never change which engine runs a repo.
/// </summary>
public static class AgentProviders
{
    public const string Claude = "claude";
    public const string Codex = "codex";

    public static string Normalize(string? provider) =>
        string.Equals(provider?.Trim(), Codex, StringComparison.OrdinalIgnoreCase) ? Codex : Claude;
}

/// <summary>Everything provider-specific a turn needs, resolved by the caller
/// before the spawn. <c>McpConfigJson</c> is the injected tool config as built
/// (openspec add-dock-tools-lane); <c>McpConfigPath</c> is the per-run temp file
/// the lifecycle wrote it to — Claude passes the file, Codex re-reads the JSON
/// into <c>-c</c> overrides.</summary>
public sealed record TurnSpec(
    string Message,
    string? SessionId,
    string? WorkingDirectory,
    string? Model,
    bool ReadOnly,
    string? McpConfigJson,
    string? McpConfigPath,
    bool Browser,
    IReadOnlyList<string>? DisallowedTools);

/// <summary>The lifecycle's callbacks handed to an adapter while translating a
/// CLI's output stream. Carries a plain <see cref="CallRecord"/> and an update
/// delegate (not the CallLog) so adapters unit-test with a bare record.</summary>
public sealed class TurnSink
{
    public required Func<object, Task> Emit { get; init; }
    public required CallRecord Record { get; init; }
    public required Action<CallRecord> Update { get; init; }
    public required Action<string> OnSessionId { get; init; }
    public required Action OnError { get; init; }
    public Audit.AuditContext? Audit { get; init; }
    /// <summary>Audit hook: (context, toolName, summary). Null in tests.</summary>
    public Action<Audit.AuditContext, string, string>? LogTool { get; init; }
    /// <summary>The last non-terminal notice the provider reported (Codex's
    /// transport "error" events); the runner reads it when the CLI exits
    /// non-zero without a terminal event, so the Operator sees the real
    /// message rather than a bare exit code (openspec codex-real-run).</summary>
    public string? LastNotice { get; set; }
}

/// <summary>
/// The provider-specific quarter of a chat turn (openspec provider-agnostic-runner):
/// how to invoke the CLI, how its stream translates into the harness's stable SSE
/// events, and how a session resumes. The provider-neutral lifecycle (record,
/// ledger, turn.start/turn.ended, process handling) stays in
/// <see cref="CliRunnerService"/>, so loops/dispatch/availability are identical
/// for every provider.
/// </summary>
public interface IAgentCliAdapter
{
    /// <summary>"claude" | "codex" (see <see cref="AgentProviders"/>).</summary>
    string Provider { get; }

    /// <summary>Label used in exit-code error messages ("Claude CLI" / "Codex CLI").</summary>
    string CliLabel { get; }

    /// <summary>Readable spawn command for the monitoring GUI (prompt truncated).</summary>
    string DisplayCommand(TurnSpec spec);

    /// <summary>The full invocation. May throw <see cref="NotSupportedException"/>
    /// when the spec asks for something this provider cannot honour (e.g. Codex
    /// with structural tool denials) — the lifecycle surfaces it as an error event.</summary>
    ProcessStartInfo CreateProcessInfo(TurnSpec spec);

    /// <summary>Parses one stdout line and emits zero or more stable SSE events.
    /// Must never throw on malformed input — log and skip.</summary>
    Task TranslateLineAsync(string line, TurnSink sink);
}

/// <summary>Resolves a provider name to its adapter; unknown/empty → Claude.</summary>
public class AgentProviderRegistry
{
    private readonly IReadOnlyDictionary<string, IAgentCliAdapter> _adapters;

    public AgentProviderRegistry(IEnumerable<IAgentCliAdapter> adapters)
    {
        _adapters = adapters.ToDictionary(a => a.Provider, StringComparer.OrdinalIgnoreCase);
    }

    public IAgentCliAdapter Resolve(string? provider)
    {
        var key = AgentProviders.Normalize(provider);
        return _adapters.TryGetValue(key, out var a) ? a : _adapters[AgentProviders.Claude];
    }
}
