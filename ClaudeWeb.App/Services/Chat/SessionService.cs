using System.Text.Json;
using System.Text.RegularExpressions;
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
/// <para><c>Synthetic</c> marks an assistant line the CLI fabricated rather than the
/// model spoke — <c>message.model == "&lt;synthetic&gt;"</c>, e.g. the "No response
/// requested." repair a resume writes over a dangling user turn. Not an agent
/// reply: the autopilot loops skip these (openspec: fix-loop-verify-stale-reply).</para>
// Actor (openspec: add-arch-agent): who authored a USER message — null for a
// human, "loop" for an autopilot send, "arch" for an arch-agent send, "wake" for
// the harness's wake prompt in the arch conversation. Restored on reload from the
// audit log (MessageActors); the CLI transcript itself carries no such field.
public record ChatMessage(string Role, string Text, DateTime? Timestamp = null, bool Synthetic = false, string? Actor = null);

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
/// One tool call of a conversation at full fidelity, for a history view that a
/// human reads (openspec: add-arch-tool-history). Unlike <see cref="ToolCall"/>
/// (a step-shaped row with clipped input/output), this keeps the complete parsed
/// input, the result text up to a generous budget (flagged when clipped), the
/// result's own timestamp, and which user turn the call belongs to (1-based;
/// 0 = before any prompt) with that turn's prompt text so calls can be grouped
/// under the message that caused them.
/// </summary>
public record ToolCallRecord(
    string Id,
    string Name,
    string Summary,
    System.Text.Json.Nodes.JsonNode? Input,
    bool? Ok,
    string Result,
    bool ResultClipped,
    int ResultChars,
    DateTime? At,
    DateTime? ResultAt,
    int Turn,
    string TurnPrompt,
    DateTime? TurnAt);

/// <summary>The dashboard's per-dock liveness digest of a session (openspec:
/// reduce-transcript-io, D2): the newest assistant line (whitespace-collapsed,
/// clipped), the newest user timestamp and the message count — computed from
/// the cached transcript instead of shipping the whole transcript.</summary>
public record SessionActivity(string Activity, DateTime? LastUserAt, int Count);

/// <summary>
/// Lists and parses Claude Code session transcripts (JSONL) for the current
/// working directory. Claude stores them under
/// <c>~/.claude/projects/&lt;encoded-cwd&gt;/&lt;session-id&gt;.jsonl</c> where the
/// encoded cwd replaces every non-alphanumeric character with '-'.
///
/// JSONL parsing follows ConversationStore.ExtractMetadata in ClaudeMonitor:
/// pull the sessionId, first user prompt, turn counts and timestamps from the
/// transcript lines. The working directory is supplied per call by the
/// controller (resolved from the selected repository), so sessions are scoped
/// to the repo they were created in.
///
/// Reads are incremental and cached (openspec: reduce-transcript-io): each
/// transcript is parsed once and then only its appended tail, so the 5 s
/// pollers that used to re-read a 250 MB file every tick now cost a stat.
/// </summary>
public class SessionService
{
    private const int DefaultMaxResultChars = 16000;
    private const int ActivityMaxChars = 500;

    private readonly Logger _logger;
    private readonly TranscriptCache<MessagesAcc> _messages;
    private readonly TranscriptCache<ToolCallsAcc> _toolCalls;
    private readonly TranscriptCache<ToolHistoryAcc> _toolHistory;
    private readonly TranscriptCache<MetadataAcc> _metadata;
    private readonly object _summaryGate = new();
    private readonly Dictionary<string, (long Length, DateTime LastWriteUtc, SessionSummary? Summary)> _summaries =
        new(StringComparer.OrdinalIgnoreCase);

    public SessionService(Logger logger)
    {
        _logger = logger;
        _messages = new TranscriptCache<MessagesAcc>(() => new MessagesAcc(), (a, r) => a.Feed(r), logger: logger);
        _toolCalls = new TranscriptCache<ToolCallsAcc>(() => new ToolCallsAcc(), (a, r) => a.Feed(r), logger: logger);
        _toolHistory = new TranscriptCache<ToolHistoryAcc>(() => new ToolHistoryAcc(DefaultMaxResultChars), (a, r) => a.Feed(r), capacity: 8, logger: logger);
        _metadata = new TranscriptCache<MetadataAcc>(() => new MetadataAcc(), (a, r) => a.Feed(r), capacity: 1, logger: logger);
    }

    /// <summary>Parse passes (full or delta) the message cache has run — diagnostics/tests.</summary>
    public long MessageParses => _messages.Parses;

    /// <summary>Transcript bytes the message cache has read from disk — diagnostics/tests.</summary>
    public long MessageBytesRead => _messages.BytesRead;

