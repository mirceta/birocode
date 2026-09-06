using System.Diagnostics;
using System.Text.Json;
using ClaudeWeb.Services.Logging;
using Microsoft.Extensions.Configuration;

namespace ClaudeWeb.Services.Chat;

/// <summary>
/// The OpenAI Codex CLI adapter (openspec provider-agnostic-runner, proven
/// against codex-cli 0.153.4 in openspec codex-real-run): drives
/// <c>codex exec --json</c> headless and translates its JSONL event stream
/// (thread.started / turn.started / item.* / turn.completed / turn.failed /
/// error) onto the same stable SSE contract the Claude adapter emits, so the
/// dock, the transcript store, the loops and the board see an identical turn
/// shape.
///
/// Lane mapping: builder → <c>--dangerously-bypass-approvals-and-sandbox</c>
/// (the same "bounded only by the OS account" contract as Claude's
/// --dangerously-skip-permissions); ask → <c>-c sandbox_mode="read-only"</c>
/// (the config override, because <c>codex exec resume</c> has no --sandbox
/// flag while <c>-c</c> is accepted on both subcommands).
/// Resume: <c>codex exec resume &lt;threadId&gt;</c> — the thread id doubles as
/// the harness session id. MCP: the per-repo injected config JSON becomes
/// <c>-c mcp_servers.&lt;name&gt;.…</c> overrides — stdio servers as
/// command/args/env, url servers as url + bearer_token_env_var with the bearer
/// token handed over in the child's environment (never on argv). Stdin is
/// redirected and closed by the runner: Codex otherwise reads "additional
/// input" from an inherited stdin and appends it to the prompt.
///
/// Credentials stay with the Codex CLI itself (<c>codex login</c>, which the
/// harness can drive from the dashboard's Codex chip — see
/// CodexCredentialsService — or OPENAI_API_KEY in the harness's environment);
/// the adapter stores nothing and passes the environment through untouched.
///
/// Structural tool denials (the arch's fence) have no Codex equivalent, so a
/// spec carrying DisallowedTools is REFUSED — management agents on Codex are
/// deferred rather than silently unfenced. Unknown event types are logged and
/// skipped: a Codex schema drift degrades to a quieter transcript, never a crash.
/// Real streams interleave transient <c>{"type":"error"}</c> notices
/// ("Reconnecting... 2/5", "Falling back from WebSockets to HTTPS") — those
/// never fail the turn; only <c>turn.failed</c> is terminal.
/// </summary>
public class CodexCliAdapter : IAgentCliAdapter
{
    private readonly Logger _logger;
    private readonly string? _pathOverride;

    public CodexCliAdapter(Logger logger, IConfiguration? config = null)
    {
        _logger = logger;
        _pathOverride = config?["Providers:Codex:Path"];
    }

    public string Provider => AgentProviders.Codex;
    public string CliLabel => "Codex CLI";

    private static readonly Lazy<string> CodexCommand = new(() => CliExeResolver.Resolve(
        "codex", Path.Combine("node_modules", "@openai", "codex", "bin", "codex.exe")));

    private string Command => string.IsNullOrWhiteSpace(_pathOverride) ? CodexCommand.Value : _pathOverride;

    /// <summary>The read-only lane as a config override — the one spelling that
    /// works for both <c>codex exec</c> and <c>codex exec resume</c>.</summary>
    public const string ReadOnlyOverride = "sandbox_mode=\"read-only\"";

    public string DisplayCommand(TurnSpec spec)
    {
        var promptDisplay = spec.Message.Replace("\r", " ").Replace("\n", " ");
        if (promptDisplay.Length > 80) promptDisplay = promptDisplay[..80] + "...";

        var parts = new List<string> { "codex", "exec" };
        if (!string.IsNullOrWhiteSpace(spec.SessionId)) { parts.Add("resume"); parts.Add(spec.SessionId); }
        parts.Add("--json");
        parts.Add(spec.ReadOnly ? $"-c {ReadOnlyOverride}" : "--dangerously-bypass-approvals-and-sandbox");
        parts.Add($"\"{promptDisplay}\"");
        return string.Join(" ", parts);
    }

