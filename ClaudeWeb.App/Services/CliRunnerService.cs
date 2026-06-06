using System.Diagnostics;
using System.Text.Json;
using ClaudeWeb.Models;

namespace ClaudeWeb.Services;

/// <summary>
/// Spawns the Claude Code CLI, parses its <c>stream-json</c> stdout line by
/// line, and translates the raw CLI events into the small, stable SSE contract
/// the frontend (M5) consumes. The frontend never sees raw CLI internals.
///
/// Stable SSE event shapes (one JSON object per SSE "data:" line):
///   {"type":"session","sessionId":"..."}        from system/init
///   {"type":"token","text":"Hel"}               from text_delta
///   {"type":"thinking"}                          from thinking content/delta
///   {"type":"tool","name":"Write","status":"start"} from tool_use blocks
///   {"type":"done","sessionId":"...","cost":0.04}   from result
///   {"type":"error","message":"..."}             from result.is_error / throttle / failures
///
/// Spawn command (Verified CLI Contract, claude v2.1.92):
///   claude -p "&lt;message&gt;" --output-format stream-json --include-partial-messages --verbose
///   (+ "--resume &lt;sessionId&gt;" before -p when continuing a session)
///
/// Only one CLI process may run at a time -- concurrent requests are rejected
/// (see <see cref="TryBeginRun"/>). The working directory is read per-request
/// from <see cref="AppConfig.WorkingDirectory"/>, never cached.
/// </summary>
public class CliRunnerService
{
    private readonly AppConfig _config;
    private readonly Logger _logger;

    // Single-flight gate: 1 = free, 0 = a CLI process is running.
    private int _busy;

    public CliRunnerService(AppConfig config, Logger logger)
    {
        _config = config;
        _logger = logger;
    }

    /// <summary>True while a CLI process is in flight.</summary>
    public bool IsBusy => Volatile.Read(ref _busy) != 0;

    /// <summary>
    /// Atomically claim the single CLI slot. Returns false if a run is already
    /// in progress, in which case the caller must reject the request.
    /// </summary>
    public bool TryBeginRun() => Interlocked.CompareExchange(ref _busy, 1, 0) == 0;

    private void EndRun() => Volatile.Write(ref _busy, 0);

