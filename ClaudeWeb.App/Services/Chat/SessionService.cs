using System.Text.Json;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Chat;

/// <summary>
/// One session as shown in the sidebar list. Mirrors the GET /api/sessions
/// contract: { id, title, turnCount, lastModified, firstPrompt }.
/// </summary>
public record SessionSummary(
    string Id,
    string Title,
    int TurnCount,
    DateTime LastModified,
    string? FirstPrompt);

/// <summary>One human-visible message in a transcript: role is "user" or "assistant".
/// Timestamp is the JSONL line time (when available) — the dashboard uses the last
/// user message's timestamp to colour an agent dock by recency.</summary>
public record ChatMessage(string Role, string Text, DateTime? Timestamp = null);

/// <summary>
/// One tool call reconstructed from a transcript, in the same shape the live SSE
/// "tool" events carry so the frontend renders both sources uniformly. <c>Ok</c>
/// is null when no matching tool_result was found (still running / truncated).
/// </summary>
public record ToolCall(
    string Id,
    string Name,
    string Summary,
    string Detail,
    bool? Ok,
    string Preview,
    DateTime? Timestamp = null);

/// <summary>
/// Lists and parses Claude Code session transcripts (JSONL) for the current
/// working directory. Claude stores them under
/// <c>~/.claude/projects/&lt;encoded-cwd&gt;/&lt;session-id&gt;.jsonl</c> where the
/// encoded cwd replaces ':' '\' '/' with '-'.
///
/// JSONL parsing follows ConversationStore.ExtractMetadata in ClaudeMonitor:
/// pull the sessionId, first user prompt, turn counts and timestamps from the
/// transcript lines. The working directory is supplied per call by the
/// controller (resolved from the selected repository), so sessions are scoped
/// to the repo they were created in.
/// </summary>
public class SessionService
{
    private readonly Logger _logger;

    public SessionService(Logger logger)
    {
        _logger = logger;
    }

    /// <summary>
    /// Encodes a working directory the way the Claude CLI does for its project
    /// folder name: replace ':', '\' and '/' with '-'. Example:
    /// <c>c:\Users\km\proj</c> -> <c>c--Users-km-proj</c>.
    /// </summary>
    public static string EncodeCwd(string workingDirectory) =>
        workingDirectory.Replace(':', '-').Replace('\\', '-').Replace('/', '-');