    public ProcessStartInfo CreateProcessInfo(TurnSpec spec)
    {
        // The arch's structural fence (--disallowedTools) has no Codex
        // equivalent; running without it would drop the only guarantee that a
        // management agent cannot edit repos. Refuse instead of degrade.
        if (spec.DisallowedTools is { Count: > 0 })
            throw new NotSupportedException("Management agents (structural tool denials) are not supported on the codex provider yet; use claude.");

        var psi = new ProcessStartInfo
        {
            FileName = Command,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            // Codex reads "additional input" from a piped stdin and appends it to
            // the prompt as a <stdin> block; the runner closes the redirected
            // stream right after start so the prompt is exactly the argv one.
            RedirectStandardInput = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = System.Text.Encoding.UTF8,
        };

        psi.ArgumentList.Add("exec");
        if (!string.IsNullOrWhiteSpace(spec.SessionId))
        {
            psi.ArgumentList.Add("resume");
            psi.ArgumentList.Add(spec.SessionId);
        }
        psi.ArgumentList.Add("--json");
        // The repo is always a git repo, but a brand-new folder may not be yet;
        // the harness (not codex) is the boundary here, same as with Claude.
        psi.ArgumentList.Add("--skip-git-repo-check");

        if (spec.ReadOnly)
        {
            psi.ArgumentList.Add("-c");
            psi.ArgumentList.Add(ReadOnlyOverride);
        }
        else
        {
            psi.ArgumentList.Add("--dangerously-bypass-approvals-and-sandbox");
        }

        if (!string.IsNullOrWhiteSpace(spec.Model))
        {
            psi.ArgumentList.Add("--model");
            psi.ArgumentList.Add(spec.Model);
        }

        var env = new Dictionary<string, string>();
        foreach (var over in McpOverrides(spec.McpConfigJson, env))
        {
            psi.ArgumentList.Add("-c");
            psi.ArgumentList.Add(over);
        }
        // Bearer tokens for url MCP servers travel in the child's environment
        // (Codex reads them by name via bearer_token_env_var) — never on argv.
        foreach (var (k, v) in env) psi.Environment[k] = v;

        // Prompt LAST — positional argument of `codex exec` / `codex exec resume`.
        psi.ArgumentList.Add(spec.Message);

        if (!string.IsNullOrEmpty(spec.WorkingDirectory) && Directory.Exists(spec.WorkingDirectory))
            psi.WorkingDirectory = spec.WorkingDirectory;

        return psi;
    }

