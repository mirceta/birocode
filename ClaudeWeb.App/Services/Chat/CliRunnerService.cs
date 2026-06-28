using System.Diagnostics;
using System.Text.Json;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Analytics;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Monitoring;

namespace ClaudeWeb.Services.Chat;

/// <summary>
/// Spawns the Claude Code CLI, parses its <c>stream-json</c> stdout line by
/// line, and translates the raw CLI events into the small, stable SSE contract
/// the frontend (M5) consumes. The frontend never sees raw CLI internals.
///
/// Stable SSE event shapes (one JSON object per SSE "data:" line):
///   {"type":"session","sessionId":"..."}             from system/init
///   {"type":"token","text":"Hel"}                    from text_delta (the answer)
///   {"type":"thinking","text":"..."}                 from thinking content/delta
///   {"type":"tool","id","name","status":"start"}     tool_use begins
///   {"type":"tool","id","name","status":"input","summary","detail"}  full input known
///   {"type":"tool","id","status":"end","ok","preview"}              tool_result
///   {"type":"usage","contextTokens":132456}          from assistant message.usage (context fill)
///   {"type":"done","sessionId":"...","cost":0.04}    from result
///   {"type":"error","message":"..."}                 from result.is_error / throttle / failures
///
/// Spawn command (Verified CLI Contract, claude v2.1.92):
///   claude -p "&lt;message&gt;" --output-format stream-json --include-partial-messages --verbose
///   (+ "--resume &lt;sessionId&gt;" before -p when continuing a session)
///
/// One CLI process may run at a time PER REPOSITORY -- the per-repo
/// single-flight gate lives in <see cref="RunSessionService"/> (see
/// plans/detached-runs.md). Different repos run in parallel. The working
/// directory is supplied per-request by the caller (resolved from the
/// selected repository), never cached.
///
/// The run is detached from any HTTP connection: <paramref name="ct"/> is the
/// Run Session's own token, fired only by an explicit user Stop or app
/// shutdown -- never by a client disconnect.
/// </summary>
public class CliRunnerService
{
    private readonly Logger _logger;
    private readonly CallLog _callLog;
    private readonly ActivityLog _activity;
    private readonly Audit.AuditService _audit;
    private readonly Events.HarnessEventFeed _feed;

    public CliRunnerService(Logger logger, CallLog callLog, ActivityLog activity, Audit.AuditService audit,
        Events.HarnessEventFeed feed)
    {
        _logger = logger;
        _callLog = callLog;
        _activity = activity;
        _audit = audit;
        _feed = feed;
    }

