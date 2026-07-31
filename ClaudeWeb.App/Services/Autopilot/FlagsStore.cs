using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// The agent-flags ledger (docs/loop-driven-agent-convention.md, "Non-blocking
/// flags"): a driven agent records a complaint, a workaround, or an ambiguity it
/// resolved by guessing as a <c>FLAG: &lt;one short sentence&gt;</c> line in its
/// reply. The engine lifts those lines here, and the web app's footer shows every
/// undismissed flag until the human dismisses it — so a gripe nobody watched live
/// is not forgotten. Deliberately OUTSIDE the loop's decision ladder: a flag never
/// stops, escalates, or re-drives anything (that is <c>NEEDS_HUMAN:</c>'s job).
///
/// Flag text follows the same disclosure precedent as a loop's
/// <c>StopDetail</c> (which shows the NEEDS_HUMAN question verbatim on the
/// ungated dashboard): it is agent-authored text written FOR the human to read
/// later, never operator prompt/config content — so the list endpoint stays
/// session-auth only, not operator-gated.
///
/// Persisted at <c>flags.json</c> under AppPaths.DataDir with the same atomic
/// temp+rename write and never-reseed-on-unreadable load guard as the other
/// autopilot stores.
/// </summary>
public class FlagsStore
{
    /// <summary>Line-start marker, matched case-insensitively on each trimmed
    /// reply line. Line-start (unlike NEEDS_HUMAN's substring match) because a
    /// flag's false-positive direction is noise shown to the human, not safety.</summary>
    public const string FlagMarker = "FLAG:";
    public const int MaxFlagLength = 300;
    public const int MaxFlagsPerReply = 10;
    public const int MaxEntries = 200;
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    public sealed record Flag(
        string Id, string RepoId, string RepoName, string Text, long At,
        string Kind, int Iteration, bool Dismissed, long? DismissedAt);

    private sealed class Store
    {
        public List<Flag> Flags { get; set; } = new();
    }

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Store _store = new();

    /// <summary>Where the ledger lives on disk, for the debug bundle.</summary>
    public string FilePath => _path;

    public FlagsStore(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "flags.json");
        Load();
    }

    /// <summary>The FLAG: lines of one reply, marker stripped: trimmed, bounded,
    /// at most <see cref="MaxFlagsPerReply"/>. A mid-sentence "FLAG:" does not
    /// match — the line itself must start with the marker.</summary>
    public static IReadOnlyList<string> ExtractFlagLines(string reply)
    {
        var found = new List<string>();
        foreach (var raw in reply.Split('\n'))
        {
            if (found.Count >= MaxFlagsPerReply) break;
            var line = raw.Trim();
            if (!line.StartsWith(FlagMarker, StringComparison.OrdinalIgnoreCase)) continue;
            var text = line[FlagMarker.Length..].Trim();
            if (text.Length == 0) continue;
            if (text.Length > MaxFlagLength) text = text[..MaxFlagLength];
            found.Add(text);
        }
        return found;
    }

    /// <summary>Appends one reply's flags. Dedup: a text already OPEN for the same
    /// repo is not re-added (an agent repeating its gripe every iteration would
    /// otherwise fill the footer with copies); dismissing it and flagging again
    /// makes a fresh entry. Overflow beyond <see cref="MaxEntries"/> drops the
    /// oldest dismissed entries first, then the oldest outright.</summary>
    public int Record(string repoId, string repoName, string kind, int iteration,
        IReadOnlyList<string> texts)
    {
        if (texts.Count == 0) return 0;
        lock (_gate)
        {
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var added = 0;
            foreach (var text in texts)
            {
                if (_store.Flags.Any(f => !f.Dismissed && f.RepoId == repoId
                        && string.Equals(f.Text, text, StringComparison.Ordinal)))
                    continue;
                _store.Flags.Add(new Flag(Guid.NewGuid().ToString("N"), repoId, repoName,
                    text, now, kind, iteration, Dismissed: false, DismissedAt: null));
                added++;
            }
            while (_store.Flags.Count > MaxEntries)
            {
                var victim = _store.Flags.FirstOrDefault(f => f.Dismissed) ?? _store.Flags[0];
                _store.Flags.Remove(victim);
            }
            if (added > 0) Save();
            return added;
        }
    }

    /// <summary>Every undismissed flag, newest first — the footer's list.</summary>
    public IReadOnlyList<Flag> Open()
    {
        lock (_gate)
            return _store.Flags.Where(f => !f.Dismissed).OrderByDescending(f => f.At).ToList();
    }

    public bool Dismiss(string id)
    {
        lock (_gate)
        {
            var i = _store.Flags.FindIndex(f => f.Id == id && !f.Dismissed);
            if (i < 0) return false;
            _store.Flags[i] = _store.Flags[i] with
            {
                Dismissed = true,
                DismissedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            };
            Save();
            return true;
        }
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var store = JsonSerializer.Deserialize<Store>(File.ReadAllText(_path));
            if (store is null) return;
            store.Flags ??= new();
            _store = store;
        }
        catch (Exception ex)
        {
            // Unreadable file: defaults in memory, file left ALONE for forensics.
            _logger.Error($"[FLAGS] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
        }
    }

    // Caller holds _gate. Atomic temp+rename — a kill mid-write can't truncate it.
    private void Save()
    {
        try
        {
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_store, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[FLAGS] Failed to save {_path}: {ex.Message}");
        }
    }
}
