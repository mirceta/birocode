using System.Diagnostics;
using System.Text.Json;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Chat;

/// <summary>
/// The Claude Code CLI adapter (openspec provider-agnostic-runner): the
/// pre-existing spawn contract and stream-json translation moved VERBATIM out of
/// <see cref="CliRunnerService"/> — argv order, resume-before -p, permission
/// flags, --mcp-config, --chrome, --disallowedTools last, the ANTHROPIC_API_KEY
/// strip, and the event mapping are all unchanged (golden-asserted in tests).
/// The default provider.
/// </summary>
public class ClaudeCliAdapter : IAgentCliAdapter
{
    private readonly Logger _logger;

    public ClaudeCliAdapter(Logger logger) { _logger = logger; }

    public string Provider => AgentProviders.Claude;
    public string CliLabel => "Claude CLI";

    // --- process setup ----------------------------------------------------

    /// <summary>
    /// Resolved once per process. The CLI's launcher differs per install: the
    /// native installer puts a real <c>claude.exe</c> on PATH, the npm global
    /// install puts a <c>claude.cmd</c> shim on PATH (wrapping a real exe under
    /// <c>node_modules</c>). We resolve to a REAL exe and avoid the .cmd shim:
    /// launching a .cmd routes through cmd.exe, which ends the command at the
    /// first newline, silently truncating multiline prompts.
    /// </summary>
    private static readonly Lazy<string> ClaudeCommand = new(() => CliExeResolver.Resolve(
        "claude", Path.Combine("node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe")));

    /// <summary>The resolved CLI executable, shared with the one-shot autopilot
    /// classifier (fix-suggestion-loop-inert, D5) so both spawn the exact same
    /// binary.</summary>
    public static string ClaudeExecutable => ClaudeCommand.Value;

    public string DisplayCommand(TurnSpec spec)
    {
        var promptDisplay = spec.Message.Replace("\r", " ").Replace("\n", " ");
        if (promptDisplay.Length > 80) promptDisplay = promptDisplay[..80] + "...";

        var parts = new List<string> { "claude" };
        if (!string.IsNullOrWhiteSpace(spec.SessionId))
        {
            parts.Add("--resume");
            parts.Add(spec.SessionId);
        }
        parts.Add("-p");
        parts.Add($"\"{promptDisplay}\"");
        parts.Add("--output-format");
        parts.Add("stream-json");
        parts.Add("--include-partial-messages");
        parts.Add("--verbose");
        if (spec.Browser) parts.Add("--chrome");
        return string.Join(" ", parts);
    }

    public ProcessStartInfo CreateProcessInfo(TurnSpec spec)
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
        if (!string.IsNullOrWhiteSpace(spec.SessionId))
        {
            psi.ArgumentList.Add("--resume");
            psi.ArgumentList.Add(spec.SessionId);
        }

        psi.ArgumentList.Add("-p");
        psi.ArgumentList.Add(spec.Message);
        psi.ArgumentList.Add("--output-format");
        psi.ArgumentList.Add("stream-json");
        psi.ArgumentList.Add("--include-partial-messages");
        psi.ArgumentList.Add("--verbose");

        if (!string.IsNullOrWhiteSpace(spec.Model))
        {
            psi.ArgumentList.Add("--model");
            psi.ArgumentList.Add(spec.Model);
        }

        // Per-repo MCP tools (openspec add-dock-tools-lane): the temp file is
        // written and cleaned up by the lifecycle in CliRunnerService.
        if (!string.IsNullOrWhiteSpace(spec.McpConfigPath))
        {
            psi.ArgumentList.Add("--mcp-config");
            psi.ArgumentList.Add(spec.McpConfigPath);
        }

        // Claude-in-Chrome browser mode (openspec claude-in-chrome): builder lane
        // only, the caller holds the ChromeGateService single-holder gate.
        if (spec.Browser) psi.ArgumentList.Add("--chrome");

