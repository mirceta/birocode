using System.Text.Json;

namespace ClaudeWeb.Services.Chat;

/// <summary>Native rollout discovery and conversion at the transcript boundary.
/// Never edits a CLI's files. The existing incremental caches consume normalized rows.</summary>
public static class NativeTranscripts
{
    private static readonly object Gate = new();
    private static string? _home;
    private static DateTime _scanned;
    private static readonly Dictionary<string, (string Path, string Cwd)> Index = new(StringComparer.Ordinal);
    private static readonly HashSet<string> IndexedPaths = new(StringComparer.OrdinalIgnoreCase);

    public static IReadOnlyList<(string Id, string Path)> CodexFiles(string cwd, bool refresh = false)
    {
        lock (Gate)
        {
            var home = Accounts.CodexAccountService.CodexHome();
            if (refresh || home != _home || DateTime.UtcNow - _scanned > TimeSpan.FromSeconds(3))
            {
                if (home != _home) { Index.Clear(); IndexedPaths.Clear(); }
                _home = home;
                var dir = System.IO.Path.Combine(home, "sessions");
                if (Directory.Exists(dir))
                    foreach (var path in Directory.EnumerateFiles(dir, "*.jsonl", SearchOption.AllDirectories))
                    {
                        if (IndexedPaths.Contains(path)) continue;
                        try
                        {
                            using var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete);
                            using var reader = new StreamReader(stream);
                            var line = reader.ReadLine();
                            if (line is null) continue;
                            using var doc = JsonDocument.Parse(line);
                            var r = doc.RootElement;
                            if (Str(r, "type") != "session_meta" || !r.TryGetProperty("payload", out var p)) continue;
                            var id = Str(p, "id");
                            var work = Str(p, "cwd");
                            if (id.Length > 0 && work.Length > 0) { Index[id] = (path, work); IndexedPaths.Add(path); }
                        }
                        catch (IOException) { }
                        catch (JsonException) { }
                    }
                _scanned = DateTime.UtcNow;
            }
            return Index.Where(p => SamePath(p.Value.Cwd, cwd) && File.Exists(p.Value.Path))
                .Select(p => (p.Key, p.Value.Path)).ToList();
        }
    }

    public static bool SamePath(string a, string b) => string.Equals(
        System.IO.Path.TrimEndingDirectorySeparator(System.IO.Path.GetFullPath(a)),
        System.IO.Path.TrimEndingDirectorySeparator(System.IO.Path.GetFullPath(b)), StringComparison.OrdinalIgnoreCase);

    public static string? Find(string cwd, string id) => CodexFiles(cwd).FirstOrDefault(p => p.Id == id).Path
        ?? CodexFiles(cwd, refresh: true).FirstOrDefault(p => p.Id == id).Path;

    internal static string Str(JsonElement r, string key) => r.ValueKind == JsonValueKind.Object && r.TryGetProperty(key, out var p)
        && p.ValueKind == JsonValueKind.String ? p.GetString() ?? "" : "";

    internal static void Feed(JsonElement root, Action<JsonElement> consume)
    {
        var type = Str(root, "type");
        if (type is not ("session_meta" or "event_msg" or "response_item")) { consume(root); return; }
        if (!root.TryGetProperty("payload", out var p)) return;
        var ts = Str(root, "timestamp");
        object? row = null;
        if (type == "session_meta") row = new { type = "system", sessionId = Str(p, "id"), timestamp = ts };
        else if (type == "response_item")
        {
            var kind = Str(p, "type");
            if (kind == "message")
            {
                // response_item is the canonical persisted message; older CLIs also
                // write event_msg copies. Reading both duplicates every turn.
                var role = Str(p, "role");
                if (role is not ("user" or "assistant") || !p.TryGetProperty("content", out var blocks)) return;
                var text = blocks.ValueKind == JsonValueKind.String ? blocks.GetString() ?? "" :
                    blocks.ValueKind == JsonValueKind.Array ? string.Join("\n\n", blocks.EnumerateArray()
                        .Where(b => Str(b, "type") is "input_text" or "output_text" or "text").Select(b => Str(b, "text"))) : "";
                if (role == "user" && (text.StartsWith("# AGENTS.md instructions") || text.StartsWith("<environment_context>") ||
                    text.StartsWith("<recommended_plugins>") || text.StartsWith("<environment_info>") || text.StartsWith("<permissions instructions>"))) return;
                row = new { type = role, timestamp = ts, message = new { content = text } };
            }
            else if (kind is "function_call" or "custom_tool_call")
            {
                var raw = Str(p, kind == "function_call" ? "arguments" : "input");
                object input;
                try { input = JsonSerializer.Deserialize<JsonElement>(raw); }
                catch (JsonException) { input = new { text = raw }; }
                row = new { type = "assistant", timestamp = ts, message = new { content = new[] {
                    new { type = "tool_use", id = Str(p, "call_id"), name = Str(p, "name"), input } } } };
            }
            else if (kind is "function_call_output" or "custom_tool_call_output")
            {
                var output = p.TryGetProperty("output", out var o) ? (o.ValueKind == JsonValueKind.String ? o.GetString() : o.GetRawText()) : "";
                row = new { type = "user", timestamp = ts, message = new { content = new[] {
                    new { type = "tool_result", tool_use_id = Str(p, "call_id"), content = output,
                        is_error = ToolFailed(p, output) } } } };
            }
        }
        if (row != null) consume(JsonSerializer.SerializeToElement(row));
    }

    private static bool ToolFailed(JsonElement payload, string? output)
    {
        if (payload.TryGetProperty("is_error", out var error) && error.ValueKind == JsonValueKind.True) return true;
        if (string.IsNullOrWhiteSpace(output)) return false;
        try
        {
            using var doc = JsonDocument.Parse(output);
            var result = doc.RootElement;
            if (result.ValueKind == JsonValueKind.Object)
            {
                if (result.TryGetProperty("isError", out error) && error.ValueKind == JsonValueKind.True) return true;
                if (result.TryGetProperty("exit_code", out var code) && code.ValueKind == JsonValueKind.Number && code.TryGetInt32(out var exit)) return exit != 0;
            }
        }
        catch (JsonException) { }
        var match = System.Text.RegularExpressions.Regex.Match(output, @"(?:Process exited with code|Exit code:)\s*(-?\d+)");
        return match.Success && int.TryParse(match.Groups[1].Value, out var status) && status != 0;
    }
}
