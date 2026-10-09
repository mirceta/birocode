using System.Text.Json;
using ClaudeWeb.Services.Events;

namespace ClaudeWeb.Services.Remote;

/// <summary>One remote command (openspec sofa-mode): the phone's <c>{ type, args }</c> — the
/// same shape the living-room daljinski remote uses — under a harness-wide sequence number.</summary>
public sealed record RemoteCommand(int Seq, long At, string Type, JsonElement? Args, string From);

/// <summary>A harness tab (or an embedding host's WebView2) that is currently acting as a big
/// screen: what it shows, last heard from when.</summary>
public sealed record RemoteScreen(string Id, string Name, string Url, string? ActiveAgent, string? View, long SeenAt, string? Layout = null);

/// <summary>
/// The sofa-mode command channel (openspec sofa-mode, design D1): a short in-memory ring of
/// the commands a phone posted, read by watermark by whichever harness tab is listening as
/// the big screen, plus the heartbeats of those screens so the phone can say "projector is
/// showing: …" or "no screen is listening". In-memory only, like <see cref="HarnessEventFeed"/>:
/// a restart simply starts empty — a command is a request to the screen NOW, never a record.
///
/// A fresh listener reads with <c>after = -1</c> and gets no commands, only the current
/// seq: stale commands must never replay into a tab that was not there when they were sent.
/// </summary>
public class RemoteCommandStore
{
    private const int Cap = 100;
    public static readonly TimeSpan ScreenTtl = TimeSpan.FromSeconds(20);

    /// <summary>The command types the dispatch table on the client knows (design D2).</summary>
    // layout { mode: sofa | normal } and push-app { app } are sofa view (the dock's ⤢ + split 30 / 70).
    public static readonly string[] Types = { "open-agent", "open-view", "scroll", "zoom", "lane", "stop", "layout", "push-app" };

    private readonly object _lock = new();
    private readonly List<RemoteCommand> _ring = new();
    private readonly Dictionary<string, RemoteScreen> _screens = new(StringComparer.Ordinal);
    private readonly HarnessEventFeed _feed;
    private readonly Func<long> _now;
    private int _seq;

    public RemoteCommandStore(HarnessEventFeed feed) : this(feed, () => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()) { }

    internal RemoteCommandStore(HarnessEventFeed feed, Func<long> now)
    {
        _feed = feed;
        _now = now;
    }

    public static bool IsKnownType(string? type) =>
        !string.IsNullOrWhiteSpace(type) && Array.IndexOf(Types, type.Trim().ToLowerInvariant()) >= 0;

    /// <summary>Append a command under the next seq and publish it as <c>remote.command</c>.</summary>
    public RemoteCommand Post(string type, JsonElement? args, string from)
    {
        RemoteCommand cmd;
        lock (_lock)
        {
            cmd = new RemoteCommand(++_seq, _now(), type.Trim().ToLowerInvariant(), args, from);
            _ring.Add(cmd);
            if (_ring.Count > Cap) _ring.RemoveRange(0, _ring.Count - Cap);
        }
        _feed.Publish("remote.command", source: new { from }, data: new { seq = cmd.Seq, type = cmd.Type, args = cmd.Args });
        return cmd;
    }

    /// <summary>The commands newer than <paramref name="after"/> plus the current seq. A negative
    /// <paramref name="after"/> (a listener that just started) returns no commands — only the seq
    /// to continue from.</summary>
    public (IReadOnlyList<RemoteCommand> Commands, int Seq) Read(int after)
    {
        lock (_lock)
        {
            if (after < 0) return (Array.Empty<RemoteCommand>(), _seq);
            return (_ring.Where(c => c.Seq > after).ToList(), _seq);
        }
    }

    /// <summary>A screen says what it shows; silence for <see cref="ScreenTtl"/> drops it.</summary>
    public IReadOnlyList<RemoteScreen> Heartbeat(string id, string? name, string? url, string? activeAgent, string? view, string? layout = null)
    {
        lock (_lock)
        {
            _screens[id] = new RemoteScreen(id, string.IsNullOrWhiteSpace(name) ? id : name.Trim(), url ?? "", Blank(activeAgent), Blank(view), _now(), Blank(layout));
            return SnapshotLocked();
        }
    }

    public IReadOnlyList<RemoteScreen> Screens()
    {
        lock (_lock) return SnapshotLocked();
    }

    private IReadOnlyList<RemoteScreen> SnapshotLocked()
    {
        var cutoff = _now() - (long)ScreenTtl.TotalMilliseconds;
        foreach (var dead in _screens.Where(kv => kv.Value.SeenAt < cutoff).Select(kv => kv.Key).ToList()) _screens.Remove(dead);
        return _screens.Values.OrderBy(s => s.Name, StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static string? Blank(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();
}
