namespace ClaudeWeb.Services.Chat;

/// <summary>
/// The server half of the transcript window (openspec arch-chat-window): a caller that
/// renders only the recent tail of a long conversation asks for <c>?tail=N</c> and gets
/// the last N messages plus the thread's total, so its "Show earlier (hidden)" count is
/// exact and the poll payload stays small however long the thread grows. No tail (or a
/// non-positive one) means the whole thread, exactly as before.
/// </summary>
public static class TranscriptWindow
{
    public static (List<T> Items, int Total) Tail<T>(IEnumerable<T> all, int? tail)
    {
        var list = all as IList<T> ?? all.ToList();
        var total = list.Count;
        if (tail is null || tail.Value <= 0 || tail.Value >= total) return (list.ToList(), total);
        return (list.Skip(total - tail.Value).ToList(), total);
    }
}
