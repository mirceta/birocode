using ClaudeWeb.Services.Chat;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// Pure shapes behind the arch conversation's two reads (openspec arch-chat-tool-calls-history):
/// <list type="bullet">
/// <item><see cref="AttachToolCalls"/> — the transcript endpoint strips tool blocks, so the chat
/// lost every tool call the moment a turn's live steps were replaced by the reloaded text. The
/// durable tool-call history (per user turn) is folded back onto the assistant message that
/// answered that turn, in the SAME step shape the live stream renders (kind, name, status, ok,
/// summary, detail = input, preview = result, startedAt), so a finished turn keeps showing what
/// it called.</item>
/// <item><see cref="LimitRecent{T}"/> — the History lane used to fetch every call of the
/// conversation at once and froze the app on long ones; the default is now the most recent
/// <see cref="DefaultHistoryLimit"/>, with the total and a truncated flag so the lane can offer
/// "load more / load all" while its filters stay as they were.</item>
/// </list>
/// </summary>
public static class ArchTranscriptViews
{
    public const int DefaultHistoryLimit = 50;
    public const int StepInputChars = 1200;
    public const int StepPreviewChars = 800;

    /// <summary>A persisted tool call in the live step's shape.</summary>
    public sealed record ToolStep(string Kind, string Id, string Name, string Tool, string Status, bool? Ok, string Summary, string Detail, string Preview, long? StartedAt, long? DurationMs);

    /// <summary>A transcript message as the chat renders it: the message plus, on the assistant
    /// message that answered a turn, that turn's tool calls.</summary>
    public sealed record MessageView(string Role, string Text, DateTime? Timestamp, bool Synthetic, string? Actor, IReadOnlyList<ToolStep>? ToolCalls);

    private const string ArchPrefix = "mcp__arch__";

    public static ToolStep StepOf(ToolCallRecord r)
    {
        var tool = r.Name.StartsWith(ArchPrefix, StringComparison.Ordinal) ? r.Name[ArchPrefix.Length..] : r.Name;
        var status = r.Ok == false ? "error" : "done";
        var input = r.Input?.ToJsonString() ?? "";
        long? at = r.At is { } a ? new DateTimeOffset(DateTime.SpecifyKind(a, DateTimeKind.Utc)).ToUnixTimeMilliseconds() : null;
        long? dur = r.At is { } s && r.ResultAt is { } e ? Math.Max(0, (long)(e - s).TotalMilliseconds) : null;
        return new ToolStep("tool", r.Id, r.Name, tool, status, r.Ok, r.Summary ?? "", Clip(input, StepInputChars), Clip(r.Result ?? "", StepPreviewChars), at, dur);
    }

    private static string Clip(string s, int max) => s.Length <= max ? s : s[..max] + "…";

    /// <summary>Fold the tool calls onto the messages: turn k (the k-th non-synthetic user message
    /// that carries visible text, counting from 1) belongs to the first assistant message after
    /// it; calls of turn 0 (before any user message) go to the first assistant message. Messages
    /// keep their order and count; only assistant messages ever carry tool calls.</summary>
    public static List<MessageView> AttachToolCalls(IReadOnlyList<ChatMessage> messages, IReadOnlyList<ToolCallRecord> records)
    {
        var byTurn = records.GroupBy(r => r.Turn).ToDictionary(g => g.Key, g => g.Select(StepOf).ToList());
        var views = new List<MessageView>(messages.Count);
        var turn = 0;
        var pending = byTurn.TryGetValue(0, out var zero) ? zero : null;   // calls before the first user message
        foreach (var m in messages)
        {
            if (m.Role == "user" && !m.Synthetic && !string.IsNullOrWhiteSpace(m.Text))
            {
                turn++;
                pending = byTurn.TryGetValue(turn, out var calls) ? calls : null;
                views.Add(new MessageView(m.Role, m.Text, m.Timestamp, m.Synthetic, m.Actor, null));
                continue;
            }
            if (m.Role == "assistant" && pending is { Count: > 0 })
            {
                views.Add(new MessageView(m.Role, m.Text, m.Timestamp, m.Synthetic, m.Actor, pending));
                pending = null;
                continue;
            }
            views.Add(new MessageView(m.Role, m.Text, m.Timestamp, m.Synthetic, m.Actor, null));
        }
        return views;
    }

    /// <summary>The most recent <paramref name="limit"/> records (null or ≤ 0 = all), with the
    /// total and whether anything was left out.</summary>
    public static (List<T> Items, int Total, bool Truncated) LimitRecent<T>(IReadOnlyList<T> records, int? limit)
    {
        var total = records.Count;
        if (limit is null || limit.Value <= 0 || limit.Value >= total) return (records.ToList(), total, false);
        return (records.Skip(total - limit.Value).ToList(), total, true);
    }
}
