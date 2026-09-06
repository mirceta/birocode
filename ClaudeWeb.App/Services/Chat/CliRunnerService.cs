using System.Diagnostics;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Analytics;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Monitoring;

namespace ClaudeWeb.Services.Chat;

/// <summary>
/// Runs one agent chat turn through the provider-agnostic seam (openspec
/// provider-agnostic-runner): this class owns the PROVIDER-NEUTRAL lifecycle —
/// the monitoring record, the scoreboard ledger, the turn.start/turn.ended feed
/// events, the temp MCP-config file, spawning/awaiting/killing the CLI process,
/// cancellation and cleanup — while everything provider-specific (argv, stream
/// translation, session resume) lives behind <see cref="IAgentCliAdapter"/>:
/// <see cref="ClaudeCliAdapter"/> (the default, behaviour unchanged) and
/// <see cref="CodexCliAdapter"/>. Because busy/available, loops, dispatch and
/// wake-ups key off this lifecycle, they work identically for every provider.
///
/// Stable SSE event shapes (one JSON object per SSE "data:" line):
///   {"type":"session","sessionId":"..."}
///   {"type":"token","text":"Hel"}
///   {"type":"thinking","text":"..."}
///   {"type":"tool","id","name","status":"start"|"input"|"end",...}
///   {"type":"usage","contextTokens":132456}
///   {"type":"done","sessionId":"...","cost":0.04}
///   {"type":"error","message":"..."}
///
/// One CLI process may run at a time PER REPOSITORY -- the per-repo
/// single-flight gate lives in <see cref="RunSessionService"/> (see
/// plans/detached-runs.md). The run is detached from any HTTP connection:
/// <c>ct</c> is the Run Session's own token, fired only by an explicit user
/// Stop or app shutdown -- never by a client disconnect.
/// </summary>
public class CliRunnerService
{
    private readonly Logger _logger;
    private readonly CallLog _callLog;
    private readonly ActivityLog _activity;
    private readonly Audit.AuditService _audit;
    private readonly Events.HarnessEventFeed _feed;
    private readonly AgentProviderRegistry _providers;

    public CliRunnerService(Logger logger, CallLog callLog, ActivityLog activity, Audit.AuditService audit,
        Events.HarnessEventFeed feed, AgentProviderRegistry providers)
    {
        _logger = logger;
        _callLog = callLog;
        _activity = activity;
        _audit = audit;
        _feed = feed;
        _providers = providers;
    }

    /// <summary>The resolved Claude CLI executable, shared with the one-shot
    /// autopilot classifier (fix-suggestion-loop-inert, D5).</summary>
    public static string ClaudeExecutable => ClaudeCliAdapter.ClaudeExecutable;