        // Permission scope. Two lanes only (openspec add-resilient-auth):
        //   - read-only "ask" lane: plan mode structurally blocks every mutation
        //     (headless -p can't approve ExitPlanMode).
        //   - builder lane: FULL access; --dangerously-skip-permissions because
        //     headless -p can't approve the default mode's prompts.
        if (spec.ReadOnly)
        {
            psi.ArgumentList.Add("--permission-mode");
            psi.ArgumentList.Add("plan");
        }
        else
        {
            psi.ArgumentList.Add("--dangerously-skip-permissions");
        }

        // Structural tool denials (openspec add-arch-agent, D6). Placed LAST —
        // the flag is variadic and would otherwise swallow the arguments after it.
        if (spec.DisallowedTools is { Count: > 0 })
        {
            psi.ArgumentList.Add("--disallowedTools");
            psi.ArgumentList.Add(string.Join(",", spec.DisallowedTools));
        }

        // Force Max-plan / CLI auth -- never pick up an API key from the env.
        psi.EnvironmentVariables.Remove("ANTHROPIC_API_KEY");

        if (!string.IsNullOrEmpty(spec.WorkingDirectory) && Directory.Exists(spec.WorkingDirectory))
            psi.WorkingDirectory = spec.WorkingDirectory;

        return psi;
    }

    // --- stream-json -> stable SSE translation ----------------------------

    public async Task TranslateLineAsync(string line, TurnSink sink)
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
                    await HandleSystem(root, sink);
                    break;
                case "stream_event":
                    await HandleStreamEvent(root, sink);
                    break;
                case "assistant":
                    await HandleAssistant(root, sink);
                    break;
                case "user":
                    await HandleUser(root, sink);
                    break;
                case "rate_limit_event":
                    await HandleRateLimit(root, sink);
                    break;
                case "result":
                    await HandleResult(root, sink);
                    break;
                // "message_*" framing events carry no user-visible content.
            }
        }
    }

    /// <summary>system/init carries the session id immediately -- forward it now.</summary>
    private async Task HandleSystem(JsonElement root, TurnSink sink)
    {
        var subtype = root.TryGetProperty("subtype", out var sp) ? sp.GetString() : null;
        if (subtype != "init") return;

        var record = sink.Record;
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
                sink.OnSessionId(sid);
                _logger.Info($"[CHAT] Session id {TurnText.Short(sid)} (sent to client)");
                await sink.Emit(new { type = "session", sessionId = sid });
            }
        }

        sink.Update(record);
    }

    /// <summary>Token-level streaming: visible text deltas as "token", thinking
    /// deltas as "thinking" so reasoning never lands in the answer bubble.</summary>
    private async Task HandleStreamEvent(JsonElement root, TurnSink sink)
    {
        if (!root.TryGetProperty("event", out var ev)) return;
        var evType = ev.TryGetProperty("type", out var etp) ? etp.GetString() : "";

        switch (evType)
        {
            case "content_block_start":
                if (ev.TryGetProperty("content_block", out var cb))
                {
                    var cbType = cb.TryGetProperty("type", out var cbt) ? cbt.GetString() : "";
                    if (cbType == "tool_use")
                    {
                        var name = cb.TryGetProperty("name", out var np) ? np.GetString() ?? "tool" : "tool";
                        var id = cb.TryGetProperty("id", out var ip) ? ip.GetString() ?? "" : "";
                        _logger.Info($"[CHAT] Tool: {name}");
                        TurnText.AddTool(sink, name);
                        await sink.Emit(new { type = "tool", id, name, status = "start" });
                    }
                    else if (cbType == "thinking")
                    {
                        await sink.Emit(new { type = "thinking" });
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
                            if (!sink.Record.FirstTokenAt.HasValue)
                            {
                                sink.Record.FirstTokenAt = DateTime.Now;
                                sink.Update(sink.Record);
                            }
                            sink.Record.Output.Append(text);
                            await sink.Emit(new { type = "token", text });
                        }
                    }
                    else if (dType == "thinking_delta")
                    {
                        var text = delta.TryGetProperty("thinking", out var th) ? th.GetString() ?? "" : "";
                        await sink.Emit(new { type = "thinking", text });
                    }
                    // signature_delta / input_json_delta -> ignored.
                }
                break;
        }
    }

    /// <summary>Consolidated full turn: surface usage + tool_use blocks (text is
    /// already streamed via deltas).</summary>
    private async Task HandleAssistant(JsonElement root, TurnSink sink)
    {
        if (!root.TryGetProperty("message", out var msg)) return;

        if (msg.TryGetProperty("usage", out var usage) && usage.ValueKind == JsonValueKind.Object)
        {
            var contextTokens = TurnText.ReadLong(usage, "input_tokens")
                + TurnText.ReadLong(usage, "cache_read_input_tokens")
                + TurnText.ReadLong(usage, "cache_creation_input_tokens");
            if (contextTokens > 0)
                await sink.Emit(new { type = "usage", contextTokens });
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
                TurnText.AddTool(sink, name);

                string summary = "", detail = "";
                if (block.TryGetProperty("input", out var input) && input.ValueKind == JsonValueKind.Object)
                {
                    summary = TurnText.ToolSummary(name, input);
                    detail = TurnText.Truncate(input.GetRawText(), 1200);
                }
                await sink.Emit(new { type = "tool", id, name, status = "input", summary, detail });

                // Action audit (openspec add-action-audit): record EVERY tool action.
                if (sink.Audit != null && sink.LogTool != null)
                    sink.LogTool(sink.Audit, name, string.IsNullOrEmpty(summary) ? detail : summary);
            }
        }
    }

    /// <summary>tool_result blocks (echoed as a "user" event) close out tool steps.</summary>
    private static async Task HandleUser(JsonElement root, TurnSink sink)
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
            var preview = TurnText.Truncate(TurnText.ExtractToolResultText(block), 800, maxLines: 15);
            await sink.Emit(new { type = "tool", id, status = "end", ok, preview });
        }
    }

    /// <summary>Surface a throttle warning when the CLI reports a non-allowed status.</summary>
    private async Task HandleRateLimit(JsonElement root, TurnSink sink)
    {
        var status = root.TryGetProperty("rate_limit_info", out var info) &&
                     info.TryGetProperty("status", out var sp)
            ? sp.GetString() ?? ""
            : "";

        if (status != "" && status != "allowed")
        {
            sink.OnError();
            sink.Record.WasThrottled = true;
            sink.Record.ErrorMessage ??= $"Rate limited (status: {status})";
            sink.Update(sink.Record);
            _logger.Error($"[CLI] Rate limit: {status}");
            await sink.Emit(new { type = "error", message = $"Rate limited (status: {status})" });
        }
    }

    /// <summary>Terminal event. Emits "done" on success or "error" on failure.</summary>
    private async Task HandleResult(JsonElement root, TurnSink sink)
    {
        var record = sink.Record;
        var sessionId = root.TryGetProperty("session_id", out var sidProp) ? sidProp.GetString() : null;
        var isError = root.TryGetProperty("is_error", out var iep) &&
                      iep.ValueKind == JsonValueKind.True;

        CaptureUsageAndMeta(root, record);
        if (!string.IsNullOrEmpty(sessionId)) record.SessionId = sessionId;

        if (isError)
        {
            sink.OnError();
            var resultText = root.TryGetProperty("result", out var rp) ? rp.GetString() ?? "" : "";
            var subtype = root.TryGetProperty("subtype", out var stp) ? stp.GetString() ?? "" : "";
            var msg = !string.IsNullOrWhiteSpace(resultText) ? resultText
                    : !string.IsNullOrWhiteSpace(subtype) ? subtype
                    : "Claude CLI reported an error";
            record.ErrorMessage ??= msg;
            sink.Update(record);
            _logger.Error($"[CLI] Result error: {msg}");
            await sink.Emit(new { type = "error", message = msg });
            return;
        }

        sink.Update(record);
        _logger.Info($"[CLI] Done: session {TurnText.Short(sessionId ?? "?")}, {record.NumTurns} turn(s), cost ${record.CostUsd ?? 0:0.0000}");

        await sink.Emit(new { type = "done", sessionId, cost = record.CostUsd });
    }

    /// <summary>Reads token usage, cost, turn count, stop reason, model from the
    /// terminal result event into the monitoring record.</summary>
    private static void CaptureUsageAndMeta(JsonElement root, CallRecord record)
    {
        if (root.TryGetProperty("usage", out var usage) && usage.ValueKind == JsonValueKind.Object)
        {
            record.InputTokens = TurnText.ReadLong(usage, "input_tokens");
            record.OutputTokens = TurnText.ReadLong(usage, "output_tokens");
            record.CacheReadTokens = TurnText.ReadLong(usage, "cache_read_input_tokens");
            record.CacheCreationTokens = TurnText.ReadLong(usage, "cache_creation_input_tokens");
        }

        if (root.TryGetProperty("total_cost_usd", out var cp) && cp.ValueKind == JsonValueKind.Number)
            record.CostUsd = cp.GetDouble();

        if (root.TryGetProperty("num_turns", out var ntp) && ntp.ValueKind == JsonValueKind.Number)
            record.NumTurns = ntp.GetInt32();

        if (root.TryGetProperty("stop_reason", out var srp) && srp.ValueKind == JsonValueKind.String)
            record.StopReason = srp.GetString();

        if (string.IsNullOrEmpty(record.Model) &&
            root.TryGetProperty("model", out var mp) && mp.ValueKind == JsonValueKind.String)
            record.Model = mp.GetString();
    }
}

