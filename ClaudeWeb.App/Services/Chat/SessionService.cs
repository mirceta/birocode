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

/// <summary>One human-visible message in a transcript: role is "user" or "assistant".</summary>
public record ChatMessage(string Role, string Text);

/// <summary>
/// Lists and parses Claude Code session transcripts (JSONL) for the current
/// working directory. Claude stores them under
/// <c>~/.claude/projects/&lt;encoded-cwd&gt;/&lt;session-id&gt;.jsonl</c> where the
/// encoded cwd replaces ':' '\' '/' with '-'.
///
/// JSONL parsing follows ConversationStore.ExtractMetadata in ClaudeMonitor:
/// pull the sessionId, first user prompt, turn counts and timestamps from the
/// transcript lines. Read <see cref="AppConfig.WorkingDirectory"/> per call so
/// the operator can change it at runtime.
/// </summary>
public class SessionService
{
    private readonly AppConfig _config;
    private readonly Logger _logger;

    public SessionService(AppConfig config, Logger logger)
    {
        _config = config;
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
    public List<SessionSummary> ListSessions()
    {
        var dir = ProjectsDirectoryFor(_config.WorkingDirectory);
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
    public List<ChatMessage> GetMessages(string sessionId)
    {
        var messages = new List<ChatMessage>();
        if (string.IsNullOrWhiteSpace(sessionId)) return messages;

        // sessionId is a UUID file name; reject anything that could escape the folder.
        if (sessionId.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0) return messages;

        var path = Path.Combine(ProjectsDirectoryFor(_config.WorkingDirectory), sessionId + ".jsonl");
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

                messages.Add(new ChatMessage(type == "user" ? "user" : "assistant", text!.Trim()));
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[CHAT] Failed to read transcript {sessionId}: {ex.Message}");
        }

        return messages;
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