    /// <summary>Absolute path to the project's session folder for the given cwd.</summary>
    public static string ProjectsDirectoryFor(string workingDirectory)
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        return Path.Combine(home, ".claude", "projects", EncodeCwd(workingDirectory));
    }

    /// <summary>
    /// Lists every session transcript for the current working directory,
    /// newest first. Returns an empty list when the project folder does not
    /// exist yet (no sessions started here).
    /// </summary>
    public List<SessionSummary> ListSessions(string workingDir)
    {
        var dir = ProjectsDirectoryFor(workingDir);
        if (!Directory.Exists(dir))
        {
            _logger.Info($"[CHAT] No session folder yet for working directory ({dir})");
            return [];
        }

        var sessions = new List<SessionSummary>();
        foreach (var path in Directory.EnumerateFiles(dir, "*.jsonl"))
        {
            var summary = ExtractMetadata(path);
            if (summary != null) sessions.Add(summary);
        }

        return sessions.OrderByDescending(s => s.LastModified).ToList();
    }

    /// <summary>
    /// Reads the full human-visible transcript for one session (user prompts and
    /// assistant text replies, in order). Tool-use steps, model "thinking", and
    /// IDE/system-reminder injections are skipped so it reads like the live chat.
    /// Returns an empty list if the transcript is missing or unreadable.
    /// </summary>
    public List<ChatMessage> GetMessages(string workingDir, string sessionId)
    {
        var messages = new List<ChatMessage>();
        if (string.IsNullOrWhiteSpace(sessionId)) return messages;

        // sessionId is a UUID file name; reject anything that could escape the folder.
        if (sessionId.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0) return messages;

        var path = Path.Combine(ProjectsDirectoryFor(workingDir), sessionId + ".jsonl");
        if (!File.Exists(path))
        {
            _logger.Info($"[CHAT] Transcript not found: {path}");
            return messages;
        }

        try
        {
            foreach (var line in File.ReadLines(path))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;

                using var doc = JsonDocument.Parse(line);
                var root = doc.RootElement;

                if (!root.TryGetProperty("type", out var typeProp)) continue;
                var type = typeProp.GetString();
                if (type != "user" && type != "assistant") continue;
                if (!root.TryGetProperty("message", out var msg)) continue;

                var text = ExtractVisibleText(msg);
                if (string.IsNullOrWhiteSpace(text)) continue;

                DateTime? ts = null;
                if (root.TryGetProperty("timestamp", out var tsProp) &&
                    DateTime.TryParse(tsProp.GetString(), out var parsed))
                    ts = parsed;

                messages.Add(new ChatMessage(type == "user" ? "user" : "assistant", text!.Trim(), ts));
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[CHAT] Failed to read transcript {sessionId}: {ex.Message}");
        }

        return messages;
    }

    /// <summary>
    /// Reconstructs the tool-call history of a session from its JSONL transcript,
    /// in chronological order. <c>tool_use</c> blocks (assistant messages) are
    /// paired with their later <c>tool_result</c> (user messages) by
    /// <c>tool_use_id</c>. This is the durable source the live SSE stream cannot
    /// provide after a reload: the transcript endpoint (GetMessages) strips these
    /// blocks, but they still exist on disk here. Mirrors the live "tool" event
    /// shape (CliRunnerService) so the UI renders both the same way. A malformed
    /// line is skipped, never fatal; a call with no result keeps Ok = null.
    /// </summary>
    public List<ToolCall> GetToolCalls(string workingDir, string sessionId)
    {
        var calls = new List<ToolCall>();
        if (string.IsNullOrWhiteSpace(sessionId)) return calls;

        // sessionId is a UUID file name; reject anything that could escape the folder.
        if (sessionId.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0) return calls;

        var path = Path.Combine(ProjectsDirectoryFor(workingDir), sessionId + ".jsonl");
        if (!File.Exists(path))
        {
            _logger.Info($"[CHAT] Transcript not found: {path}");
            return calls;
        }

        // id -> index into `calls`, so a tool_result can patch its tool_use in place
        // while preserving the order tool calls first appeared.
        var byId = new Dictionary<string, int>();

        try
        {
            foreach (var line in File.ReadLines(path))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;

                JsonDocument doc;
                try { doc = JsonDocument.Parse(line); }
                catch { continue; } // skip a malformed transcript line, keep going
                using (doc)
                {
                    var root = doc.RootElement;
                    if (!root.TryGetProperty("type", out var typeProp)) continue;
                    var type = typeProp.GetString();
                    if (type != "user" && type != "assistant") continue;
                    if (!root.TryGetProperty("message", out var msg) ||
                        !msg.TryGetProperty("content", out var content) ||
                        content.ValueKind != JsonValueKind.Array)
                        continue;

                    DateTime? ts = null;
                    if (root.TryGetProperty("timestamp", out var tsProp) &&
                        DateTime.TryParse(tsProp.GetString(), out var parsed))
                        ts = parsed;

                    foreach (var block in content.EnumerateArray())
                    {
                        var bt = block.TryGetProperty("type", out var btp) ? btp.GetString() : "";
                        if (type == "assistant" && bt == "tool_use")
                        {
                            var id = block.TryGetProperty("id", out var ip) ? ip.GetString() ?? "" : "";
                            if (string.IsNullOrEmpty(id) || byId.ContainsKey(id)) continue;
                            var name = block.TryGetProperty("name", out var np) ? np.GetString() ?? "tool" : "tool";
                            string summary = "", detail = "";
                            if (block.TryGetProperty("input", out var input) && input.ValueKind == JsonValueKind.Object)
                            {
                                summary = ToolSummary(name, input);
                                detail = Truncate(input.GetRawText(), 1200);
                            }
                            byId[id] = calls.Count;
                            calls.Add(new ToolCall(id, name, summary, detail, Ok: null, Preview: "", Timestamp: ts));
                        }
                        else if (type == "user" && bt == "tool_result")
                        {
                            var id = block.TryGetProperty("tool_use_id", out var ip) ? ip.GetString() ?? "" : "";
                            if (string.IsNullOrEmpty(id) || !byId.TryGetValue(id, out var idx)) continue;
                            var ok = !(block.TryGetProperty("is_error", out var ep) && ep.ValueKind == JsonValueKind.True);
                            var preview = Truncate(ExtractToolResultText(block), 800, maxLines: 15);
                            calls[idx] = calls[idx] with { Ok = ok, Preview = preview };
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[CHAT] Failed to read tool calls for {sessionId}: {ex.Message}");
        }

        return calls;
    }

    /// <summary>Pulls the text of a tool_result whose content may be a plain string
    /// or an array of typed blocks. Mirrors CliRunnerService.ExtractToolResultText.</summary>
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

    /// <summary>One-line, human-readable summary of a tool call's input. Kept in
    /// sync with CliRunnerService.ToolSummary so the reconstructed history reads
    /// exactly like the live stream.</summary>
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
    /// an ellipsis when clipped. Mirrors CliRunnerService.Truncate.</summary>
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

    /// <summary>
    /// Concatenates the visible "text" blocks of a message (string content, or an
    /// array of typed blocks). Skips thinking / tool_use / tool_result blocks and
    /// IDE/system-reminder injections so only the human-readable reply remains.
    /// </summary>
    private static string? ExtractVisibleText(JsonElement msg)
    {
        if (!msg.TryGetProperty("content", out var content)) return null;

        if (content.ValueKind == JsonValueKind.String)
            return Clean(content.GetString());

        if (content.ValueKind == JsonValueKind.Array)
        {
            var parts = new List<string>();
            foreach (var block in content.EnumerateArray())
            {
                if (!block.TryGetProperty("type", out var bt) || bt.GetString() != "text") continue;
                if (block.TryGetProperty("text", out var t))
                {
                    var cleaned = Clean(t.GetString());
                    if (cleaned != null) parts.Add(cleaned);
                }
            }
            return parts.Count > 0 ? string.Join("\n\n", parts) : null;
        }

        return null;
    }

    /// <summary>
    /// Reads a single JSONL transcript and derives its summary. Returns null
    /// when the file has no resolvable session id (treated as not-a-session).
    /// </summary>
    private SessionSummary? ExtractMetadata(string jsonlPath)
    {
        try
        {
            string? sessionId = null;
            string? firstPrompt = null;
            DateTime? lastTimestamp = null;
            int userTurns = 0;
            int assistantTurns = 0;

            foreach (var line in File.ReadLines(jsonlPath))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;

                using var doc = JsonDocument.Parse(line);
                var root = doc.RootElement;

                if (!root.TryGetProperty("type", out var typeProp)) continue;
                var type = typeProp.GetString();

                // sessionId appears on the transcript lines (camelCase in JSONL).
                if (sessionId == null && root.TryGetProperty("sessionId", out var sidProp))
                    sessionId = sidProp.GetString();

                if (root.TryGetProperty("timestamp", out var tsProp) &&
                    DateTime.TryParse(tsProp.GetString(), out var ts))
                    lastTimestamp = ts;

                switch (type)
                {
                    case "user":
                        userTurns++;
                        firstPrompt ??= ExtractFirstPrompt(root);
                        break;
                    case "assistant":
                        assistantTurns++;
                        break;
                }
            }

            // Fall back to the filename (the CLI names files after the session id).
            sessionId ??= Path.GetFileNameWithoutExtension(jsonlPath);
            if (string.IsNullOrEmpty(sessionId)) return null;

            var title = !string.IsNullOrWhiteSpace(firstPrompt)
                ? Truncate(firstPrompt!, 60)
                : Path.GetFileNameWithoutExtension(jsonlPath);

            return new SessionSummary(
                Id: sessionId,
                Title: title,
                TurnCount: userTurns + assistantTurns,
                LastModified: lastTimestamp?.ToLocalTime() ?? File.GetLastWriteTime(jsonlPath),
                FirstPrompt: firstPrompt);
        }
        catch (Exception ex)
        {
            _logger.Error($"[CHAT] Failed to parse session {Path.GetFileName(jsonlPath)}: {ex.Message}");
            return null;
        }
    }

    /// <summary>
    /// Pulls the first human-authored text from a "user" transcript line.
    /// Content may be a plain string or an array of typed blocks. IDE context
    /// and system-reminder injections are skipped so the title reads naturally.
    /// </summary>
    private static string? ExtractFirstPrompt(JsonElement root)
    {
        if (!root.TryGetProperty("message", out var msg) ||
            !msg.TryGetProperty("content", out var content))
            return null;

        if (content.ValueKind == JsonValueKind.String)
            return Clean(content.GetString());

        if (content.ValueKind == JsonValueKind.Array)
        {
            foreach (var block in content.EnumerateArray())
            {
                if (block.TryGetProperty("type", out var bt) && bt.GetString() == "text" &&
                    block.TryGetProperty("text", out var textProp))
                {
                    var cleaned = Clean(textProp.GetString());
                    if (cleaned != null) return cleaned;
                }
            }
        }

        return null;
    }

    private static string? Clean(string? text)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        if (text.StartsWith("<ide_") || text.StartsWith("<system-reminder>")) return null;
        return text;
    }

    private static string Truncate(string text, int max) =>
        text.Length > max ? text[..max] + "..." : text;
}
