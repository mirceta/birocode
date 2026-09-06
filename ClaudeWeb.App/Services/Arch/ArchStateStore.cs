using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The arch agent's durable harness-side state (openspec: add-arch-agent, D2/D9;
/// arch-conversations): the managed set the Operator picked, the fleet consents, and
/// one record PER CONVERSATION — its name, the session id the conversation continues
/// in, the collector watermark its wake loop reads past and the standing wake loop
/// remembered for it. The default conversation keeps the reserved id <c>@arch</c>;
/// further ones are <c>@arch:&lt;8 hex&gt;</c>. One file next to the loop store:
/// <c>arch.json</c> under the data dir. Everything the arch agent itself writes lives
/// in its HOME REPO, not here — this file is the harness's, the home repo is the agent's.
/// </summary>
public class ArchStateStore
{
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };
    private readonly object _gate = new();
    private readonly string _path;
    private readonly Logger _logger;
    private Data _data = new();

    /// <summary>The reserved id of the default conversation (= <see cref="ArchAgentService.ReservedId"/>).</summary>
    public const string DefaultConversationId = "@arch";
    public const string DefaultConversationName = "Arch agent";
    public const int MaxConversations = 24;

    private sealed class ConversationData
    {
        public string Id { get; set; } = DefaultConversationId;
        public string Name { get; set; } = DefaultConversationName;
        public string? SessionId { get; set; }
        // Collector seq this conversation's wake loop has consumed up to. -1 = never
        // set: the next arm starts it at the collector's current last seq (no replay).
        public int Watermark { get; set; } = -1;
        // The standing wake loop the Operator had armed here (openspec arch-driven-loops):
        // remembered when a driven kind takes the slot, restored when it ends, cleared
        // by the Operator's own Stop. Null mode = nothing remembered.
        public string? StandingLoopMode { get; set; }
        public int StandingLoopCap { get; set; }
        public long CreatedAt { get; set; }
    }

    private sealed class Data
    {
        public List<string> ManagedRepoIds { get; set; } = new();
        // Managed agents on OTHER harnesses (openspec add-fleet-arch-agent, D3):
        // keys "<collector source id>/<repo id on that harness>".
        public List<string> ManagedFleet { get; set; } = new();
        // Whether THIS harness lets a fleet arch on another harness send tasks to
        // its repo agents (receiving-side opt-in, default off).
        public bool AcceptFleetSends { get; set; }
        // Whether THIS harness lets a fleet arch elsewhere (or the operator through
        // it) upgrade this harness to a ref (openspec arch-peer-upgrades). Default off.
        public bool AcceptFleetUpgrades { get; set; }
        // The default conversation's fields as older builds wrote them. Kept in sync
        // with Conversations[@arch] on every save so a downgrade still reads them.
        public int Watermark { get; set; } = -1;
        public string? LastSessionId { get; set; }
        public string? StandingLoopMode { get; set; }
        public int StandingLoopCap { get; set; }
        // The quiet floor for driven loops on the arch conversations (openspec
        // arch-driven-loops): a repeat of the same prompt goes out after this many
        // seconds even with no wake. 0 = default. Shared by every conversation.
        public int DrivenQuietSeconds { get; set; }
        // Every arch conversation (openspec arch-conversations); the default is first.
        public List<ConversationData> Conversations { get; set; } = new();
    }

    /// <summary>A conversation as the API and the UI see it.</summary>
    public sealed record Conversation(string Id, string Name, string? SessionId, int Watermark, long CreatedAt, bool IsDefault);

    /// <summary>The managed-set key of an agent on a subscribed harness.</summary>
    public static string FleetKey(string sourceId, string repoId) => sourceId + "/" + repoId;

    /// <summary>Splits a fleet key back into (sourceId, repoId); null when the
    /// string is not a fleet key (a bare local repo id has no slash).</summary>
    public static (string SourceId, string RepoId)? ParseFleetKey(string? key)
    {
        if (string.IsNullOrWhiteSpace(key)) return null;
        var idx = key.IndexOf('/');
        if (idx <= 0 || idx == key.Length - 1) return null;
        return (key[..idx], key[(idx + 1)..]);
    }

    /// <summary>Whether <paramref name="id"/> names an arch conversation: the reserved
    /// id or <c>@arch:&lt;suffix&gt;</c>. Shape only — the conversation may not exist.</summary>
    public static bool IsConversationId(string? id) =>
        id is not null && (string.Equals(id, DefaultConversationId, StringComparison.Ordinal)
            || (id.StartsWith(DefaultConversationId + ":", StringComparison.Ordinal) && id.Length > DefaultConversationId.Length + 1));

    public string FilePath => _path;

    public ArchStateStore(Logger logger, string? dirOverride = null)
    {
        _logger = logger;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "arch.json");
        Load();
    }

    public IReadOnlyList<string> ManagedRepoIds
    {
        get { lock (_gate) return _data.ManagedRepoIds.ToList(); }
    }

    public IReadOnlyList<string> ManagedFleet
    {
        get { lock (_gate) return _data.ManagedFleet.ToList(); }
    }

    public bool AcceptFleetSends
    {
        get { lock (_gate) return _data.AcceptFleetSends; }
    }

    public void SetManagedFleet(IEnumerable<string> keys)
    {
        lock (_gate)
        {
            _data.ManagedFleet = keys
                .Where(k => ParseFleetKey(k) is not null)
                .Select(k => k.Trim())
                .Distinct(StringComparer.Ordinal)
                .ToList();
            Save();
        }
    }

    public void SetAcceptFleetSends(bool accept)
    {
        lock (_gate)
        {
            if (_data.AcceptFleetSends == accept) return;
            _data.AcceptFleetSends = accept;
            Save();
        }
    }

    public bool AcceptFleetUpgrades
    {
        get { lock (_gate) return _data.AcceptFleetUpgrades; }
    }

    public void SetAcceptFleetUpgrades(bool accept)
    {
        lock (_gate)
        {
            if (_data.AcceptFleetUpgrades == accept) return;
            _data.AcceptFleetUpgrades = accept;
            Save();
        }
    }

    public void SetManaged(IEnumerable<string> repoIds)
    {
        lock (_gate)
        {
            _data.ManagedRepoIds = repoIds
                .Where(id => !string.IsNullOrWhiteSpace(id))
                .Select(id => id.Trim())
                .Distinct(StringComparer.Ordinal)
                .ToList();
            Save();
        }
    }

    // ---- conversations (openspec arch-conversations) ---------------------------------------

    private static Conversation View(ConversationData c) =>
        new(c.Id, c.Name, c.SessionId, c.Watermark, c.CreatedAt, string.Equals(c.Id, DefaultConversationId, StringComparison.Ordinal));

    // Caller holds _gate.
    private ConversationData? Find(string? id) =>
        id is null ? null : _data.Conversations.FirstOrDefault(c => string.Equals(c.Id, id, StringComparison.Ordinal));

    // Caller holds _gate. The default conversation always exists.
    private ConversationData Default()
    {
        var d = Find(DefaultConversationId);
        if (d is null)
        {
            d = new ConversationData { Id = DefaultConversationId, Name = DefaultConversationName, CreatedAt = 0 };
            _data.Conversations.Insert(0, d);
        }
        return d;
    }

    /// <summary>Every conversation, the default first, then by creation.</summary>
    public IReadOnlyList<Conversation> Conversations
    {
        get { lock (_gate) { Default(); return _data.Conversations.Select(View).ToList(); } }
    }

    public Conversation? GetConversation(string? id)
    {
        lock (_gate) { Default(); return Find(id) is { } c ? View(c) : null; }
    }

    public bool HasConversation(string? id)
    {
        lock (_gate) { Default(); return Find(id) is not null; }
    }

    /// <summary>The display name of a conversation; the default name for an unknown id.</summary>
    public string NameOf(string? id)
    {
        lock (_gate) { Default(); return Find(id)?.Name ?? DefaultConversationName; }
    }

    public static string CleanName(string? name, string fallback)
    {
        var clean = (name ?? "").Trim();
        if (clean.Length > 60) clean = clean[..60].TrimEnd();
        return clean.Length == 0 ? fallback : clean;
    }

    /// <summary>Creates a conversation with a fresh id <c>@arch:&lt;8 hex&gt;</c>. Throws
    /// when the cap is reached.</summary>
    public Conversation AddConversation(string? name)
    {
        lock (_gate)
        {
            Default();
            if (_data.Conversations.Count >= MaxConversations)
                throw new InvalidOperationException($"at most {MaxConversations} arch conversations");
            string id;
            do { id = DefaultConversationId + ":" + Guid.NewGuid().ToString("N")[..8]; } while (Find(id) is not null);
            var c = new ConversationData
            {
                Id = id,
                Name = CleanName(name, $"Arch conversation {_data.Conversations.Count + 1}"),
                CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            };
            _data.Conversations.Add(c);
            Save();
            return View(c);
        }
    }

    public Conversation? RenameConversation(string? id, string? name)
    {
        lock (_gate)
        {
            Default();
            if (Find(id) is not { } c) return null;
            var clean = CleanName(name, c.Name);
            if (!string.Equals(c.Name, clean, StringComparison.Ordinal))
            {
                c.Name = clean;
                Save();
            }
            return View(c);
        }
    }

    /// <summary>Removes a non-default conversation's record (its transcript stays on
    /// disk under the home's project folder). False for the default or an unknown id.</summary>
    public bool RemoveConversation(string? id)
    {
        lock (_gate)
        {
            Default();
            if (string.Equals(id, DefaultConversationId, StringComparison.Ordinal)) return false;
            var removed = _data.Conversations.RemoveAll(c => string.Equals(c.Id, id, StringComparison.Ordinal));
            if (removed == 0) return false;
            Save();
            return true;
        }
    }

    // ---- per-conversation fields (the no-key overloads address the default) ----------------

    public int Watermark => WatermarkOf(DefaultConversationId);

    public int WatermarkOf(string? id)
    {
        lock (_gate) { Default(); return Find(id)?.Watermark ?? -1; }
    }

    public void SetWatermark(int seq) => SetWatermark(DefaultConversationId, seq);

    public void SetWatermark(string? id, int seq)
    {
        lock (_gate)
        {
            Default();
            if (Find(id) is not { } c || c.Watermark == seq) return;
            c.Watermark = seq;
            Save();
        }
    }

    public string? LastSessionId => SessionOf(DefaultConversationId);

    public string? SessionOf(string? id)
    {
        lock (_gate) { Default(); return Find(id)?.SessionId; }
    }

    public void SetLastSessionId(string? sessionId) => SetSessionId(DefaultConversationId, sessionId);

    public void SetSessionId(string? id, string? sessionId)
    {
        lock (_gate)
        {
            Default();
            var clean = string.IsNullOrWhiteSpace(sessionId) ? null : sessionId.Trim();
            if (Find(id) is not { } c || c.SessionId == clean) return;
            c.SessionId = clean;
            Save();
        }
    }

    /// <summary>The remembered standing wake loop (mode, cap) of the default conversation, or null.</summary>
    public (string Mode, int Cap)? StandingLoop => StandingLoopOf(DefaultConversationId);

    public (string Mode, int Cap)? StandingLoopOf(string? id)
    {
        lock (_gate) { Default(); return Find(id) is { StandingLoopMode: { } m } c ? (m, c.StandingLoopCap) : null; }
    }

    public void SetStandingLoop(string mode, int cap) => SetStandingLoop(DefaultConversationId, mode, cap);

    public void SetStandingLoop(string? id, string mode, int cap)
    {
        lock (_gate)
        {
            Default();
            if (Find(id) is not { } c) return;
            if (c.StandingLoopMode == mode && c.StandingLoopCap == cap) return;
            c.StandingLoopMode = mode;
            c.StandingLoopCap = cap;
            Save();
        }
    }

    public void ClearStandingLoop() => ClearStandingLoop(DefaultConversationId);

    public void ClearStandingLoop(string? id)
    {
        lock (_gate)
        {
            Default();
            if (Find(id) is not { StandingLoopMode: not null } c) return;
            c.StandingLoopMode = null;
            c.StandingLoopCap = 0;
            Save();
        }
    }

    /// <summary>Seconds of silence after which a driven arch loop re-prompts without a
    /// wake; 0 means the policy default. One value for every conversation.</summary>
    public int DrivenQuietSeconds
    {
        get { lock (_gate) return _data.DrivenQuietSeconds; }
    }

    public void SetDrivenQuietSeconds(int seconds)
    {
        var clean = Math.Clamp(seconds, 0, 24 * 3600);
        lock (_gate)
        {
            if (_data.DrivenQuietSeconds == clean) return;
            _data.DrivenQuietSeconds = clean;
            Save();
        }
    }

    private void Load()
    {
        try
        {
            if (File.Exists(_path))
            {
                var data = JsonSerializer.Deserialize<Data>(File.ReadAllText(_path));
                if (data is not null)
                {
                    data.ManagedRepoIds ??= new();
                    data.ManagedFleet ??= new();
                    data.Conversations ??= new();
                    _data = data;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[ARCH] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
        }
        // Migration: a file from before conversations carries the default's fields at the
        // top level; adopt them into the @arch record once (in memory — written on the next save).
        _data.Conversations.RemoveAll(c => !IsConversationId(c.Id));
        if (Find(DefaultConversationId) is null)
        {
            _data.Conversations.Insert(0, new ConversationData
            {
                Id = DefaultConversationId,
                Name = DefaultConversationName,
                SessionId = _data.LastSessionId,
                Watermark = _data.Watermark,
                StandingLoopMode = _data.StandingLoopMode,
                StandingLoopCap = _data.StandingLoopCap,
                CreatedAt = 0,
            });
        }
        foreach (var c in _data.Conversations) c.Name = CleanName(c.Name, DefaultConversationName);
    }

    // Caller holds _gate. Atomic temp+rename, like the loop store.
    private void Save()
    {
        try
        {
            var d = Default();
            _data.Watermark = d.Watermark;
            _data.LastSessionId = d.SessionId;
            _data.StandingLoopMode = d.StandingLoopMode;
            _data.StandingLoopCap = d.StandingLoopCap;
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_data, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[ARCH] Failed to save {_path}: {ex.Message}");
        }
    }
}