    /// <summary>
    /// Runs one chat turn. Invokes <paramref name="emit"/> for every translated
    /// stable SSE event as it arrives. The caller claims the per-repo slot via
    /// <see cref="RunSessionService.TryBeginRun"/> first and marks the session
    /// complete when this returns.
    /// </summary>
    /// <param name="message">The user's prompt.</param>
    /// <param name="sessionId">When non-empty, resumes that session.</param>
    /// <param name="workingDirectory">The selected repository's folder; the CLI runs here.</param>
    /// <param name="emit">Async sink that buffers/broadcasts one stable SSE event.</param>
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
        string? repoName = null)
    {
        var resuming = !string.IsNullOrWhiteSpace(sessionId);

        // Create the monitoring record up front so the GUI shows a "Running" row
        // immediately. Updated in place as events translate; finalized below.
        var record = _callLog.StartCall(
            prompt: message,
            commandLine: BuildDisplayCommand(message, sessionId),
            workingDirectory: workingDirectory,
            resuming: resuming,
            sessionId: resuming ? sessionId! : "");

        // Scoreboard ledger (plans/scoreboard-analytics.md): record a builder
        // run's start/finish so analytics survive restarts. Read-only "ask" runs
        // are a side conversation, not agent work — excluded so they don't
        // inflate work-time stats.
        if (!readOnly) _activity.Append("start", workingDirectory, resuming ? sessionId : null);

        Process? process = null;
        try
        {
            var psi = CreateProcessInfo(message, sessionId, workingDirectory, model, readOnly);
            _logger.Info(resuming
                ? $"[CLI] Resuming session {Short(sessionId!)} in {workingDirectory}"
                : $"[CLI] Starting new session in {workingDirectory}");

            process = new Process { StartInfo = psi };
            process.Start();

            string? capturedSessionId = null;
            var sawError = false;

            var reader = process.StandardOutput;
            while (!reader.EndOfStream)
            {
                ct.ThrowIfCancellationRequested();
                var line = await reader.ReadLineAsync(ct);
                if (string.IsNullOrWhiteSpace(line)) continue;

                await TranslateLine(line, emit, record,
                    onSessionId: id => capturedSessionId = id,
                    onError: () => sawError = true,
                    audit: audit);
            }

            await process.WaitForExitAsync(ct);
            var stderr = await process.StandardError.ReadToEndAsync(ct);

            if (process.ExitCode != 0 && !sawError)
            {
                var detail = string.IsNullOrWhiteSpace(stderr)
                    ? $"Claude CLI exited with code {process.ExitCode}"
                    : stderr.Trim();
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
                    sessionId = record.SessionId,
                    status = record.Status == "Success" ? "done" : "error",
                    rawStatus = record.Status,
                    costUsd = record.CostUsd,
                    numTurns = record.NumTurns,
                    readOnly,
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

    /// <summary>
    /// Builds a readable representation of the spawn command for the GUI. The
    /// prompt is truncated here for display; the full prompt lives on
    /// <see cref="CallRecord.Prompt"/>.
    /// </summary>
    private static string BuildDisplayCommand(string message, string? sessionId)
    {
        var promptDisplay = message.Replace("\r", " ").Replace("\n", " ");
        if (promptDisplay.Length > 80) promptDisplay = promptDisplay[..80] + "...";

        var parts = new List<string> { "claude" };
        if (!string.IsNullOrWhiteSpace(sessionId))
        {
            parts.Add("--resume");
            parts.Add(sessionId);
        }
        parts.Add("-p");
        parts.Add($"\"{promptDisplay}\"");
        parts.Add("--output-format");
        parts.Add("stream-json");
        parts.Add("--include-partial-messages");
        parts.Add("--verbose");
        return string.Join(" ", parts);
    }

    // --- stream-json -> stable SSE translation ----------------------------

    /// <summary>
    /// Parses one stream-json line and emits zero or more stable SSE events.
    /// Non-JSON lines are logged and ignored so a stray banner never crashes
    /// the stream.
    /// </summary>
    private async Task TranslateLine(
        string line, Func<object, Task> emit, CallRecord record,
        Action<string> onSessionId, Action onError, Audit.AuditContext? audit = null)
    {
        JsonDocument doc;
        try { doc = JsonDocument.Parse(line); }
        catch
        {
            _logger.Info($"[CLI] (non-JSON) {line}");
            return;
        }

        using (doc)
        {
            var root = doc.RootElement;
            var type = root.TryGetProperty("type", out var tp) ? tp.GetString() ?? "" : "";

            switch (type)
            {
                case "system":
                    await HandleSystem(root, emit, record, onSessionId);
                    break;
                case "stream_event":
                    await HandleStreamEvent(root, emit, record);
                    break;
                case "assistant":
                    await HandleAssistant(root, emit, record, audit);
                    break;
                case "user":
                    await HandleUser(root, emit);
                    break;
                case "rate_limit_event":
                    await HandleRateLimit(root, emit, record, onError);
                    break;
                case "result":
                    await HandleResult(root, emit, record, onError);
                    break;
                // "message_*" framing events carry no user-visible content.
            }
        }
    }

    /// <summary>system/init carries the session id immediately -- forward it now.</summary>
    private async Task HandleSystem(JsonElement root, Func<object, Task> emit, CallRecord record, Action<string> onSessionId)
    {
        var subtype = root.TryGetProperty("subtype", out var sp) ? sp.GetString() : null;
        if (subtype != "init") return;

        // Capture model + cwd from the init event for the monitoring record.
        if (root.TryGetProperty("model", out var modelProp) && modelProp.ValueKind == JsonValueKind.String)
            record.Model = modelProp.GetString();
        if (root.TryGetProperty("cwd", out var cwdProp) && cwdProp.ValueKind == JsonValueKind.String)
        {
            var cwd = cwdProp.GetString();
            if (!string.IsNullOrEmpty(cwd)) record.WorkingDirectory = cwd;
        }

        if (root.TryGetProperty("session_id", out var sidProp))
        {
            var sid = sidProp.GetString();
            if (!string.IsNullOrEmpty(sid))
            {
                record.SessionId = sid;
                onSessionId(sid);
                _logger.Info($"[CHAT] Session id {Short(sid)} (sent to client)");
                await emit(new { type = "session", sessionId = sid });
            }
        }

        _callLog.Update(record);
    }

    /// <summary>
    /// Token-level streaming. We forward visible text deltas as "token" events
    /// and reduce thinking deltas to a content-free "thinking" signal so the
    /// chain-of-thought never leaks into the chat bubble.
    /// </summary>
    private async Task HandleStreamEvent(JsonElement root, Func<object, Task> emit, CallRecord record)
    {
        if (!root.TryGetProperty("event", out var ev)) return;
        var evType = ev.TryGetProperty("type", out var etp) ? etp.GetString() : "";

        switch (evType)
        {
            case "content_block_start":
                // A tool_use block can begin here -- announce the tool by name.
                if (ev.TryGetProperty("content_block", out var cb))
                {
                    var cbType = cb.TryGetProperty("type", out var cbt) ? cbt.GetString() : "";
                    if (cbType == "tool_use")
                    {
                        var name = cb.TryGetProperty("name", out var np) ? np.GetString() ?? "tool" : "tool";
                        var id = cb.TryGetProperty("id", out var ip) ? ip.GetString() ?? "" : "";
                        _logger.Info($"[CHAT] Tool: {name}");
                        AddTool(record, name);
                        await emit(new { type = "tool", id, name, status = "start" });
                    }
                    else if (cbType == "thinking")
                    {
                        await emit(new { type = "thinking" });
                    }
                }
                break;

            case "content_block_delta":
                if (ev.TryGetProperty("delta", out var delta))
                {
                    var dType = delta.TryGetProperty("type", out var dtp) ? dtp.GetString() : "";
                    if (dType == "text_delta")
                    {
                        var text = delta.TryGetProperty("text", out var t) ? t.GetString() ?? "" : "";
                        if (text.Length > 0)
                        {
                            if (!record.FirstTokenAt.HasValue)
                            {
                                record.FirstTokenAt = DateTime.Now;
                                _callLog.Update(record);
                            }
                            record.Output.Append(text);
                            await emit(new { type = "token", text });
                        }
                    }
                    else if (dType == "thinking_delta")
                    {
                        // Forward the reasoning text so the UI can show what it's
                        // working through (rendered dimmed/collapsible, not in the
                        // answer bubble).
                        var text = delta.TryGetProperty("thinking", out var th) ? th.GetString() ?? "" : "";
                        await emit(new { type = "thinking", text });
                    }
                    // signature_delta / input_json_delta -> ignored.
                }
                break;
        }
    }

    /// <summary>
    /// Consolidated full turn. The only thing we surface from here is tool_use
    /// blocks (some tool calls only appear in this consolidated event, not as a
    /// stream_event). Text is already streamed via deltas, so it's not re-sent.
    /// </summary>
    private async Task HandleAssistant(JsonElement root, Func<object, Task> emit, CallRecord record, Audit.AuditContext? audit = null)
    {
        if (!root.TryGetProperty("message", out var msg)) return;

        // message.usage on each assistant message tells us how big the context
        // that produced it was: input + cache-read + cache-creation tokens.
        // Forwarded as a raw count (no window size assumed -- it varies by model).
        if (msg.TryGetProperty("usage", out var usage) && usage.ValueKind == JsonValueKind.Object)
        {
            var contextTokens = ReadLong(usage, "input_tokens")
                + ReadLong(usage, "cache_read_input_tokens")
                + ReadLong(usage, "cache_creation_input_tokens");
            if (contextTokens > 0)
                await emit(new { type = "usage", contextTokens });
        }

        if (!msg.TryGetProperty("content", out var content) ||
            content.ValueKind != JsonValueKind.Array)
            return;

        foreach (var block in content.EnumerateArray())
        {
            var bt = block.TryGetProperty("type", out var btp) ? btp.GetString() : "";
            if (bt == "tool_use")
            {
                var name = block.TryGetProperty("name", out var np) ? np.GetString() ?? "tool" : "tool";
                var id = block.TryGetProperty("id", out var ip) ? ip.GetString() ?? "" : "";
                _logger.Info($"[CHAT] Tool: {name}");
                AddTool(record, name);

                // The consolidated block carries the full input -- send a one-line
                // summary (the command, file path, etc.) plus a truncated detail
                // for the expandable view. Also carries `name` so this works even
                // for tools that never appeared as a stream_event.
                string summary = "", detail = "";
                if (block.TryGetProperty("input", out var input) && input.ValueKind == JsonValueKind.Object)
                {
                    summary = ToolSummary(name, input);
                    detail = Truncate(input.GetRawText(), 1200);
                }
                await emit(new { type = "tool", id, name, status = "input", summary, detail });

                // Action audit (openspec add-action-audit): record EVERY tool action (reads
                // included), attributed to the turn's actor.
                if (audit != null)
                    _audit.LogTool(audit, name, string.IsNullOrEmpty(summary) ? detail : summary);
            }
        }
    }

    /// <summary>
    /// tool_result blocks (echoed back as a "user" event) carry each tool's
    /// output. Surface a short, truncated preview and an ok/failed flag so the UI
    /// can close out the tool step.
    /// </summary>
    private async Task HandleUser(JsonElement root, Func<object, Task> emit)
    {
        if (!root.TryGetProperty("message", out var msg) ||
            !msg.TryGetProperty("content", out var content) ||
            content.ValueKind != JsonValueKind.Array)
            return;

        foreach (var block in content.EnumerateArray())
        {
            var bt = block.TryGetProperty("type", out var btp) ? btp.GetString() : "";
            if (bt != "tool_result") continue;

            var id = block.TryGetProperty("tool_use_id", out var ip) ? ip.GetString() ?? "" : "";
            var ok = !(block.TryGetProperty("is_error", out var ep) && ep.ValueKind == JsonValueKind.True);
            var preview = Truncate(ExtractToolResultText(block), 800, maxLines: 15);
            await emit(new { type = "tool", id, status = "end", ok, preview });
        }
    }

    /// <summary>Pulls the text of a tool_result whose content may be a plain
    /// string or an array of typed blocks.</summary>
    private static string ExtractToolResultText(JsonElement block)
    {
        if (!block.TryGetProperty("content", out var content)) return "";
        if (content.ValueKind == JsonValueKind.String) return content.GetString() ?? "";
        if (content.ValueKind == JsonValueKind.Array)
        {
            var parts = new List<string>();
            foreach (var b in content.EnumerateArray())
            {
                if (b.TryGetProperty("type", out var t) && t.GetString() == "text" &&
                    b.TryGetProperty("text", out var tx))
                    parts.Add(tx.GetString() ?? "");
            }
            return string.Join("\n", parts);
        }
        return "";
    }

    /// <summary>One-line, human-readable summary of a tool call's input.</summary>
    private static string ToolSummary(string name, JsonElement input)
    {
        string Get(string key) =>
            input.TryGetProperty(key, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() ?? "" : "";

        var s = name switch
        {
            "Bash" => Get("command"),
            "Read" or "Write" or "Edit" or "NotebookEdit" => Get("file_path"),
            "Glob" or "Grep" => Get("pattern"),
            "Task" or "Agent" => Get("description"),
            "WebFetch" or "WebSearch" => Get("url") + Get("query"),
            "Skill" => Get("skill"),
            _ => Get("command") + Get("file_path") + Get("path") + Get("pattern") + Get("url") + Get("description"),
        };
        return Truncate(s.Replace("\r", " ").Replace("\n", " "), 140);
    }

    /// <summary>Truncates to a char budget and (optionally) a line budget, adding
    /// an ellipsis when clipped.</summary>
    private static string Truncate(string? text, int maxChars, int maxLines = 0)
    {
        if (string.IsNullOrEmpty(text)) return "";
        var s = text;
        if (maxLines > 0)
        {
            var lines = s.Split('\n');
            if (lines.Length > maxLines)
                s = string.Join("\n", lines.Take(maxLines)) + "\n...";
        }
        if (s.Length > maxChars) s = s[..maxChars] + "...";
        return s;
    }

    /// <summary>Append a tool name to the record, collapsing consecutive duplicates.</summary>
    private void AddTool(CallRecord record, string name)
    {
        if (record.Tools.Count == 0 || record.Tools[^1] != name)
        {
            record.Tools.Add(name);
            _callLog.Update(record);
        }
    }

    /// <summary>Surface a throttle warning when the CLI reports a non-allowed status.</summary>
    private async Task HandleRateLimit(JsonElement root, Func<object, Task> emit, CallRecord record, Action onError)
    {
        var status = root.TryGetProperty("rate_limit_info", out var info) &&
                     info.TryGetProperty("status", out var sp)
            ? sp.GetString() ?? ""
            : "";

        if (status != "" && status != "allowed")
        {
            onError();
            record.WasThrottled = true;
            record.ErrorMessage ??= $"Rate limited (status: {status})";
            _callLog.Update(record);
            _logger.Error($"[CLI] Rate limit: {status}");
            await emit(new { type = "error", message = $"Rate limited (status: {status})" });
        }
    }

    /// <summary>Terminal event. Emits "done" on success or "error" on failure.</summary>
    private async Task HandleResult(JsonElement root, Func<object, Task> emit, CallRecord record, Action onError)
    {
        var sessionId = root.TryGetProperty("session_id", out var sidProp) ? sidProp.GetString() : null;
        var isError = root.TryGetProperty("is_error", out var iep) &&
                      iep.ValueKind == JsonValueKind.True;

        // The result event carries all four token counts in one usage object --
        // capture them regardless of success/error.
        CaptureUsageAndMeta(root, record);
        if (!string.IsNullOrEmpty(sessionId)) record.SessionId = sessionId;

        if (isError)
        {
            onError();
            var resultText = root.TryGetProperty("result", out var rp) ? rp.GetString() ?? "" : "";
            var subtype = root.TryGetProperty("subtype", out var stp) ? stp.GetString() ?? "" : "";
            var msg = !string.IsNullOrWhiteSpace(resultText) ? resultText
                    : !string.IsNullOrWhiteSpace(subtype) ? subtype
                    : "Claude CLI reported an error";
            record.ErrorMessage ??= msg;
            _callLog.Update(record);
            _logger.Error($"[CLI] Result error: {msg}");
            await emit(new { type = "error", message = msg });
            return;
        }

        _callLog.Update(record);
        _logger.Info($"[CLI] Done: session {Short(sessionId ?? "?")}, {record.NumTurns} turn(s), cost ${record.CostUsd ?? 0:0.0000}");

        await emit(new { type = "done", sessionId, cost = record.CostUsd });
    }

    /// <summary>
    /// Reads token usage (input/output/cache-read/cache-creation), cost, turn
    /// count, stop reason, and model from the terminal result event into the
    /// monitoring record.
    /// </summary>
    private static void CaptureUsageAndMeta(JsonElement root, CallRecord record)
    {
        if (root.TryGetProperty("usage", out var usage) && usage.ValueKind == JsonValueKind.Object)
        {
            record.InputTokens = ReadLong(usage, "input_tokens");
            record.OutputTokens = ReadLong(usage, "output_tokens");
            record.CacheReadTokens = ReadLong(usage, "cache_read_input_tokens");
            record.CacheCreationTokens = ReadLong(usage, "cache_creation_input_tokens");
        }

        if (root.TryGetProperty("total_cost_usd", out var cp) && cp.ValueKind == JsonValueKind.Number)
            record.CostUsd = cp.GetDouble();

        if (root.TryGetProperty("num_turns", out var ntp) && ntp.ValueKind == JsonValueKind.Number)
            record.NumTurns = ntp.GetInt32();

        if (root.TryGetProperty("stop_reason", out var srp) && srp.ValueKind == JsonValueKind.String)
            record.StopReason = srp.GetString();

        // Model may also appear at the result level on some CLI versions.
        if (string.IsNullOrEmpty(record.Model) &&
            root.TryGetProperty("model", out var mp) && mp.ValueKind == JsonValueKind.String)
            record.Model = mp.GetString();
    }

    private static long ReadLong(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number
            ? p.GetInt64() : 0;

    // --- process setup ----------------------------------------------------

    /// <summary>
    /// Resolved once per process. The CLI's launcher differs per install: the
    /// native installer puts a real <c>claude.exe</c> on PATH, the npm global
    /// install puts a <c>claude.cmd</c> shim on PATH (wrapping a real exe under
    /// <c>node_modules</c>).
    ///
    /// We deliberately resolve to a REAL <c>claude.exe</c> and avoid the
    /// <c>.cmd</c> shim: launching a <c>.cmd</c> from .NET routes the command
    /// line through <c>cmd.exe</c>, which ENDS the command at the first newline,
    /// so a multiline <c>-p "&lt;prompt&gt;"</c> argument is silently truncated
    /// after its first line. A real <c>.exe</c> receives its arguments verbatim
    /// (<c>CreateProcess</c>/<c>CommandLineToArgvW</c> preserve embedded
    /// newlines), so multiline prompts survive.
    /// </summary>
    private static readonly Lazy<string> ClaudeCommand = new(ResolveClaudeCommand);

    private static string ResolveClaudeCommand()
    {
        if (!OperatingSystem.IsWindows()) return "claude";

        var dirs = (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries);

        string? cmdFallback = null;
        foreach (var dir in dirs)
        {
            var d = dir.Trim();
            try
            {
                // a) native installer: a real claude.exe directly on PATH.
                var exe = Path.Combine(d, "claude.exe");
                if (File.Exists(exe)) return exe;

                // b) npm global install: shims sit on PATH, the real exe lives
                //    under node_modules -- resolve straight to it so we never
                //    launch the newline-truncating .cmd shim.
                var npmExe = Path.Combine(d, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
                if (File.Exists(npmExe)) return npmExe;

                // c) remember the .cmd shim ONLY as a last resort (multiline
                //    prompts will truncate -- see the field doc above).
                if (cmdFallback is null)
                {
                    var cmd = Path.Combine(d, "claude.cmd");
                    if (File.Exists(cmd)) cmdFallback = cmd;
                }
            }
            catch { /* malformed PATH entry -- skip */ }
        }

        return cmdFallback ?? "claude.cmd";
    }

    private static ProcessStartInfo CreateProcessInfo(string message, string? sessionId, string? workingDirectory, string? model = null, bool readOnly = false)
    {
        var psi = new ProcessStartInfo
        {
            FileName = ClaudeCommand.Value,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = System.Text.Encoding.UTF8,
        };

        // Order matters per the Verified CLI Contract: --resume before -p.
        if (!string.IsNullOrWhiteSpace(sessionId))
        {
            psi.ArgumentList.Add("--resume");
            psi.ArgumentList.Add(sessionId);
        }

        psi.ArgumentList.Add("-p");
        psi.ArgumentList.Add(message);
        psi.ArgumentList.Add("--output-format");
        psi.ArgumentList.Add("stream-json");
        psi.ArgumentList.Add("--include-partial-messages");
        psi.ArgumentList.Add("--verbose");

        if (!string.IsNullOrWhiteSpace(model))
        {
            psi.ArgumentList.Add("--model");
            psi.ArgumentList.Add(model);
        }

        // Permission scope. Two lanes only (the per-project preset system was removed —
        // openspec add-resilient-auth — so a user past both gates is fully trusted,
        // bounded only by the OS account the harness runs as):
        //
        //   - read-only "ask" lane (plans/repo-ask-chat.md): plan mode lets the agent
        //     read/search/answer but structurally blocks every mutation (headless -p
        //     can't approve ExitPlanMode, so Write/Edit/Bash never execute). A tool the
        //     user opts into, not a restriction imposed on them.
        //   - builder lane: FULL access. We must pass --dangerously-skip-permissions,
        //     not just omit a flag: with no flag, `claude -p` uses its DEFAULT mode,
        //     which needs interactive approval for Write/Bash — and headless -p can't
        //     approve, so writes silently FAIL while reads work. Skipping the permission
        //     checks is exactly "bounded only by the OS account" (run the harness under a
        //     dedicated least-privilege account to size that boundary; see README).
        if (readOnly)
        {
            psi.ArgumentList.Add("--permission-mode");
            psi.ArgumentList.Add("plan");
        }
        else
        {
            psi.ArgumentList.Add("--dangerously-skip-permissions");
        }

        // Force Max-plan / CLI auth -- never pick up an API key from the env.
        psi.EnvironmentVariables.Remove("ANTHROPIC_API_KEY");

        if (!string.IsNullOrEmpty(workingDirectory) && Directory.Exists(workingDirectory))
            psi.WorkingDirectory = workingDirectory;

        return psi;
    }

    private static string Short(string id) => id.Length > 12 ? id[..12] + "..." : id;
}
