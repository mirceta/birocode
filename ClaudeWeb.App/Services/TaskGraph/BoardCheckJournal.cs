using System.Text.Json;
using System.Text.Json.Serialization;

namespace ClaudeWeb.Services.TaskGraph;

/// <summary>
/// The Board check's provenance (openspec board-check-provenance): a bounded, persisted journal
/// of every auto-verifier pass — when it ran, what triggered it, what it checked, every card it
/// moved, every 🆘 it raised or cleared, the verdict counts, and any error. This is what the
/// Board check subtab shows, and what "why is this card here?" is answered from.
///
/// Quiet passes (nothing moved, no flag changed, same verdict) are coalesced into the previous
/// quiet entry as a run — "37 quiet passes until 14:02" — so a day of minute ticks stays a
/// readable history rather than 1,440 identical rows. The total pass count is kept exactly.
/// </summary>
public sealed class BoardCheckJournal
{
    public const string FileName = "boardcheck.json";
    public const int MaxEntries = 400;
    public const int MaxNotesPerEntry = 60;

    /// <summary>A flagged card as the journal remembers it.</summary>
    public sealed record Flag(string Id, string Title, string? State, string? Reason);

    /// <summary>One pass, or a run of identical quiet passes (<see cref="Repeats"/> &gt; 1,
    /// <see cref="LastAt"/> the latest).</summary>
    public sealed record Entry(
        long At, long LastAt, int Repeats, string Trigger, long DurationMs, int Checked, int Probed,
        IReadOnlyList<BoardVerifier.Change> Changes, IReadOnlyList<string> Notes,
        int Cards, int Honest, int Dishonest, int Stuck, int Manual,
        IReadOnlyList<Flag> Flagged, IReadOnlyList<Flag> Raised, IReadOnlyList<Flag> Cleared, string? Error)
    {
        /// <summary>Nothing happened: no move, no flag raised or cleared, no error.</summary>
        [JsonIgnore]
        public bool Quiet => Changes.Count == 0 && Raised.Count == 0 && Cleared.Count == 0 && Error is null;

        /// <summary>Whether this entry mentions the card at all (moved, flagged, raised, cleared).</summary>
        public bool Touches(string id) =>
            Changes.Any(c => c.Id == id) || Raised.Any(f => f.Id == id) || Cleared.Any(f => f.Id == id) || Flagged.Any(f => f.Id == id);
    }

    private sealed class FileShape
    {
        public int Passes { get; set; }
        public List<Entry> Entries { get; set; } = new();
    }

    private static readonly JsonSerializerOptions Json = new() { PropertyNameCaseInsensitive = true };

    private readonly object _gate = new();
    private readonly string? _path;
    private readonly List<Entry> _entries = new(); // oldest first
    private int _passes;

    /// <summary>Unix ms when this journal (i.e. this harness process) started.</summary>
    public long StartedAt { get; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <param name="dir">The data dir to persist in; null = memory only (tests, and a poller built without DI).</param>
    public BoardCheckJournal(string? dir)
    {
        if (dir is null) return;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, FileName);
        Load();
    }

    /// <summary>Total passes recorded, including those coalesced into a run.</summary>
    public int Passes { get { lock (_gate) return _passes; } }

    public Entry? Last { get { lock (_gate) return _entries.Count == 0 ? null : _entries[^1]; } }

    /// <summary>Newest first.</summary>
    public IReadOnlyList<Entry> Recent(int take)
    {
        lock (_gate) return _entries.AsEnumerable().Reverse().Take(Math.Max(0, take)).ToList();
    }

    /// <summary>Every entry that touched the card, newest first — the card's own timeline.</summary>
    public IReadOnlyList<Entry> ForCard(string id)
    {
        lock (_gate) return _entries.Where(e => e.Touches(id)).Reverse().ToList();
    }

    /// <summary>Every card the journal has ever mentioned (id → latest title), for a picker.</summary>
    public IReadOnlyList<(string Id, string Title)> CardsSeen()
    {
        lock (_gate)
        {
            var seen = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var e in _entries)
            {
                foreach (var c in e.Changes) seen[c.Id] = c.Title;
                foreach (var f in e.Flagged.Concat(e.Raised).Concat(e.Cleared)) seen[f.Id] = f.Title;
            }
            return seen.Select(kv => (kv.Key, kv.Value)).OrderBy(t => t.Value, StringComparer.OrdinalIgnoreCase).ToList();
        }
    }

    /// <summary>Record one pass. Returns the entry as stored (the run it joined, or itself).</summary>
    public Entry Record(Entry e)
    {
        if (e.Notes.Count > MaxNotesPerEntry) e = e with { Notes = e.Notes.Take(MaxNotesPerEntry).Append($"… {e.Notes.Count - MaxNotesPerEntry} more").ToList() };
        lock (_gate)
        {
            _passes++;
            Entry stored;
            if (_entries.Count > 0 && Coalesces(_entries[^1], e))
            {
                var prev = _entries[^1];
                stored = prev with { LastAt = e.At, Repeats = prev.Repeats + 1, DurationMs = e.DurationMs, Checked = e.Checked, Probed = e.Probed, Notes = e.Notes };
                _entries[^1] = stored;
            }
            else
            {
                stored = e with { LastAt = e.At, Repeats = Math.Max(1, e.Repeats) };
                _entries.Add(stored);
                if (_entries.Count > MaxEntries) _entries.RemoveRange(0, _entries.Count - MaxEntries);
            }
            Save();
            return stored;
        }
    }

    /// <summary>Pure: a quiet pass joins the previous entry when that one is quiet too, was
    /// triggered the same way, and reached the same verdict on the same flagged cards.</summary>
    public static bool Coalesces(Entry prev, Entry next) =>
        prev.Quiet && next.Quiet && prev.Trigger == next.Trigger
        && prev.Cards == next.Cards && prev.Honest == next.Honest && prev.Dishonest == next.Dishonest
        && prev.Stuck == next.Stuck && prev.Manual == next.Manual
        && prev.Flagged.Select(f => f.Id + "|" + f.State).SequenceEqual(next.Flagged.Select(f => f.Id + "|" + f.State));

    private void Load()
    {
        if (_path is null || !File.Exists(_path)) return;
        try
        {
            var shape = JsonSerializer.Deserialize<FileShape>(File.ReadAllText(_path), Json);
            if (shape is null) return;
            _passes = shape.Passes;
            _entries.AddRange(shape.Entries.Where(e => e is not null));
        }
        catch { /* a corrupt journal is not worth a failed boot: start empty */ }
    }

    private void Save()
    {
        if (_path is null) return;
        try
        {
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(new FileShape { Passes = _passes, Entries = _entries }, Json));
            File.Move(tmp, _path, overwrite: true);
        }
        catch { /* best effort: the next pass writes again */ }
    }
}