    /// <summary>
    /// Runs one chat turn. Invokes <paramref name="emit"/> for every translated
    /// stable SSE event as it arrives. The caller claims the per-repo slot via
    /// <see cref="RunSessionService.TryBeginRun"/> first and marks the session
    /// complete when this returns.
    /// </summary>
    /// <param name="message">The user's prompt.</param>
    /// <param name="sessionId">When non-empty, resumes that session (a Claude
    /// session id or a Codex thread id — whichever the provider captured).</param>
    /// <param name="workingDirectory">The selected repository's folder; the CLI runs here.</param>
    /// <param name="emit">Async sink that buffers/broadcasts one stable SSE event.</param>
    /// <param name="mcpConfigJson">Optional MCP servers config (openspec
    /// add-dock-tools-lane): written to a per-run temp file (Claude passes the
    /// file; Codex re-reads the JSON into -c overrides), deleted when the run
    /// ends — secrets never persist beyond the run.</param>
    /// <param name="provider">"claude" (default) or "codex" (openspec
    /// provider-agnostic-runner); unknown values run as claude.</param>
    public async Task RunAsync(
        string message,
        string? sessionId,
        string workingDirectory,
        string? model = null,
        Func<object, Task>? emit = null,
        CancellationToken ct = default,
        bool readOnly = false,
        Audit.AuditContext? audit = null,
        string? repoId = null,
        string? repoName = null,
        string? mcpConfigJson = null,
        bool browser = false,
        IReadOnlyList<string>? disallowedTools = null,
        string? provider = null)
    {
        var adapter = _providers.Resolve(provider);
        var resuming = !string.IsNullOrWhiteSpace(sessionId);

        // Create the monitoring record up front so the GUI shows a "Running" row
        // immediately. Updated in place as events translate; finalized below.
        var displaySpec = new TurnSpec(message, sessionId, workingDirectory, model, readOnly, mcpConfigJson, null, browser, disallowedTools);
        var record = _callLog.StartCall(
            prompt: message,
            commandLine: adapter.DisplayCommand(displaySpec),
            workingDirectory: workingDirectory,
            resuming: resuming,
            sessionId: resuming ? sessionId! : "");

        // Scoreboard ledger (plans/scoreboard-analytics.md): record a builder
        // run's start/finish so analytics survive restarts. Read-only "ask" runs
        // are a side conversation, not agent work — excluded so they don't
        // inflate work-time stats.
        if (!readOnly) _activity.Append("start", workingDirectory, resuming ? sessionId : null);

        // Publish the turn.start harness event (openspec status-monitor-dashboard).
        // Same best-effort contract as the turn.ended publish in the finally below;
        // turnId pairs the two so consumers can derive "agents running now".
        var turnId = Guid.NewGuid().ToString("n");
        _feed.Publish(
            "turn.start",
            source: new { repoId = repoId ?? "", repoName = repoName ?? "" },
            data: new { turnId, sessionId = resuming ? sessionId : null, resuming, readOnly, browser, provider = adapter.Provider });

        Process? process = null;
        string? mcpConfigPath = null;
        try
        {
            if (!string.IsNullOrWhiteSpace(mcpConfigJson))
            {
                // Secret-bearing, so app-data (not the repo, not shared %TEMP%
                // naming) and removed in the finally below.
                var tmpDir = Path.Combine(AppPaths.DataDir, "tmp");
                Directory.CreateDirectory(tmpDir);
                mcpConfigPath = Path.Combine(tmpDir, $"mcp-{Guid.NewGuid():N}.json");
                await File.WriteAllTextAsync(mcpConfigPath, mcpConfigJson, ct);
                _logger.Info("[CLI] MCP tools config injected for this run");
            }

            var spec = displaySpec with { McpConfigPath = mcpConfigPath };
            var psi = adapter.CreateProcessInfo(spec);
            _logger.Info(resuming
                ? $"[CLI] Resuming session {Short(sessionId!)} in {workingDirectory} ({adapter.Provider})"
                : $"[CLI] Starting new session in {workingDirectory} ({adapter.Provider})");

            process = new Process { StartInfo = psi };
            process.Start();
            // A provider that redirects stdin (Codex) gets it closed at once: the
            // prompt is the argv one, nothing is appended from an inherited pipe.
            if (psi.RedirectStandardInput) { try { process.StandardInput.Close(); } catch { /* already closed */ } }

            string? capturedSessionId = null;
            var sawError = false;
            var sink = new TurnSink
            {
                Emit = emit!,
                Record = record,
                Update = _callLog.Update,
                OnSessionId = id => capturedSessionId = id,
                OnError = () => sawError = true,
                Audit = audit,
                LogTool = (a, name, summary) => _audit.LogTool(a, name, summary),
            };

            var reader = process.StandardOutput;
            while (true)
            {
                ct.ThrowIfCancellationRequested();
                // EOF is the null line; gating on the synchronous EndOfStream
                // property would park a pool thread per active run while the
                // pipe is quiet (openspec fix-startup-handle-race).
                var line = await reader.ReadLineAsync(ct);
                if (line is null) break;
                if (string.IsNullOrWhiteSpace(line)) continue;

                await adapter.TranslateLineAsync(line, sink);
            }

            await process.WaitForExitAsync(ct);
            var stderr = await process.StandardError.ReadToEndAsync(ct);

            if (process.ExitCode != 0 && !sawError)
            {
                var detail = !string.IsNullOrWhiteSpace(stderr) ? stderr.Trim()
                    : !string.IsNullOrWhiteSpace(sink.LastNotice) ? sink.LastNotice
                    : $"{adapter.CliLabel} exited with code {process.ExitCode}";
                _logger.Error($"[CLI] Exit code {process.ExitCode}: {detail}");
                record.ErrorMessage ??= detail;
                await emit(new { type = "error", message = detail });
            }
            else if (!string.IsNullOrWhiteSpace(stderr))
            {
                _logger.Info($"[CLI] stderr: {stderr.Trim()}");
            }

            // Finalize the monitoring record.
            record.ExitCode = process.ExitCode;
            if (!string.IsNullOrWhiteSpace(stderr)) record.StdErr = stderr.Trim();
            FinalizeRecord(record, hadException: false, sawError: sawError, exitCode: process.ExitCode);

            _logger.Info($"[CLI] Process finished (session {Short(capturedSessionId ?? sessionId ?? "?")})");
        }
        catch (OperationCanceledException)
        {
            _logger.Info("[CLI] Run stopped (user stop or app shutdown).");
            record.ErrorMessage ??= "Run stopped by user.";
            FinalizeRecord(record, hadException: true, sawError: true, exitCode: record.ExitCode);
            try { await emit(new { type = "error", message = "Run stopped by user." }); } catch { }
        }
        catch (Exception ex)
        {
            _logger.Error($"[CLI] Run failed: {ex.Message}");
            record.ErrorMessage ??= ex.Message;
            FinalizeRecord(record, hadException: true, sawError: true, exitCode: record.ExitCode);
            try { await emit(new { type = "error", message = ex.Message }); } catch { }
        }
        finally
        {
            // Ensure the CLI (and its child tree) is actually dead. On a user
            // Stop, Dispose alone would leave it running -- still working and
            // still billing. On normal completion HasExited is true, so this
            // is a no-op.
            try { if (process is { HasExited: false }) process.Kill(entireProcessTree: true); }
            catch { /* already gone / race */ }
            process?.Dispose();
            // The temp mcp-config carries API keys — gone the moment the run is,
            // success, stop, or crash alike (openspec add-dock-tools-lane).
            if (mcpConfigPath != null)
            {
                try { File.Delete(mcpConfigPath); }
                catch { /* transient lock; the GUID name never collides */ }
            }
            // Close the scoreboard run interval (matches the "start" above),
            // carrying this run's cost so the scoreboard can total spend.
            if (!readOnly) _activity.Append("finish", workingDirectory, record.SessionId, record.CostUsd);

            // Publish the turn.ended harness event (openspec add-harness-event-feed).
            // This is the single chokepoint hit by EVERY terminal path — normal
            // completion, CLI error, non-zero exit, cancellation, exception — so it
            // fires exactly once per turn (record is finalized before this finally).
            // Best-effort by contract: HarnessEventFeed.Publish never throws.
            _feed.Publish(
                "turn.ended",
                source: new { repoId = repoId ?? "", repoName = repoName ?? "" },
                data: new
                {
                    turnId,
                    sessionId = record.SessionId,
                    status = record.Status == "Success" ? "done" : "error",
                    rawStatus = record.Status,
                    costUsd = record.CostUsd,
                    numTurns = record.NumTurns,
                    readOnly,
                    provider = adapter.Provider,
                });
        }
    }

    /// <summary>
    /// Sets the terminal status on the record and publishes the final change.
    /// Status precedence: Error (exception / exit!=0 / sawError) > Throttled >
    /// Success.
    /// </summary>
    private void FinalizeRecord(CallRecord record, bool hadException, bool sawError, int? exitCode)
    {
        if (record.FinishedAt.HasValue) return; // already finalized
        record.FinishedAt = DateTime.Now;

        var failed = hadException || sawError || (exitCode.HasValue && exitCode.Value != 0);
        record.Status = failed ? "Error"
            : record.WasThrottled ? "Throttled"
            : "Success";

        _callLog.Update(record);
    }

    private static string Short(string id) => id.Length > 12 ? id[..12] + "..." : id;
}