    /// <summary>Translates the harness's injected MCP config (the same JSON the
    /// Claude adapter passes as --mcp-config) into codex <c>-c</c> config
    /// overrides. Stdio servers: <c>mcp_servers.&lt;name&gt;.command / .args / .env</c>.
    /// Url (streamable-http) servers: <c>mcp_servers.&lt;name&gt;.url</c> plus, for an
    /// <c>Authorization: Bearer …</c> header, <c>.bearer_token_env_var</c> naming
    /// <c>CLAUDEWEB_MCP_&lt;NAME&gt;_TOKEN</c>, whose value is added to
    /// <paramref name="env"/> for the child's environment. These are the exact
    /// keys <c>codex mcp add</c> writes to config.toml (codex-cli 0.153.4).</summary>
    public IReadOnlyList<string> McpOverrides(string? mcpConfigJson, IDictionary<string, string>? env = null)
    {
        var result = new List<string>();
        if (string.IsNullOrWhiteSpace(mcpConfigJson)) return result;
        try
        {
            using var doc = JsonDocument.Parse(mcpConfigJson);
            if (!doc.RootElement.TryGetProperty("mcpServers", out var servers) || servers.ValueKind != JsonValueKind.Object)
                return result;
            foreach (var server in servers.EnumerateObject())
            {
                var name = new string(server.Name.Select(c => char.IsLetterOrDigit(c) ? c : '_').ToArray());
                var v = server.Value;
                if (v.TryGetProperty("command", out var cmd) && cmd.ValueKind == JsonValueKind.String)
                {
                    result.Add($"mcp_servers.{name}.command={Toml(cmd.GetString() ?? "")}");
                    if (v.TryGetProperty("args", out var args) && args.ValueKind == JsonValueKind.Array)
                    {
                        var items = args.EnumerateArray()
                            .Where(a => a.ValueKind == JsonValueKind.String)
                            .Select(a => Toml(a.GetString() ?? ""));
                        result.Add($"mcp_servers.{name}.args=[{string.Join(",", items)}]");
                    }
                    if (v.TryGetProperty("env", out var envObj) && envObj.ValueKind == JsonValueKind.Object)
                    {
                        var pairs = envObj.EnumerateObject()
                            .Where(p => p.Value.ValueKind == JsonValueKind.String)
                            .Select(p => $"{p.Name}={Toml(p.Value.GetString() ?? "")}");
                        result.Add($"mcp_servers.{name}.env={{{string.Join(",", pairs)}}}");
                    }
                    continue;
                }

                if (v.TryGetProperty("url", out var url) && url.ValueKind == JsonValueKind.String)
                {
                    result.Add($"mcp_servers.{name}.url={Toml(url.GetString() ?? "")}");
                    if (v.TryGetProperty("headers", out var headers) && headers.ValueKind == JsonValueKind.Object)
                    {
                        foreach (var h in headers.EnumerateObject())
                        {
                            var value = h.Value.ValueKind == JsonValueKind.String ? h.Value.GetString() ?? "" : "";
                            if (h.Name.Equals("Authorization", StringComparison.OrdinalIgnoreCase) &&
                                value.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
                            {
                                var varName = $"CLAUDEWEB_MCP_{name.ToUpperInvariant()}_TOKEN";
                                result.Add($"mcp_servers.{name}.bearer_token_env_var={Toml(varName)}");
                                if (env is not null) env[varName] = value["Bearer ".Length..].Trim();
                            }
                            else
                            {
                                // Codex has no per-header override we have verified; a
                                // non-bearer header is dropped loudly rather than mangled.
                                _logger.Info($"[CODEX] MCP server \"{server.Name}\": header {h.Name} not translated (only Authorization: Bearer is)");
                            }
                        }
                    }
                    continue;
                }

                _logger.Info($"[CODEX] MCP server \"{server.Name}\" skipped (neither command nor url)");
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[CODEX] MCP config not translated: {ex.Message}");
        }
        return result;
    }

    /// <summary>A TOML string value for a -c override: literal (single-quoted)
    /// when possible — Windows paths stay readable — else basic with escapes.</summary>
    private static string Toml(string s) =>
        !s.Contains('\'') && !s.Any(char.IsControl)
            ? $"'{s}'"
            : $"\"{s.Replace("\\", "\\\\").Replace("\"", "\\\"")}\"";

    // --- codex exec --json -> stable SSE translation -----------------------

    public async Task TranslateLineAsync(string line, TurnSink sink)
    {
        JsonDocument doc;
        try { doc = JsonDocument.Parse(line); }
        catch
        {
            _logger.Info($"[CODEX] (non-JSON) {line}");
            return;
        }

        using (doc)
        {
            var root = doc.RootElement;
            var type = root.TryGetProperty("type", out var tp) ? tp.GetString() ?? "" : "";
            switch (type)
            {
                case "thread.started":
                    await HandleThreadStarted(root, sink);
                    break;
                case "item.started":
                case "item.updated":
                case "item.completed":
                    await HandleItem(root, sink, completed: type == "item.completed", started: type == "item.started");
                    break;
                case "turn.completed":
                    await HandleTurnCompleted(root, sink);
                    break;
                case "turn.failed":
                    await HandleFailure(root, sink);
                    break;
                case "error":
                    // Real streams carry these as transport notices ("Reconnecting...
                    // 2/5 (unexpected status 401 ...)") BEFORE the turn either
                    // recovers or ends in turn.failed. Never terminal by themselves;
                    // remembered so a non-zero exit without turn.failed still reads
                    // the last real message rather than a bare exit code.
                    Notice(root.TryGetProperty("message", out var nm) ? nm.GetString() : null, sink);
                    break;
                case "turn.started":
                    break; // framing only
                default:
                    _logger.Info($"[CODEX] (unhandled event) {type}");
                    break;
            }
        }
    }

