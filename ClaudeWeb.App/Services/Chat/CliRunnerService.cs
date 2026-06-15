using System.Diagnostics;
using System.Text.Json;
using ClaudeWeb.Models;
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

    public CliRunnerService(Logger logger, CallLog callLog)
    {
        _logger = logger;
        _callLog = callLog;
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
        bool readOnly = false)
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
                    onError: () => sawError = true);
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
        Action<string> onSessionId, Action onError)
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
                    await HandleAssistant(root, emit, record);
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
    private async Task HandleAssistant(JsonElement root, Func<object, Task> emit, CallRecord record)
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
    /// Resolved once per process. The CLI's launcher differs per install:
    /// the npm global install puts a <c>claude.cmd</c> shim on PATH, the
    /// native installer a <c>claude.exe</c> -- so probe PATH for whichever
    /// exists instead of hardcoding one flavor.
    /// </summary>
    private static readonly Lazy<string> ClaudeCommand = new(ResolveClaudeCommand);

    private static string ResolveClaudeCommand()
    {
        if (!OperatingSystem.IsWindows()) return "claude";

        var dirs = (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries);
        foreach (var dir in dirs)
        {
            foreach (var name in new[] { "claude.exe", "claude.cmd" })
            {
                try
                {
                    var candidate = Path.Combine(dir.Trim(), name);
                    if (File.Exists(candidate)) return candidate;
                }
                catch { /* malformed PATH entry -- skip */ }
            }
        }
        return "claude.cmd"; // previous behavior as a last resort
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

        // Read-only "ask" lane (plans/repo-ask-chat.md): plan mode lets the agent
        // read/search/answer but structurally blocks every mutation -- in headless
        // -p mode it can't approve ExitPlanMode, so Write/Edit/Bash never execute.
        // This is what makes a side conversation safe to run in the SAME working
        // directory as a building agent. (Verified against claude v2.1.177.)
        if (readOnly)
        {
            psi.ArgumentList.Add("--permission-mode");
            psi.ArgumentList.Add("plan");
        }

        // Force Max-plan / CLI auth -- never pick up an API key from the env.
        psi.EnvironmentVariables.Remove("ANTHROPIC_API_KEY");

        if (!string.IsNullOrEmpty(workingDirectory) && Directory.Exists(workingDirectory))
            psi.WorkingDirectory = workingDirectory;

        return psi;
    }

    private static string Short(string id) => id.Length > 12 ? id[..12] + "..." : id;
}