/// <summary>Text/record helpers shared by the provider adapters.</summary>
public static class TurnText
{
    /// <summary>One-line, human-readable summary of a tool call's input.</summary>
    public static string ToolSummary(string name, JsonElement input)
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

    /// <summary>Pulls the text of a tool_result whose content may be a plain
    /// string or an array of typed blocks.</summary>
    public static string ExtractToolResultText(JsonElement block)
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

    /// <summary>Truncates to a char budget and (optionally) a line budget.</summary>
    public static string Truncate(string? text, int maxChars, int maxLines = 0)
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
    public static void AddTool(TurnSink sink, string name)
    {
        if (sink.Record.Tools.Count == 0 || sink.Record.Tools[^1] != name)
        {
            sink.Record.Tools.Add(name);
            sink.Update(sink.Record);
        }
    }

    public static long ReadLong(JsonElement obj, string name) =>
        obj.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number
            ? p.GetInt64() : 0;

    public static string Short(string id) => id.Length > 12 ? id[..12] + "..." : id;
}

/// <summary>Resolves a CLI's real executable on Windows PATH, preferring a real
/// .exe over the npm .cmd shim (a .cmd routes through cmd.exe, which truncates
/// multiline arguments at the first newline).</summary>
public static class CliExeResolver
{
    public static string Resolve(string baseName, string? npmRelativeExe)
    {
        if (!OperatingSystem.IsWindows()) return baseName;

        var dirs = (Environment.GetEnvironmentVariable("PATH") ?? string.Empty)
            .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries);

        string? cmdFallback = null;
        foreach (var dir in dirs)
        {
            var d = dir.Trim();
            try
            {
                var exe = Path.Combine(d, baseName + ".exe");
                if (File.Exists(exe)) return exe;

                if (npmRelativeExe is not null)
                {
                    var npmExe = Path.Combine(d, npmRelativeExe);
                    if (File.Exists(npmExe)) return npmExe;
                }

                if (cmdFallback is null)
                {
                    var cmd = Path.Combine(d, baseName + ".cmd");
                    if (File.Exists(cmd)) cmdFallback = cmd;
                }
            }
            catch { /* malformed PATH entry -- skip */ }
        }

        return cmdFallback ?? baseName + ".cmd";
    }
}
