using System.Text.Json;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Policeman;

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
        // The goal this conversation runs (openspec arch-goal-conversations): what it owns
        // for as long as the goal runs, and the outcome afterwards. Null GoalId = none.
        public string? GoalId { get; set; }
        public string? GoalText { get; set; }
        public List<string> GoalRepos { get; set; } = new();
        public List<string> GoalTasks { get; set; } = new();
        public string? GoalState { get; set; }
        public long GoalStartedAt { get; set; }
        public long? GoalEndedAt { get; set; }
        public string? GoalStartedBy { get; set; }
        public string? GoalOutcome { get; set; }
        public List<QueuedMessage> GoalQueue { get; set; } = new();
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
        // The claimed rule's activity window (openspec arch-branch-handover): minutes after
        // the last human turn during which an unassigned branch stays claimed. 0 = default (2 h).
        public int ClaimWindowMinutes { get; set; }
        // Every arch conversation (openspec arch-conversations); the default is first.
        public List<ConversationData> Conversations { get; set; } = new();
        // The policeman conversation's bookkeeping (openspec kanban-policeman-conversation).
        public PolicemanData Policeman { get; set; } = new();
    }

    private sealed class PolicemanData
    {
        public bool Enabled { get; set; }
        public int IntervalSeconds { get; set; }
        public int ContextCapTokens { get; set; }
        public int Rollovers { get; set; }
        public int Restarts { get; set; }
        public long? LastContextTokens { get; set; }
        public int TurnsThisSession { get; set; }
        public long LastTurnAt { get; set; }
        public long? LastRolloverAt { get; set; }
        public string? PendingHandover { get; set; }
        public List<PolicemanSession> Sessions { get; set; } = new();
    }

    /// <summary>One policeman session (openspec kanban-policeman-conversation): provenance
    /// across rollovers — the CLI session id (its transcript and tool calls stay readable),
    /// when it ran, why it ended, how big it got.</summary>
    public sealed record PolicemanSession(string SessionId, long StartedAt, long? EndedAt, string? EndedBecause, long? ContextTokens, int Turns);

    public sealed record PolicemanState(
        bool Enabled, int IntervalSeconds, int ContextCapTokens, int Rollovers, int Restarts,
        long? LastContextTokens, int TurnsThisSession, long LastTurnAt, long? LastRolloverAt, bool HandoverPending,
        IReadOnlyList<PolicemanSession> Sessions);

    /// <summary>An Operator message queued for a busy goal conversation; its loop reads it on the next wake.</summary>
    public sealed record QueuedMessage(long At, string Text);

    /// <summary>A goal conversation as the API, the tools and the UI see it.</summary>
    public sealed record ArchGoal(
        string Id, string ConversationId, string Text, IReadOnlyList<string> Repos, IReadOnlyList<string> Tasks,
        string State, long StartedAt, long? EndedAt, string? StartedBy, string? Outcome, IReadOnlyList<QueuedMessage> Queue)
    {
        public bool Running => string.Equals(State, ArchGoals.Running, StringComparison.Ordinal);
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

    /// <summary>A conversation with a FIXED id (openspec kanban-policeman-conversation): created
    /// if missing, returned as is otherwise. Reserved ids never count against the limit.</summary>
    public Conversation EnsureConversation(string id, string name)
    {
        lock (_gate)
        {
            Default();
            var existing = Find(id);
            if (existing is not null) return View(existing);
            var c = new ConversationData { Id = id, Name = CleanName(name, id), CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() };
            _data.Conversations.Add(c);
            Save();
            return View(c);
        }
    }

    // ---- the policeman (openspec kanban-policeman-conversation) ------------------------------

    public PolicemanState Policeman
    {
        get
        {
            lock (_gate)
            {
                var p = _data.Policeman;
                return new PolicemanState(p.Enabled, p.IntervalSeconds, p.ContextCapTokens, p.Rollovers, p.Restarts,
                    p.LastContextTokens, p.TurnsThisSession, p.LastTurnAt, p.LastRolloverAt, p.PendingHandover is not null,
                    p.Sessions.ToList());
            }
        }
    }

    public void SetPolicemanEnabled(bool enabled)
    {
        lock (_gate) { if (_data.Policeman.Enabled == enabled) return; _data.Policeman.Enabled = enabled; Save(); }
    }

    public void SetPolicemanSettings(int? intervalSeconds, int? contextCapTokens)
    {
        lock (_gate)
        {
            if (intervalSeconds is { } i) _data.Policeman.IntervalSeconds = PolicemanLifecycleRules.CleanInterval(i);
            if (contextCapTokens is { } c) _data.Policeman.ContextCapTokens = PolicemanLifecycleRules.CleanCap(c);
            Save();
        }
    }

    public void NotePolicemanRestart()
    {
        lock (_gate) { _data.Policeman.Restarts++; Save(); }
    }

    /// <summary>A policeman turn completed in <paramref name="sessionId"/> with the CLI's last
    /// reported context size (null when it reported none). Tracks the session list: a new id
    /// closes the open session record and opens another.</summary>
    public void NotePolicemanTurn(string? sessionId, long? contextTokens, long now)
    {
        lock (_gate)
        {
            var p = _data.Policeman;
            if (!string.IsNullOrWhiteSpace(sessionId))
            {
                var open = p.Sessions.LastOrDefault(s => s.EndedAt is null);
                if (open is null || !string.Equals(open.SessionId, sessionId, StringComparison.Ordinal))
                {
                    if (open is not null)
                        p.Sessions[p.Sessions.Count - 1] = open with { EndedAt = now, EndedBecause = open.EndedBecause ?? "a new session started", ContextTokens = open.ContextTokens ?? p.LastContextTokens };
                    p.Sessions.Add(new PolicemanSession(sessionId, now, null, null, null, 0));
                    p.TurnsThisSession = 0;
                    p.LastContextTokens = null;
                    while (p.Sessions.Count > PolicemanLifecycleRules.MaxSessionsKept) p.Sessions.RemoveAt(0);
                }
                var idx = p.Sessions.Count - 1;
                p.Sessions[idx] = p.Sessions[idx] with { Turns = p.Sessions[idx].Turns + 1, ContextTokens = contextTokens ?? p.Sessions[idx].ContextTokens };
            }
            p.TurnsThisSession++;
            if (contextTokens is { } t && t > 0) p.LastContextTokens = t;
            p.LastTurnAt = now;
            Save();
        }
    }

    /// <summary>Cut the current session: close its record with the reason, count the rollover,
    /// park the handover for the next prompt. Returns the previous session id (null if none).</summary>
    public string? BeginPolicemanRollover(string reason, string handover, long now)
    {
        lock (_gate)
        {
            var p = _data.Policeman;
            string? prev = null;
            var idx = p.Sessions.FindLastIndex(s => s.EndedAt is null);
            if (idx >= 0)
            {
                var open = p.Sessions[idx];
                prev = open.SessionId;
                p.Sessions[idx] = open with { EndedAt = now, EndedBecause = reason, ContextTokens = open.ContextTokens ?? p.LastContextTokens };
            }
            p.Rollovers++;
            p.LastRolloverAt = now;
            p.PendingHandover = handover;
            p.TurnsThisSession = 0;
            p.LastContextTokens = null;
            Save();
            return prev;
        }
    }

    /// <summary>The parked handover, once: the next prompt carries it, then it is gone.</summary>
    public string? TakePolicemanHandover()
    {
        lock (_gate)
        {
            var h = _data.Policeman.PendingHandover;
            if (h is null) return null;
            _data.Policeman.PendingHandover = null;
            Save();
            return h;
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

    // ---- goals (openspec arch-goal-conversations) -----------------------------------------

    private static ArchGoal? GoalView(ConversationData c) =>
        c.GoalId is null ? null : new ArchGoal(c.GoalId, c.Id, c.GoalText ?? "", c.GoalRepos.ToList(), c.GoalTasks.ToList(),
            c.GoalState ?? ArchGoals.Stopped, c.GoalStartedAt, c.GoalEndedAt, c.GoalStartedBy, c.GoalOutcome, c.GoalQueue.ToList());

    /// <summary>The goal a conversation runs (or ran); null when it never had one.</summary>
    public ArchGoal? GoalOf(string? convId)
    {
        lock (_gate) { Default(); return Find(convId) is { } c ? GoalView(c) : null; }
    }

    /// <summary>Every conversation's goal, running first, then by start time (newest first).</summary>
    public IReadOnlyList<ArchGoal> Goals()
    {
        lock (_gate)
        {
            Default();
            return _data.Conversations.Select(GoalView).Where(g => g is not null).Select(g => g!)
                .OrderByDescending(g => g.Running).ThenByDescending(g => g.StartedAt).ToList();
        }
    }

    public ArchGoal? FindGoal(string? goalId)
    {
        if (string.IsNullOrWhiteSpace(goalId)) return null;
        lock (_gate) { Default(); return _data.Conversations.Where(c => string.Equals(c.GoalId, goalId, StringComparison.Ordinal)).Select(GoalView).FirstOrDefault(); }
    }

    /// <summary>The conversation whose RUNNING goal owns this managed key; null when nobody does.</summary>
    public string? OwnerOfRepo(string? key)
    {
        if (string.IsNullOrWhiteSpace(key)) return null;
        lock (_gate)
        {
            return _data.Conversations.FirstOrDefault(c => c.GoalId is not null && c.GoalState == ArchGoals.Running
                && c.GoalRepos.Contains(key, StringComparer.Ordinal))?.Id;
        }
    }

    /// <summary>The conversation whose RUNNING goal owns this board task; null when nobody does.</summary>
    public string? OwnerOfTask(string? taskId)
    {
        if (string.IsNullOrWhiteSpace(taskId)) return null;
        lock (_gate)
        {
            return _data.Conversations.FirstOrDefault(c => c.GoalId is not null && c.GoalState == ArchGoals.Running
                && c.GoalTasks.Contains(taskId, StringComparer.Ordinal))?.Id;
        }
    }

    /// <summary>Records a goal on a conversation: it owns the keys and tasks from now until
    /// <see cref="EndGoal"/>. Throws when the conversation is unknown, is the default, or
    /// already runs a goal.</summary>
    public ArchGoal StartGoal(string convId, string text, IEnumerable<string> repos, IEnumerable<string> tasks, string? by, long now)
    {
        lock (_gate)
        {
            Default();
            if (string.Equals(convId, DefaultConversationId, StringComparison.Ordinal))
                throw new InvalidOperationException("the default arch conversation is the Operator's; a goal runs in its own conversation");
            if (Find(convId) is not { } c) throw new InvalidOperationException($"no arch conversation \"{convId}\"");
            if (c.GoalId is not null && c.GoalState == ArchGoals.Running)
                throw new InvalidOperationException($"conversation {convId} already runs goal {c.GoalId}");
            c.GoalId = ArchGoals.NewId();
            c.GoalText = (text ?? "").Trim();
            c.GoalRepos = repos.Where(r => !string.IsNullOrWhiteSpace(r)).Distinct(StringComparer.Ordinal).ToList();
            c.GoalTasks = tasks.Where(t => !string.IsNullOrWhiteSpace(t)).Distinct(StringComparer.Ordinal).ToList();
            c.GoalState = ArchGoals.Running;
            c.GoalStartedAt = now;
            c.GoalEndedAt = null;
            c.GoalStartedBy = string.IsNullOrWhiteSpace(by) ? null : by.Trim();
            c.GoalOutcome = null;
            c.GoalQueue = new();
            Save();
            return GoalView(c)!;
        }
    }

    /// <summary>Adds owned keys / tasks to a running goal (a task dispatched by the goal
    /// conversation brings its assignee along). False when the conversation runs no goal.</summary>
    public bool ExtendGoal(string? convId, IEnumerable<string>? repos, IEnumerable<string>? tasks)
    {
        lock (_gate)
        {
            if (Find(convId) is not { } c || c.GoalId is null || c.GoalState != ArchGoals.Running) return false;
            var changed = false;
            foreach (var r in repos ?? Array.Empty<string>())
                if (!string.IsNullOrWhiteSpace(r) && !c.GoalRepos.Contains(r, StringComparer.Ordinal)) { c.GoalRepos.Add(r); changed = true; }
            foreach (var t in tasks ?? Array.Empty<string>())
                if (!string.IsNullOrWhiteSpace(t) && !c.GoalTasks.Contains(t, StringComparer.Ordinal)) { c.GoalTasks.Add(t); changed = true; }
            if (changed) Save();
            return true;
        }
    }

    /// <summary>Ends a running goal: the conversation releases its repos and tasks (they stay
    /// listed for the record, but own nothing), the state and outcome are kept. Null when
    /// the conversation runs no goal; idempotent for an ended one (returns it unchanged).</summary>
    public ArchGoal? EndGoal(string? convId, string state, string? outcome, long now)
    {
        lock (_gate)
        {
            if (Find(convId) is not { } c || c.GoalId is null) return null;
            if (c.GoalState != ArchGoals.Running) return GoalView(c);
            c.GoalState = string.IsNullOrWhiteSpace(state) ? ArchGoals.Stopped : state;
            c.GoalEndedAt = now;
            c.GoalOutcome = string.IsNullOrWhiteSpace(outcome) ? null : outcome.Trim();
            Save();
            return GoalView(c);
        }
    }

    /// <summary>Queues an Operator message for a busy goal conversation. Null when it runs no goal.</summary>
    public ArchGoal? QueueGoalMessage(string? convId, string? text, long now)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        lock (_gate)
        {
            if (Find(convId) is not { } c || c.GoalId is null || c.GoalState != ArchGoals.Running) return null;
            c.GoalQueue.Add(new QueuedMessage(now, text.Trim()));
            if (c.GoalQueue.Count > 20) c.GoalQueue.RemoveRange(0, c.GoalQueue.Count - 20);
            Save();
            return GoalView(c);
        }
    }

    /// <summary>Takes the queued Operator messages (the loop's next wake carries them).</summary>
    public IReadOnlyList<QueuedMessage> DrainGoalQueue(string? convId)
    {
        lock (_gate)
        {
            if (Find(convId) is not { } c || c.GoalQueue.Count == 0) return Array.Empty<QueuedMessage>();
            var taken = c.GoalQueue.ToList();
            c.GoalQueue = new();
            Save();
            return taken;
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

    /// <summary>The conversation that owns <paramref name="sessionId"/>, or null (openspec
    /// fix-arch-conversation-session-isolation): sessions are one-to-one with conversations.</summary>
    public string? OwnerOfSession(string? sessionId)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return null;
        var s = sessionId.Trim();
        lock (_gate)
        {
            Default();
            return _data.Conversations.FirstOrDefault(c => string.Equals(c.SessionId, s, StringComparison.Ordinal))?.Id;
        }
    }

    /// <summary>Detach every conversation that shares a session with another: the default
    /// (Operator-facing) conversation keeps it, else the oldest; the rest lose their session
    /// id and start fresh. Returns the detached ids (empty = nothing was shared).</summary>
    public IReadOnlyList<string> SplitSharedSessions()
    {
        lock (_gate)
        {
            Default();
            var cleared = new List<string>();
            var shared = _data.Conversations
                .Where(c => !string.IsNullOrWhiteSpace(c.SessionId))
                .GroupBy(c => c.SessionId!, StringComparer.Ordinal)
                .Where(g => g.Count() > 1)
                .ToList();
            foreach (var g in shared)
            {
                var keep = g.FirstOrDefault(c => c.Id == DefaultConversationId) ?? g.OrderBy(c => c.CreatedAt).First();
                foreach (var c in g)
                {
                    if (ReferenceEquals(c, keep)) continue;
                    c.SessionId = null;
                    cleared.Add(c.Id);
                }
            }
            if (cleared.Count > 0) Save();
            return cleared;
        }
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

    /// <summary>Minutes after the last human turn during which an unassigned branch stays
    /// claimed (openspec arch-branch-handover); 0 means the policy default.</summary>
    public int ClaimWindowMinutes
    {
        get { lock (_gate) return _data.ClaimWindowMinutes; }
    }

    public void SetClaimWindowMinutes(int minutes)
    {
        var clean = Math.Clamp(minutes, 0, 14 * 24 * 60);
        lock (_gate)
        {
            if (_data.ClaimWindowMinutes == clean) return;
            _data.ClaimWindowMinutes = clean;
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
                    foreach (var c in data.Conversations)
                    {
                        c.GoalRepos ??= new();
                        c.GoalTasks ??= new();
                        c.GoalQueue ??= new();
                    }
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