    /// <summary>
    /// Runs one chat turn. Invokes <paramref name="emit"/> for every translated
    /// stable SSE event as it arrives. Caller is responsible for calling
    /// <see cref="TryBeginRun"/> first; this method always releases the slot.
    /// </summary>
    /// <param name="message">The user's prompt.</param>
    /// <param name="sessionId">When non-empty, resumes that session.</param>
    /// <param name="emit">Async sink that writes one stable SSE event to the client.</param>
    public async Task RunAsync(
        string message,
        string? sessionId,
        Func<object, Task> emit,
        CancellationToken ct = default)
    {
        var workingDirectory = _config.WorkingDirectory; // read per-request, never cache
        var resuming = !string.IsNullOrWhiteSpace(sessionId);

        try
        {
            var psi = CreateProcessInfo(message, sessionId, workingDirectory);
            _logger.Info(resuming
                ? $"[CLI] Resuming session {Short(sessionId!)} in {workingDirectory}"
                : $"[CLI] Starting new session in {workingDirectory}");

            using var process = new Process { StartInfo = psi };
            process.Start();

            string? capturedSessionId = null;
            var sawError = false;

            var reader = process.StandardOutput;
            while (!reader.EndOfStream)
            {
                ct.ThrowIfCancellationRequested();
                var line = await reader.ReadLineAsync(ct);
                if (string.IsNullOrWhiteSpace(line)) continue;

                await TranslateLine(line, emit,
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
                await emit(new { type = "error", message = detail });
            }
            else if (!string.IsNullOrWhiteSpace(stderr))
            {
                _logger.Info($"[CLI] stderr: {stderr.Trim()}");
            }

            _logger.Info($"[CLI] Process finished (session {Short(capturedSessionId ?? sessionId ?? "?")})");
        }
        catch (OperationCanceledException)
        {
            _logger.Info("[CLI] Run cancelled (client disconnected).");
        }
        catch (Exception ex)
        {
            _logger.Error($"[CLI] Run failed: {ex.Message}");
            try { await emit(new { type = "error", message = ex.Message }); } catch { }
        }
        finally
        {
            EndRun();
        }
    }

    // --- stream-json -> stable SSE translation ----------------------------

    /// <summary>
    /// Parses one stream-json line and emits zero or more stable SSE events.
    /// Non-JSON lines are logged and ignored so a stray banner never crashes
    /// the stream.
    /// </summary>
    private async Task TranslateLine(
        string line, Func<object, Task> emit,
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
                    await HandleSystem(root, emit, onSessionId);
                    break;
                case "stream_event":
                    await HandleStreamEvent(root, emit);
                    break;
                case "assistant":
                    await HandleAssistant(root, emit);
                    break;
                case "rate_limit_event":
                    await HandleRateLimit(root, emit, onError);
                    break;
                case "result":
                    await HandleResult(root, emit, onError);
                    break;
                // "user" (tool_result echoes) and "message_*" are intentionally
                // not surfaced to the client -- internal CLI bookkeeping.
            }
        }
    }

    /// <summary>system/init carries the session id immediately -- forward it now.</summary>
    private async Task HandleSystem(JsonElement root, Func<object, Task> emit, Action<string> onSessionId)
    {
        var subtype = root.TryGetProperty("subtype", out var sp) ? sp.GetString() : null;
        if (subtype == "init" && root.TryGetProperty("session_id", out var sidProp))
        {
            var sid = sidProp.GetString();
            if (!string.IsNullOrEmpty(sid))
            {
                onSessionId(sid);
                _logger.Info($"[CHAT] Session id {Short(sid)} (sent to client)");
                await emit(new { type = "session", sessionId = sid });
            }
        }
    }

    /// <summary>
    /// Token-level streaming. We forward visible text deltas as "token" events
    /// and reduce thinking deltas to a content-free "thinking" signal so the
    /// chain-of-thought never leaks into the chat bubble.
    /// </summary>
    private async Task HandleStreamEvent(JsonElement root, Func<object, Task> emit)
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
                        _logger.Info($"[CHAT] Tool: {name}");
                        await emit(new { type = "tool", name, status = "start" });
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
                            await emit(new { type = "token", text });
                    }
                    else if (dType == "thinking_delta")
                    {
                        // Don't forward the reasoning text -- just the state.
                        await emit(new { type = "thinking" });
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
    private async Task HandleAssistant(JsonElement root, Func<object, Task> emit)
    {
        if (!root.TryGetProperty("message", out var msg) ||
            !msg.TryGetProperty("content", out var content) ||
            content.ValueKind != JsonValueKind.Array)
            return;

        foreach (var block in content.EnumerateArray())
        {
            var bt = block.TryGetProperty("type", out var btp) ? btp.GetString() : "";
            if (bt == "tool_use")
            {
                var name = block.TryGetProperty("name", out var np) ? np.GetString() ?? "tool" : "tool";
                _logger.Info($"[CHAT] Tool: {name}");
                await emit(new { type = "tool", name, status = "start" });
            }
        }
    }

    /// <summary>Surface a throttle warning when the CLI reports a non-allowed status.</summary>
    private async Task HandleRateLimit(JsonElement root, Func<object, Task> emit, Action onError)
    {
        var status = root.TryGetProperty("rate_limit_info", out var info) &&
                     info.TryGetProperty("status", out var sp)
            ? sp.GetString() ?? ""
            : "";

        if (status != "" && status != "allowed")
        {
            onError();
            _logger.Error($"[CLI] Rate limit: {status}");
            await emit(new { type = "error", message = $"Rate limited (status: {status})" });
        }
    }

    /// <summary>Terminal event. Emits "done" on success or "error" on failure.</summary>
    private async Task HandleResult(JsonElement root, Func<object, Task> emit, Action onError)
    {
        var sessionId = root.TryGetProperty("session_id", out var sidProp) ? sidProp.GetString() : null;
        var isError = root.TryGetProperty("is_error", out var iep) &&
                      iep.ValueKind == JsonValueKind.True;

        if (isError)
        {
            onError();
            var resultText = root.TryGetProperty("result", out var rp) ? rp.GetString() ?? "" : "";
            var subtype = root.TryGetProperty("subtype", out var stp) ? stp.GetString() ?? "" : "";
            var msg = !string.IsNullOrWhiteSpace(resultText) ? resultText
                    : !string.IsNullOrWhiteSpace(subtype) ? subtype
                    : "Claude CLI reported an error";
            _logger.Error($"[CLI] Result error: {msg}");
            await emit(new { type = "error", message = msg });
            return;
        }

        double? cost = root.TryGetProperty("total_cost_usd", out var cp) &&
                       cp.ValueKind == JsonValueKind.Number
            ? cp.GetDouble()
            : null;

        var turns = root.TryGetProperty("num_turns", out var ntp) && ntp.ValueKind == JsonValueKind.Number
            ? ntp.GetInt32() : 0;
        _logger.Info($"[CLI] Done: session {Short(sessionId ?? "?")}, {turns} turn(s), cost ${cost ?? 0:0.0000}");

        await emit(new { type = "done", sessionId, cost });
    }

    // --- process setup ----------------------------------------------------

    private static ProcessStartInfo CreateProcessInfo(string message, string? sessionId, string? workingDirectory)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "claude",
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

        // Force Max-plan / CLI auth -- never pick up an API key from the env.
        psi.EnvironmentVariables.Remove("ANTHROPIC_API_KEY");

        if (!string.IsNullOrEmpty(workingDirectory) && Directory.Exists(workingDirectory))
            psi.WorkingDirectory = workingDirectory;

        return psi;
    }

    private static string Short(string id) => id.Length > 12 ? id[..12] + "..." : id;
}