    /// <summary>
    /// Encodes a working directory the way the Claude CLI does for its project
    /// folder name: replace every character that is not an ASCII letter or digit
    /// with '-' (so ':', '\', '/', '_', '.', spaces, etc. all collapse to '-',
    /// one '-' per character — runs are not coalesced). Example:
    /// <c>c:\Users\km\my_proj</c> -> <c>c--Users-km-my-proj</c>.
    /// Matching the CLI exactly matters: any path with '_'/'.'/space (e.g. a
    /// worktree under <c>prg_worktrees</c>) would otherwise point at a folder
    /// the CLI never created, so the repo's transcripts would read as empty.
    /// </summary>
    public static string EncodeCwd(string workingDirectory) =>
        Regex.Replace(workingDirectory, "[^A-Za-z0-9]", "-");

    /// <summary>Absolute path to the project's session folder for the given cwd.</summary>
    public static string ProjectsDirectoryFor(string workingDirectory)
    {
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        return Path.Combine(home, ".claude", "projects", EncodeCwd(workingDirectory));
    }

    /// <summary>Absolute transcript path for a session, or null when the id could
    /// escape the folder (it must be a plain UUID file name).</summary>
    private static string? TranscriptPath(string workingDir, string sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return null;
        if (sessionId.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0) return null;
        return Path.Combine(ProjectsDirectoryFor(workingDir), sessionId + ".jsonl");
    }

    /// <summary>
    /// Lists every session transcript for the current working directory,
    /// newest first. Returns an empty list when the project folder does not
    /// exist yet (no sessions started here). A transcript whose length and
    /// last-write time are unchanged since the last listing is not re-read.
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
    /// A malformed line (e.g. crash-padding NULs) is skipped, never fatal — one bad
    /// line must not freeze the rendered conversation at that point.
    /// Returns an empty list if the transcript is missing.
    /// </summary>
    public List<ChatMessage> GetMessages(string workingDir, string sessionId)
    {
        var path = TranscriptPath(workingDir, sessionId);
        if (path is null) return [];
        try
        {
            var list = _messages.Read(path, acc => acc.Messages.ToList());
            if (list is null) _logger.Info($"[CHAT] Transcript not found: {path}");
            return list ?? [];
        }
        catch (Exception ex)
        {
            _logger.Error($"[CHAT] Failed to read transcript {sessionId}: {ex.Message}");
            return [];
        }
    }

    /// <summary>Same as <see cref="GetMessages"/> but parses the file once from
    /// the start without entering the cache — for scans over many historical
    /// transcripts (autopilot mining) that must not evict the hot set.</summary>
    public List<ChatMessage> ReadMessagesUncached(string workingDir, string sessionId)
    {
        var path = TranscriptPath(workingDir, sessionId);
        if (path is null) return [];
        try { return _messages.ReadUncached(path)?.Messages ?? []; }
        catch (Exception ex)
        {
            _logger.Error($"[CHAT] Failed to read transcript {sessionId}: {ex.Message}");
            return [];
        }
    }

    /// <summary>The dashboard digest of a session (see <see cref="SessionActivity"/>),
    /// scanned from the end of the cached transcript under its lock — no copy of
    /// the message list. Null when the transcript is missing.</summary>
    public SessionActivity? GetActivity(string workingDir, string sessionId)
    {
        var path = TranscriptPath(workingDir, sessionId);
        if (path is null) return null;
        try
        {
            return _messages.Read(path, acc =>
            {
                var msgs = acc.Messages;
                var activity = "";
                DateTime? lastUserAt = null;
                for (var i = msgs.Count - 1; i >= 0; i--)
                {
                    var m = msgs[i];
                    if (activity.Length == 0 && m.Role == "assistant" && m.Text.Length > 0) activity = OneLine(m.Text);
                    if (lastUserAt is null && m.Role == "user" && m.Timestamp is not null) lastUserAt = m.Timestamp;
                    if (activity.Length > 0 && lastUserAt is not null) break;
                }
                // Newest message of any role when the agent has not spoken yet
                // (a just-sent prompt) — what the dashboard showed before.
                if (activity.Length == 0 && msgs.Count > 0) activity = OneLine(msgs[^1].Text);
                return new SessionActivity(activity, lastUserAt, msgs.Count);
            });
        }
        catch (Exception ex)
        {
            _logger.Error($"[CHAT] Failed to read activity for {sessionId}: {ex.Message}");
            return null;
        }
    }

    private static string OneLine(string text)
    {
        var s = Regex.Replace(text, @"\s+", " ").Trim();
        return s.Length > ActivityMaxChars ? s[..ActivityMaxChars] : s;
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
        var path = TranscriptPath(workingDir, sessionId);
        if (path is null) return [];
        try
        {
            var list = _toolCalls.Read(path, acc => acc.Calls.ToList());
            if (list is null) _logger.Info($"[CHAT] Transcript not found: {path}");
            return list ?? [];
        }
        catch (Exception ex)
        {
            _logger.Error($"[CHAT] Failed to read tool calls for {sessionId}: {ex.Message}");
            return [];
        }
    }

