using System.Text;
using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Chat;

/// <summary>
/// Per-file incremental reader for JSONL transcripts (openspec: reduce-transcript-io,
/// D1). Each cached file keeps the bytes consumed so far plus an accumulator
/// <typeparamref name="TAcc"/> that has been fed every complete line up to that
/// offset. A read then costs:
/// <list type="bullet">
/// <item>one open + stat when the file is unchanged (same length and last-write time);</item>
/// <item>the appended bytes only when the file grew (the previous tail must still
/// match, otherwise the file was rewritten and we start over);</item>
/// <item>a full parse when the file shrank, was rewritten in place (same length, new
/// last-write time — the NUL repair does this) or was never seen.</item>
/// </list>
/// Only lines terminated by <c>\n</c> are consumed: a line the CLI is still
/// appending stays unconsumed and is read once its newline lands. Lines are
/// split on the byte 0x0A (never part of a UTF-8 multibyte sequence) and
/// decoded one at a time, so chunk boundaries are safe. The same resilience as
/// before applies to every line: NUL padding is trimmed and a malformed line is
/// skipped, never fatal.
///
/// Bounded: the <paramref name="capacity"/> most recently used files stay
/// cached; an evicted file simply parses in full on its next read (the
/// pre-change behaviour). A per-entry lock makes concurrent readers of one file
/// single-flight and lets a caller snapshot the accumulator safely.
/// </summary>
internal sealed class TranscriptCache<TAcc> where TAcc : class
{
    private const int ChunkBytes = 64 * 1024;
    private const int TailBytes = 64;

    private readonly Func<TAcc> _newAcc;
    private readonly Action<TAcc, JsonElement> _feed;
    private readonly int _capacity;
    private readonly Logger? _logger;
    private readonly object _gate = new();
    private readonly Dictionary<string, Entry> _entries = new(StringComparer.OrdinalIgnoreCase);
    private long _clock;
    private long _parses;
    private long _bytesRead;

    private sealed class Entry
    {
        public TAcc? Acc;
        public long Offset;          // bytes consumed (start of the first unconsumed line)
        public long Length;          // file length observed after the last parse
        public DateTime LastWriteUtc;
        public byte[] Tail = [];     // the last <= TailBytes consumed bytes, to detect a rewrite
        public long LastUsed;
        public readonly object Lock = new();
    }

    public TranscriptCache(Func<TAcc> newAcc, Action<TAcc, JsonElement> feed, int capacity = 24, Logger? logger = null)
    {
        _newAcc = newAcc;
        _feed = feed;
        _capacity = Math.Max(1, capacity);
        _logger = logger;
    }

    /// <summary>How many parse passes (full or delta) have run — diagnostics/tests.</summary>
    public long Parses => Interlocked.Read(ref _parses);

    /// <summary>How many transcript bytes have been read from disk — diagnostics/tests.</summary>
    public long BytesRead => Interlocked.Read(ref _bytesRead);

    /// <summary>
    /// Brings <paramref name="path"/> up to date and runs <paramref name="snapshot"/>
    /// over its accumulator under the entry lock (copy what you need — the
    /// accumulator keeps mutating on later reads). Returns default when the file
    /// does not exist.
    /// </summary>
    public TOut? Read<TOut>(string path, Func<TAcc, TOut> snapshot)
    {
        var entry = GetEntry(path);
        lock (entry.Lock)
        {
            FileStream fs;
            try
            {
                fs = new FileStream(path, FileMode.Open, FileAccess.Read,
                    FileShare.ReadWrite | FileShare.Delete, ChunkBytes, FileOptions.SequentialScan);
            }
            catch (FileNotFoundException) { Forget(path); return default; }
            catch (DirectoryNotFoundException) { Forget(path); return default; }

            using (fs)
            {
                // Length and last-write time through the OPEN handle: the directory
                // entry Windows serves to a plain stat can lag for a file another
                // process holds open for append.
                var length = fs.Length;
                var mtime = File.GetLastWriteTimeUtc(fs.SafeFileHandle);

                var unchanged = entry.Acc is not null && length == entry.Length && mtime == entry.LastWriteUtc;
                if (!unchanged)
                {
                    var reset = entry.Acc is null
                        || length < entry.Offset
                        || (length == entry.Length && mtime != entry.LastWriteUtc)
                        || !TailMatches(fs, entry);
                    if (reset)
                    {
                        entry.Acc = _newAcc();
                        entry.Offset = 0;
                        entry.Tail = [];
                    }

                    Interlocked.Increment(ref _parses);
                    entry.Offset = FeedLines(fs, entry.Offset, entry.Acc!, entry);
                    // Re-observe through the handle AFTER consuming: a write that
                    // landed mid-read shows up as a longer file on the next call.
                    entry.Length = fs.Length;
                    entry.LastWriteUtc = File.GetLastWriteTimeUtc(fs.SafeFileHandle);
                }
                return snapshot(entry.Acc!);
            }
        }
    }

