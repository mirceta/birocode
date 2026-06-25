using System.Text.Json;
using ClaudeMonitor.Client;

namespace ClaudeWeb.Services.StructuredAsk;

/// <summary>
/// Result of a structured ask: either a typed report or an error string.
/// </summary>
public sealed record StructuredAskResult<T>(bool Success, T? Report, string? Error) where T : class
{
    public static StructuredAskResult<T> Ok(T report) => new(true, report, null);
    public static StructuredAskResult<T> Fail(string error) => new(false, null, error);
}

/// <summary>
/// Sends a prompt through the REUSED ClaudeMonitor gateway, isolates the JSON from
/// the reply, parses it into a typed report, and retries with a correction prompt
/// when parsing fails. A near-verbatim port of web-flow-autodev's AgentRunner
/// (app/Autodev.AgenticStage/agent_runner/AgentRunner.cs), but built on the shared
/// ClaudeMonitor.Client instead of a bespoke in-harness runner -- see
/// openspec/changes/discover-local-apps/design.md (D2).
///
/// Read-only by construction (D3): the request's AllowedTools is restricted to
/// non-mutating tools, so the scan can read/search but cannot modify a repo.
/// </summary>
public class StructuredAskRunner
{
    // Read-only tool allowlist: the gateway has no plan-mode switch, so we withhold
    // every mutating tool (Write/Edit/Bash/...) and permit only read/search tools.
    private static readonly string[] ReadOnlyTools = { "Read", "Grep", "Glob", "LS" };

    private const string SystemPrompt =
        "You are a read-only repository investigator. Follow the instructions exactly. " +
        "Output only valid JSON.";

    private readonly string _appName;
    private readonly int _maxRetries;

    public StructuredAskRunner(string appName = "claudeweb-structured-ask", int maxRetries = 2)
    {
        _appName = appName;
        _maxRetries = maxRetries;
    }

    public async Task<StructuredAskResult<T>> RunAsync<T>(
        string prompt,
        Func<string, T> parse,
        string workingDirectory,
        CancellationToken ct = default) where T : class
    {
        // Per-call gateway identity (openspec change discover-local-apps-resilient,
        // task 3): give every call a UNIQUE app name (claudeweb-structured-ask#<id>)
        // rather than the shared base name. The ClaudeMonitor gateway resolves a
        // call's response metadata (call number, tokens, cost, duration) via
        // FindLatestRecord(app) = the highest-CallNumber record for that app name.
        // Under the shared name, two concurrent discoveries could each pick up the
        // OTHER's latest record and cross-wire their metadata. A name unique to this
        // call makes "latest record for this app" unambiguously THIS call's own —
        // fixing the cross-wiring without any gateway/client change (the gateway
        // already keys on the app name). Retries within this call reuse the same
        // unique client, so the final record resolved is still this call's.
        var callApp = $"{_appName}#{Guid.NewGuid():N}";
        using var claude = new ClaudeMonitorClient(callApp);

        if (!await claude.IsAvailable())
            return StructuredAskResult<T>.Fail(
                "Claude Monitor gateway is not running on localhost:5123. " +
                "Start birokrat-ai-platform\\ClaudeMonitor\\ClaudeMonitor.App.");

        var resp = await Send(claude, prompt, workingDirectory, ct);
        if (resp is null || !resp.Success)
            return StructuredAskResult<T>.Fail(resp?.Error ?? "null response from gateway");

        var raw = resp.Result;

        for (var attempt = 0; attempt < _maxRetries; attempt++)
        {
            try
            {
                return StructuredAskResult<T>.Ok(parse(PromptUtils.ExtractJson(raw)));
            }
            catch (JsonException ex)
            {
                var fixPrompt =
                    "You previously responded with this JSON:\n\n" + raw + "\n\n" +
                    "But it failed validation: " + ex.Message + "\n\n" +
                    "Please return the corrected JSON only. No explanation, no markdown fences.";

                var retry = await Send(claude, fixPrompt, workingDirectory, ct);
                if (retry is null || !retry.Success)
                    return StructuredAskResult<T>.Fail(retry?.Error ?? "null response from gateway (retry)");
                raw = retry.Result;
            }
        }

        try
        {
            return StructuredAskResult<T>.Ok(parse(PromptUtils.ExtractJson(raw)));
        }
        catch (Exception ex)
        {
            return StructuredAskResult<T>.Fail($"reply still failed to parse after {_maxRetries} retries: {ex.Message}");
        }
    }

    private Task<ClaudeResponse?> Send(ClaudeMonitorClient claude, string prompt, string workingDirectory, CancellationToken ct) =>
        claude.SendRequest(new ClaudeRequest
        {
            Prompt = prompt,
            SystemPrompt = SystemPrompt,
            WorkingDirectory = workingDirectory,
            AllowedTools = ReadOnlyTools,
        }, ct);
}