    /// <summary>
    /// The tool-call history of a session at full fidelity (openspec:
    /// add-arch-tool-history): every <c>tool_use</c> with its complete input,
    /// paired with its <c>tool_result</c> (text up to <paramref name="maxResultChars"/>,
    /// clipped flag when longer), both timestamps, and the user turn it belongs to.
    /// A turn starts at a user line that carries visible text and no tool_result
    /// block. Same resilience rules as <see cref="GetToolCalls"/>: a malformed line
    /// is skipped, a call without a result keeps <c>Ok = null</c>. A non-default
    /// result budget bypasses the cache.
    /// </summary>
    public List<ToolCallRecord> GetToolCallHistory(string workingDir, string sessionId, int maxResultChars = DefaultMaxResultChars)
    {
        var path = TranscriptPath(workingDir, sessionId);
        if (path is null) return [];
        try
        {
            if (maxResultChars != DefaultMaxResultChars)
            {
                var once = new TranscriptCache<ToolHistoryAcc>(() => new ToolHistoryAcc(maxResultChars), (a, r) => a.Feed(r), capacity: 1, logger: _logger);
                return once.ReadUncached(path)?.Calls ?? [];
            }
            var list = _toolHistory.Read(path, acc => acc.Calls.ToList());
            if (list is null) _logger.Info($"[CHAT] Transcript not found: {path}");
            return list ?? [];
        }
        catch (Exception ex)
        {
            _logger.Error($"[CHAT] Failed to read tool history for {sessionId}: {ex.Message}");
            return [];
        }
    }

    /// <summary>Pulls the text of a tool_result whose content may be a plain string
    /// or an array of typed blocks. Mirrors CliRunnerService.ExtractToolResultText.</summary>
    internal static string ExtractToolResultText(JsonElement block)
    {
        if (!block.TryGetProperty("content", out var content)) return "";
        if (content.ValueKind == JsonValueKind.String) return content.GetString() ?? "";
        if (content.ValueKind == JsonValueKind.Array)
        {
            // Text blocks carry the answer; anything else (a tool_reference from
            // ToolSearch, an image, an unknown block) is still shown, in words or
            // as its raw JSON, so no call ever reads as "empty result" while the
            // transcript has something.
            var parts = new List<string>();
            foreach (var b in content.EnumerateArray())
            {
                var type = b.TryGetProperty("type", out var t) ? t.GetString() : null;
                if (type == "text" && b.TryGetProperty("text", out var tx)) parts.Add(tx.GetString() ?? "");
                else if (type == "tool_reference" && b.TryGetProperty("tool_name", out var tn)) parts.Add("tool: " + (tn.GetString() ?? ""));
                else if (type == "image") parts.Add("[image]");
                else parts.Add(b.GetRawText());
            }
            return string.Join("\n", parts);
        }
        return content.ValueKind == JsonValueKind.Null || content.ValueKind == JsonValueKind.Undefined ? "" : content.GetRawText();
    }

    /// <summary>One-line, human-readable summary of a tool call's input. Kept in
    /// sync with CliRunnerService.ToolSummary so the reconstructed history reads
    /// exactly like the live stream.</summary>
    internal static string ToolSummary(string name, JsonElement input)
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
    internal static string Truncate(string? text, int maxChars, int maxLines = 0)
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
    internal static string? ExtractVisibleText(JsonElement msg)
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
    /// Cached by (length, last-write time): an unchanged transcript is not re-read.
    /// </summary>
    private SessionSummary? ExtractMetadata(string jsonlPath)
    {
        try
        {
            var fi = new FileInfo(jsonlPath);
            if (!fi.Exists) return null;
            lock (_summaryGate)
            {
                if (_summaries.TryGetValue(jsonlPath, out var hit)
                    && hit.Length == fi.Length && hit.LastWriteUtc == fi.LastWriteTimeUtc)
                    return hit.Summary;
            }

            var acc = _metadata.ReadUncached(jsonlPath);
            if (acc is null) return null;

            // Fall back to the filename (the CLI names files after the session id).
            var sessionId = acc.SessionId ?? Path.GetFileNameWithoutExtension(jsonlPath);
            SessionSummary? summary = null;
            if (!string.IsNullOrEmpty(sessionId))
            {
                var title = !string.IsNullOrWhiteSpace(acc.FirstPrompt)
                    ? Truncate(acc.FirstPrompt!, 60)
                    : Path.GetFileNameWithoutExtension(jsonlPath);

                summary = new SessionSummary(
                    Id: sessionId,
                    Title: title,
                    TurnCount: acc.UserTurns + acc.AssistantTurns,
                    LastModified: acc.LastTimestamp?.ToLocalTime() ?? fi.LastWriteTime,
                    FirstPrompt: acc.FirstPrompt);
            }

            lock (_summaryGate) _summaries[jsonlPath] = (fi.Length, fi.LastWriteTimeUtc, summary);
            return summary;
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
    internal static string? ExtractFirstPrompt(JsonElement root)
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
