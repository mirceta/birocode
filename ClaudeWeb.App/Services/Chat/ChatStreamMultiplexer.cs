using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Threading.Channels;

namespace ClaudeWeb.Services.Chat;

/// <summary>
/// Merges any number of <see cref="RunSession.StreamAsync"/> enumerables into one
/// envelope stream, so the web UI can attach to every running conversation over a
/// SINGLE connection instead of one per run (openspec reduce-connection-appetite:
/// the browser's 6-per-origin HTTP/1.1 limit made per-run streams wedge the UI).
///
/// Envelope shapes (one JSON object per item):
///   {"repoId":r,"lane":l,"evt":&lt;original event JSON, embedded verbatim&gt;}
///   {"repoId":r,"lane":l,"ctl":"none"}   -- no session for that sub (the 404 analogue)
///   {"repoId":r,"lane":l,"ctl":"end"}    -- that sub's replay+live stream completed
/// The merged stream ends when every pump has completed; cancellation tears all
/// pumps down (subscriber cleanup is StreamAsync's own finally).
/// </summary>
public static class ChatStreamMultiplexer
{
    public sealed record Sub(string RepoId, string Lane, int After);

    public const int MaxSubs = 32;

    public static async IAsyncEnumerable<string> Merge(
        IReadOnlyList<(Sub Sub, RunSession? Session)> subs,
        [EnumeratorCancellation] CancellationToken ct = default)
    {
        var channel = Channel.CreateUnbounded<string>();
        var pumps = new List<Task>();

        foreach (var (sub, session) in subs)
        {
            if (session is null)
            {
                channel.Writer.TryWrite(Envelope(sub, null, "none"));
                continue;
            }
            pumps.Add(Task.Run(async () =>
            {
                try
                {
                    await foreach (var json in session.StreamAsync(sub.After, ct))
                        channel.Writer.TryWrite(Envelope(sub, json, null));
                    channel.Writer.TryWrite(Envelope(sub, null, "end"));
                }
                catch (OperationCanceledException) { /* client detached */ }
            }, CancellationToken.None));
        }

        // Complete the channel once every pump ends (immediately when there are
        // none — the control events above are already buffered).
        _ = Task.WhenAll(pumps).ContinueWith(
            _ => channel.Writer.TryComplete(), TaskScheduler.Default);

        await foreach (var item in channel.Reader.ReadAllAsync(ct))
            yield return item;
    }

    /// <summary>The inner event JSON is embedded verbatim — no re-parse; it keeps
    /// its own seq, which is what the client dedups on.</summary>
    private static string Envelope(Sub sub, string? evtJson, string? ctl)
    {
        var head = $"{{\"repoId\":{JsonSerializer.Serialize(sub.RepoId)},\"lane\":{JsonSerializer.Serialize(sub.Lane)},";
        return ctl is not null
            ? head + $"\"ctl\":{JsonSerializer.Serialize(ctl)}}}"
            : head + "\"evt\":" + evtJson + "}";
    }
}