    /// <summary>Parses <paramref name="path"/> once, from the start, without
    /// touching the cache (for one-off scans over many historical files).</summary>
    public TAcc? ReadUncached(string path)
    {
        FileStream fs;
        try
        {
            fs = new FileStream(path, FileMode.Open, FileAccess.Read,
                FileShare.ReadWrite | FileShare.Delete, ChunkBytes, FileOptions.SequentialScan);
        }
        catch (FileNotFoundException) { return null; }
        catch (DirectoryNotFoundException) { return null; }
        using (fs)
        {
            var acc = _newAcc();
            Interlocked.Increment(ref _parses);
            FeedLines(fs, 0, acc, null);
            return acc;
        }
    }

    /// <summary>Drops the cached state for one file (e.g. after a deliberate rewrite).</summary>
    public void Forget(string path)
    {
        lock (_gate) _entries.Remove(path);
    }

    private Entry GetEntry(string path)
    {
        lock (_gate)
        {
            if (!_entries.TryGetValue(path, out var entry))
            {
                if (_entries.Count >= _capacity)
                {
                    var victim = _entries.MinBy(kv => kv.Value.LastUsed).Key;
                    _entries.Remove(victim);
                }
                entry = new Entry();
                _entries[path] = entry;
            }
            entry.LastUsed = ++_clock;
            return entry;
        }
    }

    /// <summary>True when the bytes just before the consumed offset still read
    /// the same — i.e. the file was appended to, not rewritten.</summary>
    private static bool TailMatches(FileStream fs, Entry entry)
    {
        if (entry.Tail.Length == 0) return entry.Offset == 0;
        if (fs.Length < entry.Offset) return false;
        var buf = new byte[entry.Tail.Length];
        fs.Position = entry.Offset - entry.Tail.Length;
        var got = fs.Read(buf, 0, buf.Length);
        return got == buf.Length && buf.AsSpan().SequenceEqual(entry.Tail);
    }

    /// <summary>
    /// Feeds every complete line from <paramref name="from"/> to the accumulator
    /// and returns the offset just past the last consumed newline. A trailing
    /// partial line is left for the next read. Updates <paramref name="entry"/>'s
    /// tail fingerprint when given.
    /// </summary>
    private long FeedLines(FileStream fs, long from, TAcc acc, Entry? entry)
    {
        fs.Position = from;
        var consumed = from;
        var chunk = new byte[ChunkBytes];
        var pending = new MemoryStream();

        int n;
        while ((n = fs.Read(chunk, 0, chunk.Length)) > 0)
        {
            Interlocked.Add(ref _bytesRead, n);
            var start = 0;
            for (var i = 0; i < n; i++)
            {
                if (chunk[i] != (byte)'\n') continue;
                pending.Write(chunk, start, i - start);
                FeedOne(acc, pending);
                pending.SetLength(0);
                start = i + 1;
            }
            if (start < n) pending.Write(chunk, start, n - start);
            // Everything up to the last newline is consumed; the pending bytes (a
            // line without its newline yet) are not.
            consumed = fs.Position - pending.Length;
        }

        // Remember the last consumed bytes so a rewrite (not an append) is
        // detectable on the next read.
        if (entry is not null && consumed > 0)
        {
            var take = (int)Math.Min(TailBytes, consumed);
            var tail = new byte[take];
            fs.Position = consumed - take;
            var got = 0;
            while (got < take)
            {
                var r = fs.Read(tail, got, take - got);
                if (r <= 0) break;
                got += r;
            }
            entry.Tail = got == take ? tail : [];
        }
        return consumed;
    }

    private void FeedOne(TAcc acc, MemoryStream lineBytes)
    {
        if (lineBytes.Length == 0) return;
        string line;
        try { line = Encoding.UTF8.GetString(lineBytes.GetBuffer(), 0, (int)lineBytes.Length); }
        catch { return; }
        line = line.Trim('\0', '\r', ' ', '\t');
        if (line.Length == 0) return;
        JsonDocument doc;
        try { doc = JsonDocument.Parse(line); }
        catch { return; } // skip a malformed transcript line, keep going
        using (doc)
        {
            try { _feed(acc, doc.RootElement); }
            catch (Exception ex) { _logger?.Error($"[CHAT] Transcript line skipped: {ex.Message}"); }
        }
    }
}