    private void Notice(string? message, TurnSink sink)
    {
        message = string.IsNullOrWhiteSpace(message) ? "Codex CLI notice" : message.Trim();
        sink.LastNotice = message;
        _logger.Info($"[CODEX] notice: {TurnText.Truncate(message, 300)}");
    }

    private async Task HandleThreadStarted(JsonElement root, TurnSink sink)
    {
        var id = root.TryGetProperty("thread_id", out var tid) ? tid.GetString() : null;
        if (string.IsNullOrEmpty(id)) return;
        sink.Record.SessionId = id;
        sink.OnSessionId(id);
        sink.Update(sink.Record);
        _logger.Info($"[CODEX] Thread id {TurnText.Short(id)} (sent to client)");
        await sink.Emit(new { type = "session", sessionId = id });
    }

    private async Task HandleItem(JsonElement root, TurnSink sink, bool completed, bool started)
    {
        if (!root.TryGetProperty("item", out var item) || item.ValueKind != JsonValueKind.Object) return;
        // codex-cli 0.153.4 emits item.type; item_type is kept for older/newer spellings.
        var itemType = item.TryGetProperty("type", out var itp) ? itp.GetString()
            : item.TryGetProperty("item_type", out var itp2) ? itp2.GetString() : null;
        var id = item.TryGetProperty("id", out var ip) ? ip.GetString() ?? "" : "";
        string Text(string key) => item.TryGetProperty(key, out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() ?? "" : "";

        switch (itemType)
        {
            case "agent_message":
                // exec mode has no token deltas — the completed item carries the
                // whole answer; emit it as one token event into the same bubble.
                if (completed)
                {
                    var text = Text("text");
                    if (text.Length > 0)
                    {
                        if (!sink.Record.FirstTokenAt.HasValue) { sink.Record.FirstTokenAt = DateTime.Now; sink.Update(sink.Record); }
                        sink.Record.Output.Append(text);
                        await sink.Emit(new { type = "token", text });
                    }
                }
                break;

            case "reasoning":
                if (completed)
                {
                    var text = Text("text");
                    await sink.Emit(string.IsNullOrEmpty(text) ? new { type = "thinking" } : (object)new { type = "thinking", text });
                }
                break;

            case "command_execution":
            {
                var command = Text("command");
                if (started)
                {
                    _logger.Info($"[CODEX] Tool: shell");
                    TurnText.AddTool(sink, "shell");
                    await sink.Emit(new { type = "tool", id, name = "shell", status = "start" });
                    await sink.Emit(new { type = "tool", id, name = "shell", status = "input", summary = TurnText.Truncate(command.Replace("\r", " ").Replace("\n", " "), 140), detail = TurnText.Truncate(command, 1200) });
                    if (sink.Audit != null && sink.LogTool != null) sink.LogTool(sink.Audit, "shell", TurnText.Truncate(command, 140));
                }
                else if (completed)
                {
                    var exit = item.TryGetProperty("exit_code", out var ec) && ec.ValueKind == JsonValueKind.Number ? ec.GetInt32() : 0;
                    var output = Text("aggregated_output");
                    await sink.Emit(new { type = "tool", id, status = "end", ok = exit == 0, preview = TurnText.Truncate(output, 800, maxLines: 15) });
                }
                break;
            }

            case "file_change":
            {
                if (completed)
                {
                    var status = Text("status");
                    var summary = item.TryGetProperty("changes", out var ch) && ch.ValueKind == JsonValueKind.Array
                        ? string.Join(", ", ch.EnumerateArray().Select(c => c.TryGetProperty("path", out var p) ? p.GetString() : null).Where(p => p is not null))
                        : "";
                    TurnText.AddTool(sink, "apply_patch");
                    await sink.Emit(new { type = "tool", id, name = "apply_patch", status = "input", summary = TurnText.Truncate(summary, 140), detail = "" });
                    await sink.Emit(new { type = "tool", id, status = "end", ok = status != "failed", preview = summary });
                    if (sink.Audit != null && sink.LogTool != null) sink.LogTool(sink.Audit, "apply_patch", TurnText.Truncate(summary, 140));
                }
                break;
            }

            case "mcp_tool_call":
            {
                var name = $"{Text("server")}.{Text("tool")}".Trim('.');
                if (name.Length == 0) name = "mcp";
                if (started)
                {
                    _logger.Info($"[CODEX] Tool: {name}");
                    TurnText.AddTool(sink, name);
                    await sink.Emit(new { type = "tool", id, name, status = "start" });
                    if (sink.Audit != null && sink.LogTool != null) sink.LogTool(sink.Audit, name, "");
                }
                else if (completed)
                {
                    var status = Text("status");
                    await sink.Emit(new { type = "tool", id, status = "end", ok = status != "failed", preview = "" });
                }
                break;
            }

            case "web_search":
                if (completed)
                {
                    TurnText.AddTool(sink, "web_search");
                    await sink.Emit(new { type = "tool", id, name = "web_search", status = "input", summary = TurnText.Truncate(Text("query"), 140), detail = "" });
                    await sink.Emit(new { type = "tool", id, status = "end", ok = true, preview = "" });
                }
                break;

            case "error":
                // Real shape: item.completed {item:{id:"item_0",type:"error",message:"Falling
                // back from WebSockets to HTTPS transport ..."}} — a notice, not the verdict.
                if (completed) Notice(Text("message"), sink);
                break;

            // todo_list / others: no user-visible mapping yet.
        }
    }

    private async Task HandleTurnCompleted(JsonElement root, TurnSink sink)
    {
        var record = sink.Record;
        if (root.TryGetProperty("usage", out var usage) && usage.ValueKind == JsonValueKind.Object)
        {
            record.InputTokens = TurnText.ReadLong(usage, "input_tokens");
            record.CacheReadTokens = TurnText.ReadLong(usage, "cached_input_tokens");
            record.OutputTokens = TurnText.ReadLong(usage, "output_tokens");
            var contextTokens = record.InputTokens + record.CacheReadTokens;
            if (contextTokens > 0) await sink.Emit(new { type = "usage", contextTokens });
        }
        // Codex reports tokens, not USD — CostUsd stays null by design.
        sink.Update(record);
        _logger.Info($"[CODEX] Done: thread {TurnText.Short(record.SessionId ?? "?")}");
        await sink.Emit(new { type = "done", sessionId = record.SessionId, cost = record.CostUsd });
    }

    private async Task HandleFailure(JsonElement root, TurnSink sink)
    {
        // Real shape: {"type":"turn.failed","error":{"message":"unexpected status 401 ..."}}
        var msg = root.TryGetProperty("error", out var err) && err.ValueKind == JsonValueKind.Object &&
                  err.TryGetProperty("message", out var m) ? m.GetString()
            : root.TryGetProperty("message", out var m2) ? m2.GetString()
            : null;
        msg = string.IsNullOrWhiteSpace(msg) ? (sink.LastNotice ?? "Codex CLI reported an error") : msg;
        sink.OnError();
        sink.Record.ErrorMessage ??= msg;
        sink.Update(sink.Record);
        _logger.Error($"[CODEX] {msg}");
        await sink.Emit(new { type = "error", message = msg });
    }
}
