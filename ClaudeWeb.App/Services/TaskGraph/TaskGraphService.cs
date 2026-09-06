using System.Text.Json;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;

namespace ClaudeWeb.Services.TaskGraph;

/// <summary>
/// The task dependency graph (plans/task-dependency-graph.md): ONE global board of
/// step nodes and "depends-on" edges, backend-synced so phone and desktop share it.
/// Persisted to %APPDATA%\ClaudeWeb\taskgraph.json with the same ATOMIC temp+rename
/// write and never-reseed-on-unreadable load guard as <see cref="Notes.NotesService"/>.
///
/// Edge semantics: an edge `Source -> Target` means **Source depends on (waits on)
/// Target** — Target must be done before Source. So the primary task is a node with
/// no incoming edges; the first things to do are nodes with no (incomplete) outgoing
/// edges. The frontend derives "actionable now" / "why" from this; the backend only
/// stores the DAG and refuses cycles, self-loops, and duplicate edges.
///
/// Sync (openspec sync-task-graph): the graph replicates over the shared board
/// channel beside the ideas board, mirroring <see cref="Notes.NotesService"/> —
/// a Changed event on local mutations, Snapshot for the push, and a deterministic
/// commutative MergeFrom with per-element tombstones. Nodes and machines merge
/// LWW by UpdatedAt; edges are immutable so they merge as presence-union minus
/// tombstoned ids followed by a canonical validity rebuild; the scratchpad is
/// LWW by ScratchUpdatedAt.
/// </summary>
public class TaskGraphService
{
    public const int MaxTitleLength = 2_000;
    public const int MaxNoteLength = 20_000;
    public const int MaxMachineNameLength = 200;
    public const int TombstoneRetentionDays = 30;
    // Default box size when a machine is created without explicit dimensions.
    public const double DefaultMachineW = 360;
    public const double DefaultMachineH = 240;
    // The free-text scratchpad below the graph (an experiment: if the operator
    // reaches for this instead of the graph, the graph isn't earning its keep).
    public const int MaxScratchLength = 200_000;
    // The delivery lifecycle, in order (openspec kanban-lifecycle-columns);
    // TaskLifecycle carries the rules that ride on this ordering.
    public static readonly string[] Statuses = { "todo", "doing", "committed", "pr-opened", "pr-merged", "done" };
    // Board schema: 2 = lifecycle statuses (pre-2 boards migrate on load).
    public const int CurrentSchemaVersion = 2;
    public const int DefaultStaleHours = 24;
    /// <summary>How long a card may sit in committed/pr-opened before it is
    /// flagged stale (openspec kanban-lifecycle-columns; TaskBoard:StaleHours).</summary>
    public long StaleAfterMs { get; set; } = DefaultStaleHours * 3600_000L;
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Board _board = new();
    // The ideas board (openspec ideas-consume-on-promotion): promoting an idea into a
    // node CONSUMES the idea, and deleting that node RESTORES it. Wired here so every
    // promotion path (the UI POST and the arch idea_to_task tool both call AddNode) and
    // every deletion path funnel through one place. Optional so the pure-graph unit
    // tests (and sync-only construction) can omit it — then consumption is a no-op.
    private readonly NotesService? _notes;

    /// <summary>Raised after every successful LOCAL mutation (add/update/delete/
    /// scratch). NOT raised by MergeFrom — the sync layer must not re-trigger
    /// itself when applying remote state.</summary>
    public event Action? Changed;

    /// <param name="dirOverride">Test seam (openspec tasks-agent, D2): a data dir other
    /// than <see cref="AppPaths.DataDir"/>; DI leaves it null.</param>
    /// <param name="notes">The ideas board, for consume-on-promote / restore-on-delete
    /// (openspec ideas-consume-on-promotion). DI injects it; pure-graph tests omit it.</param>
    public TaskGraphService(Logger logger, string? dirOverride = null, NotesService? notes = null)
    {
        _logger = logger;
        _notes = notes;
        var dir = dirOverride ?? AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "taskgraph.json");
        Load();
        // A fresh board (no file yet) is born on the current schema — only a
        // persisted pre-lifecycle board goes through MigrateToLifecycle.
        if (!File.Exists(_path)) _board.SchemaVersion = CurrentSchemaVersion;
    }

    // A node carries only what the dashboard needs: a title + optional note, an
    // optional repoId (shown as a label/colour — no live agent telemetry), an
    // optional machineId (the grouping box it lives in — null = unplaced), a
    // status, and its canvas position {x,y} (the operator places nodes by hand).
    // Assignment (openspec task-board-kanban): SourceId names the harness whose repo
    // agent owns the task (null = this one; RepoId is the repo there), AssignedBy who
    // assigned it (a person or an agent label), DispatchedAt/DispatchCount when the
    // arch last pinged that agent with it, CreatedBy who made the card, IdeaId the
    // idea it was promoted from. All optional so boards and sync peers that predate
    // them read back unchanged.
    // Delivery linkage (openspec kanban-lifecycle-columns), all trailing and
    // optional so older boards and sync peers read back unchanged: Branch/
    // HeadCommit/PrUrl may arrive as an agent's relayed claim, but Pushed/
    // PrNumber/MergeCommit/VerifiedStatus are written only by the verifier —
    // the harness's own observation of git/PR state. Warning carries the
    // migration badge or a clamped over-claim ("agent reported done, branch
    // not on origin").
    // Multiple assignees (openspec task-multi-assignee): Assignees is the full set of
    // repo agents owning the task, each with ITS OWN lifecycle state and delivery
    // linkage; the fields above mirror the FIRST (primary) assignee so older readers and
    // sync peers keep working, and Status is the aggregate (AggregateStatus). Null on a
    // node written before this change or by an older peer — AssigneesOf reads the
    // legacy fields as the one assignee then.
    public sealed record Node(
        string Id, string Title, string? Note, string? RepoId, string? MachineId, string Status,
        double X, double Y, long CreatedAt, long UpdatedAt,
        string? SourceId = null, string? AssignedBy = null, long? AssignedAt = null,
        long? DispatchedAt = null, int DispatchCount = 0, string? CreatedBy = null, string? IdeaId = null,
        string? Branch = null, string? HeadCommit = null, bool? Pushed = null,
        string? PrUrl = null, int? PrNumber = null, string? MergeCommit = null,
        string? VerifiedStatus = null, long? VerifiedAt = null, string? Warning = null,
        List<Assignee>? Assignees = null)
    {
        // Value equality over the assignee LIST (a record compares a List by reference,
        // which would make every rebuilt node "changed" and churn sync/saves).
        public bool Equals(Node? o) => o is not null && (ReferenceEquals(this, o) || (
            Id == o.Id && Title == o.Title && Note == o.Note && RepoId == o.RepoId && MachineId == o.MachineId && Status == o.Status
            && X.Equals(o.X) && Y.Equals(o.Y) && CreatedAt == o.CreatedAt && UpdatedAt == o.UpdatedAt
            && SourceId == o.SourceId && AssignedBy == o.AssignedBy && AssignedAt == o.AssignedAt
            && DispatchedAt == o.DispatchedAt && DispatchCount == o.DispatchCount && CreatedBy == o.CreatedBy && IdeaId == o.IdeaId
            && Branch == o.Branch && HeadCommit == o.HeadCommit && Pushed == o.Pushed
            && PrUrl == o.PrUrl && PrNumber == o.PrNumber && MergeCommit == o.MergeCommit
            && VerifiedStatus == o.VerifiedStatus && VerifiedAt == o.VerifiedAt && Warning == o.Warning
            && (Assignees ?? new List<Assignee>()).SequenceEqual(o.Assignees ?? new List<Assignee>())));
        public override int GetHashCode() => HashCode.Combine(Id, UpdatedAt, Status, RepoId);
    }

    /// <summary>One repo agent owning (part of) a task (openspec task-multi-assignee): its
    /// harness (null = this one), its repo, and its OWN lifecycle status, dispatch record
    /// and delivery linkage — the same fields the node carried for its single assignee,
    /// now per agent. <c>UpdatedAt</c> stamps this assignee's last change (the stale
    /// guard runs per assignee).</summary>
    public sealed record Assignee(
        string? SourceId, string RepoId, string Status,
        string? AssignedBy = null, long? AssignedAt = null, long? DispatchedAt = null, int DispatchCount = 0,
        string? Branch = null, string? HeadCommit = null, bool? Pushed = null,
        string? PrUrl = null, int? PrNumber = null, string? MergeCommit = null,
        string? VerifiedStatus = null, long? VerifiedAt = null, string? Warning = null, long UpdatedAt = 0)
    {
        /// <summary>"sourceId|repoId" ("" for this harness): the key the tools and the UI use.</summary>
        public string Key => AssigneeKey(SourceId, RepoId);
    }

    public static string AssigneeKey(string? sourceId, string repoId) => (string.IsNullOrEmpty(sourceId) ? "" : sourceId) + "|" + repoId;

    /// <summary>The effective assignee set of a node: the recorded list, else the legacy
    /// single assignee read from the node's own fields, else empty.</summary>
    public static IReadOnlyList<Assignee> AssigneesOf(Node n) =>
        n.Assignees is { Count: > 0 } ? n.Assignees
        : n.RepoId is null ? Array.Empty<Assignee>()
        : new[] { new Assignee(n.SourceId, n.RepoId, n.Status, n.AssignedBy, n.AssignedAt, n.DispatchedAt, n.DispatchCount,
            n.Branch, n.HeadCommit, n.Pushed, n.PrUrl, n.PrNumber, n.MergeCommit, n.VerifiedStatus, n.VerifiedAt, n.Warning, n.UpdatedAt) };

    /// <summary>The aggregate rule (openspec task-multi-assignee): the card is as far as
    /// its SLOWEST assignee, and it leaves todo as soon as any assignee has started. So
    /// done means every assignee is done, pr-merged means every one is at least
    /// pr-merged, doing means someone started and nobody is beyond... the slowest; a card
    /// with one assignee reads exactly as that assignee. No assignees: null (the card's
    /// own status stands).</summary>
    public static string? AggregateStatus(IReadOnlyList<Assignee> assignees)
    {
        if (assignees.Count == 0) return null;
        var min = assignees.Min(a => TaskLifecycle.Rank(a.Status));
        var anyStarted = assignees.Any(a => TaskLifecycle.Rank(a.Status) > TaskLifecycle.Rank(TaskLifecycle.Todo));
        return Statuses[anyStarted ? Math.Max(TaskLifecycle.Rank(TaskLifecycle.Doing), min) : min];
    }

    /// <summary>Whether any assignee (or an unassigned card itself) says more than the
    /// harness has verified (openspec board-claims-advisory, per assignee).</summary>
    public static bool IsUnverified(Node n)
    {
        var list = AssigneesOf(n);
        return list.Count == 0 ? TaskLifecycle.IsUnverified(n.Status, n.VerifiedStatus)
            : list.Any(a => TaskLifecycle.IsUnverified(a.Status, a.VerifiedStatus));
    }

    /// <summary>The node rebuilt from an assignee list: the list stored, the legacy fields
    /// mirroring the primary (first) assignee, the status the aggregate, the warning the
    /// assignees' warnings joined (named per repo when there are several).</summary>
    private static Node WithAssignees(Node cur, List<Assignee> list)
    {
        if (list.Count == 0)
            return cur with { Assignees = list, RepoId = null, SourceId = null, AssignedBy = null, AssignedAt = null, DispatchedAt = null, DispatchCount = 0 };
        var p = list[0];
        var warnings = list.Where(a => a.Warning is not null).Select(a => list.Count == 1 ? a.Warning! : $"{a.RepoId}: {a.Warning}").ToList();
        return cur with
        {
            Assignees = list, RepoId = p.RepoId, SourceId = p.SourceId, AssignedBy = p.AssignedBy, AssignedAt = p.AssignedAt,
            DispatchedAt = p.DispatchedAt, DispatchCount = p.DispatchCount, Branch = p.Branch, HeadCommit = p.HeadCommit, Pushed = p.Pushed,
            PrUrl = p.PrUrl, PrNumber = p.PrNumber, MergeCommit = p.MergeCommit, VerifiedStatus = p.VerifiedStatus, VerifiedAt = p.VerifiedAt,
            Status = AggregateStatus(list)!, Warning = warnings.Count == 0 ? null : string.Join("; ", warnings),
        };
    }

    /// <summary>A node's assignee list made explicit: a card written before this change, or
    /// by an older peer, carries its single assignee in the legacy fields only; it becomes
    /// the one-element list and the legacy fields are re-derived from it, so both views
    /// agree. Idempotent; never stamps UpdatedAt (sync must not churn).</summary>
    private static Node Normalize(Node n)
    {
        var list = AssigneesOf(n).ToList();
        if (list.Count == 0) return n.Assignees is null ? n with { Assignees = new List<Assignee>() } : n;
        var built = WithAssignees(n, list);
        return built.Equals(n) ? n : built;
    }

    /// <summary>The wanted set applied over the current list: entries already present keep
    /// their state (optionally with the dispatch record reset), new ones start at
    /// <paramref name="inheritStatus"/> — the card's current status, so assigning a doing
    /// card does not drag it back — assigned by <paramref name="by"/> now.</summary>
    private static List<Assignee> ReplaceSet(IReadOnlyList<Assignee> current, IEnumerable<(string? SourceId, string RepoId)> wanted, string? by, long now, string inheritStatus, bool resetDispatch)
    {
        var list = new List<Assignee>();
        foreach (var (src, repo) in wanted)
        {
            var key = AssigneeKey(CleanRepo(src), repo);
            if (list.Any(a => a.Key == key)) continue;
            var existing = current.FirstOrDefault(a => a.Key == key);
            list.Add(existing is not null
                ? (resetDispatch ? existing with { DispatchedAt = null, DispatchCount = 0, AssignedBy = Clean(by, 200) ?? existing.AssignedBy, AssignedAt = now, UpdatedAt = now } : existing)
                : new Assignee(CleanRepo(src), repo, inheritStatus, Clean(by, 200), now, null, 0,
                    Warning: TaskLifecycle.WarningFor(inheritStatus, null, null), UpdatedAt: now));
        }
        return list;
    }

    // Source depends on Target (Target is the prerequisite).
    public sealed record Edge(string Id, string Source, string Target);

    // A grouping box that represents ONE machine on which agents run
    // (plans/taskgraph-machine-groups.md). Purely an organizing overlay the
    // operator draws — own position {x,y} and size {w,h}; nodes reference it by
    // MachineId. No live host telemetry by design.
    public sealed record Machine(
        string Id, string Name, double X, double Y, double W, double H, long CreatedAt, long UpdatedAt);

    /// <summary>A recorded deletion (node, edge, or machine — ids are GUIDs, one
    /// namespace), kept so a delete on one harness doesn't resurrect from another
    /// during sync (openspec sync-task-graph). Pruned after
    /// <see cref="TombstoneRetentionDays"/>.</summary>
    public sealed record GraphTombstone(string Id, long DeletedAt);

    /// <summary>Point-in-time copy of the whole graph for the sync layer. Lists
    /// are nullable because the record also rides the sync wire, where an older
    /// peer's store may omit any of them.</summary>
    public sealed record GraphSnapshot(
        List<Node>? Nodes, List<Edge>? Edges, List<Machine>? Machines,
        string? Scratch, long ScratchUpdatedAt, List<GraphTombstone>? Tombstones);

    /// <summary>What MergeFrom did: whether the local graph changed, and whether
    /// the merged graph holds anything the remote side was missing (push needed).</summary>
    public sealed record MergeOutcome(bool LocalChanged, bool RemoteStale);

    public sealed class Board
    {
        public List<Node> Nodes { get; set; } = new();
        public List<Edge> Edges { get; set; } = new();
        public List<Machine> Machines { get; set; } = new();
        public string Scratch { get; set; } = "";
        // When the scratchpad last changed — 0 on boards that predate sync.
        public long ScratchUpdatedAt { get; set; }
        public List<GraphTombstone> Tombstones { get; set; } = new();
        // 0 on boards that predate the lifecycle statuses; bumped by migration.
        public int SchemaVersion { get; set; }
    }

    public Board Get()
    {
        lock (_gate) return new Board
        {
            Nodes = _board.Nodes.ToList(),
            Edges = _board.Edges.ToList(),
            Machines = _board.Machines.ToList(),
            Scratch = _board.Scratch,
        };
    }

    // Replaces the whole scratchpad text (length-capped). Returns what was stored.
    // A no-op write (same text) neither saves nor stamps, so idle PATCHes don't
    // churn the sync channel.
    public string SetScratch(string? text, long now)
    {
        var t = text ?? "";
        if (t.Length > MaxScratchLength) t = t[..MaxScratchLength];
        lock (_gate)
        {
            if (t == _board.Scratch) return t;
            _board.Scratch = t;
            _board.ScratchUpdatedAt = now;
            Save();
        }
        RaiseChanged();
        return t;
    }

    public Node? AddNode(string? title, string? note, string? repoId, string? machineId, double x, double y, long now,
        string? sourceId = null, string? createdBy = null, string? ideaId = null)
    {
        var clean = Clean(title, MaxTitleLength);
        if (clean is null) return null;
        var repo = CleanRepo(repoId);
        var node = new Node(
            Guid.NewGuid().ToString("N"), clean, Clean(note, MaxNoteLength),
            repo, CleanRepo(machineId), "todo", x, y, now, now,
            SourceId: repo is null ? null : CleanRepo(sourceId), AssignedBy: repo is null ? null : Clean(createdBy, 200),
            AssignedAt: repo is null ? null : now, CreatedBy: Clean(createdBy, 200), IdeaId: CleanRepo(ideaId));
        node = Normalize(node);
        lock (_gate)
        {
            _board.Nodes.Add(node);
            Save();
        }
        _logger.Info($"[TASKGRAPH] Added node {node.Id}");
        // Promotion CONSUMES the source idea (openspec ideas-consume-on-promotion):
        // it leaves the Ideas list, linked to this node. Outside the graph lock so a
        // notes Save/Changed never nests under it.
        if (node.IdeaId is { Length: > 0 } promotedIdea) _notes?.Consume(promotedIdea, node.Id, now);
        RaiseChanged();
        return node;
    }

    // Partial update: only non-null fields are applied. `status` is validated;
    // `repoId` of empty string clears the link. Returns null if the id is unknown
    // (or a supplied title is blank / status invalid).
    public Node? UpdateNode(string id, string? title, string? note, string? repoId, string? machineId, string? status, double? x, double? y, long now)
    {
        Node? updated = UpdateNodeCore(id, title, note, repoId, machineId, status, x, y, now);
        if (updated is not null) RaiseChanged();
        return updated;
    }

    private Node? UpdateNodeCore(string id, string? title, string? note, string? repoId, string? machineId, string? status, double? x, double? y, long now)
    {
        lock (_gate)
        {
            var i = _board.Nodes.FindIndex(n => n.Id == id);
            if (i < 0) return null;
            var cur = _board.Nodes[i];

            string newTitle = cur.Title;
            if (title is not null)
            {
                var clean = Clean(title, MaxTitleLength);
                if (clean is null) return null;
                newTitle = clean;
            }
            string? newNote = note is null ? cur.Note : Clean(note, MaxNoteLength);
            string? newMachine = machineId is null ? cur.MachineId : CleanRepo(machineId);
            string newStatus = cur.Status;
            if (status is not null)
            {
                if (!Statuses.Contains(status)) return null;
                newStatus = status;
            }

            // The assignee set (openspec task-multi-assignee): a repoId here is the legacy
            // single-assignee write (the graph's picker, the tasks agent) — it REPLACES the
            // set with that one agent on this harness, or clears it when blank.
            var list = AssigneesOf(cur).ToList();
            if (repoId is not null)
            {
                var repo = CleanRepo(repoId);
                list = repo is null ? new List<Assignee>() : ReplaceSet(list, new[] { ((string?)null, repo) }, cur.AssignedBy, now, cur.Status, resetDispatch: false);
            }
            // The card moves to exactly what was asked (openspec board-claims-advisory), and
            // a status set on the card is set on EVERY assignee; each keeps its own badge —
            // whether the harness has verified that much for that agent.
            if (status is not null)
                list = list.Select(a => a.Status == newStatus ? a : a with { Status = newStatus, Warning = TaskLifecycle.WarningFor(newStatus, a.VerifiedStatus, a.Pushed), UpdatedAt = now }).ToList();

            var baseNode = cur with { Title = newTitle, Note = newNote, MachineId = newMachine, X = x ?? cur.X, Y = y ?? cur.Y, UpdatedAt = now };
            var updated = list.Count > 0
                ? WithAssignees(baseNode, list)
                : (repoId is not null ? WithAssignees(baseNode, list) : baseNode) with
                {
                    Status = newStatus,
                    Warning = newStatus == cur.Status ? cur.Warning : TaskLifecycle.WarningFor(newStatus, cur.VerifiedStatus, cur.Pushed),
                };
            _board.Nodes[i] = updated;
            Save();
            return updated;
        }
    }

    /// <summary>Assign (or unassign with a blank repoId) a task to a repo agent:
    /// <paramref name="sourceId"/> names the harness (null/blank = this one). A done
    /// task stays done; a todo task stays todo — assignment is who, status is where.</summary>
    public Node? Assign(string id, string? sourceId, string? repoId, string? by, long now)
    {
        var repo = CleanRepo(repoId);
        return SetAssignees(id, repo is null ? Array.Empty<(string?, string)>() : new[] { (CleanRepo(sourceId), repo) }, by, now, resetDispatch: true);
    }

    /// <summary>Replace the assignee set (openspec task-multi-assignee): agents already on
    /// the card keep their state, new ones start at the card's current status, dropped
    /// ones leave. Empty = unassigned (the card's status and linkage stay).</summary>
    public Node? SetAssignees(string id, IEnumerable<(string? SourceId, string RepoId)> wanted, string? by, long now, bool resetDispatch = false)
    {
        Node? updated;
        lock (_gate)
        {
            var i = _board.Nodes.FindIndex(n => n.Id == id);
            if (i < 0) return null;
            var cur = _board.Nodes[i];
            var clean = wanted.Where(w => !string.IsNullOrWhiteSpace(w.RepoId)).Select(w => (w.SourceId, w.RepoId.Trim())).ToList();
            var list = ReplaceSet(AssigneesOf(cur), clean, by, now, cur.Status, resetDispatch);
            updated = WithAssignees(cur with { UpdatedAt = now }, list);
            _board.Nodes[i] = updated;
            Save();
        }
        _logger.Info($"[TASKGRAPH] Assigned node {id} -> {(updated.RepoId is null ? "nobody" : string.Join(" + ", AssigneesOf(updated).Select(a => $"{a.SourceId ?? "self"}/{a.RepoId}")))} by {by ?? "?"}");
        RaiseChanged();
        return updated;
    }

    /// <summary>Add one repo agent to the card's assignees (no-op when present).</summary>
    public Node? AddAssignee(string id, string? sourceId, string repoId, string? by, long now)
    {
        var cur = Find(id);
        if (cur is null) return null;
        var set = AssigneesOf(cur).Select(a => (a.SourceId, a.RepoId)).ToList();
        set.Add((CleanRepo(sourceId), repoId.Trim()));
        return SetAssignees(id, set, by, now);
    }

    /// <summary>Remove one repo agent from the card's assignees; the last one leaving
    /// unassigns the card.</summary>
    public Node? RemoveAssignee(string id, string? sourceId, string repoId, string? by, long now)
    {
        var cur = Find(id);
        if (cur is null) return null;
        var key = AssigneeKey(CleanRepo(sourceId), repoId.Trim());
        var set = AssigneesOf(cur).Where(a => a.Key != key).Select(a => (a.SourceId, a.RepoId)).ToList();
        return SetAssignees(id, set, by, now);
    }

    /// <summary>Set ONE assignee's status (openspec task-multi-assignee): that agent's card
    /// state moves exactly as asked, its badge follows its own verified state, and the
    /// parent re-aggregates. Null for an unknown node or assignee.</summary>
    public Node? SetAssigneeStatus(string id, string assigneeKey, string status, long now)
    {
        if (!Statuses.Contains(status)) return null;
        Node? updated;
        lock (_gate)
        {
            var i = _board.Nodes.FindIndex(n => n.Id == id);
            if (i < 0) return null;
            var cur = _board.Nodes[i];
            var list = AssigneesOf(cur).ToList();
            var j = list.FindIndex(a => a.Key == assigneeKey);
            if (j < 0) return null;
            var a = list[j];
            list[j] = a with { Status = status, Warning = TaskLifecycle.WarningFor(status, a.VerifiedStatus, a.Pushed), UpdatedAt = now };
            updated = WithAssignees(cur with { UpdatedAt = now }, list);
            _board.Nodes[i] = updated;
            Save();
        }
        RaiseChanged();
        return updated;
    }

    /// <summary>Which assignee a per-agent operation means: the given key when present; with
    /// no key the PRIMARY (first) assignee. Null when the node has no such assignee.</summary>
    private static int AssigneeIndex(IReadOnlyList<Assignee> list, string? key)
    {
        if (list.Count == 0) return -1;
        return key is null ? 0 : list.ToList().FindIndex(a => a.Key == key);
    }

    /// <summary>Record that the assignee was pinged with this task (openspec
    /// task-board-kanban): the task moves to <c>doing</c> — the agent has it now.</summary>
    public Node? MarkDispatched(string id, long now) => MarkDispatched(id, null, now);

    /// <summary>The same for ONE assignee (openspec task-multi-assignee); null key = every
    /// assignee (the legacy whole-card ping). Raise-only to doing per assignee.</summary>
    public Node? MarkDispatched(string id, string? assigneeKey, long now)
    {
        Node? updated;
        lock (_gate)
        {
            var i = _board.Nodes.FindIndex(n => n.Id == id);
            if (i < 0) return null;
            var cur = _board.Nodes[i];
            var list = AssigneesOf(cur).ToList();
            if (list.Count == 0)
            {
                // Raise-only to doing: a re-ping must not demote a card the harness
                // already verified as committed or further (openspec kanban-lifecycle-columns).
                var status = TaskLifecycle.Rank(cur.Status) >= TaskLifecycle.Rank(TaskLifecycle.Doing) ? cur.Status : TaskLifecycle.Doing;
                updated = cur with { DispatchedAt = now, DispatchCount = cur.DispatchCount + 1, Status = status, UpdatedAt = now };
            }
            else
            {
                if (assigneeKey is not null && list.All(a => a.Key != assigneeKey)) return null;
                for (var j = 0; j < list.Count; j++)
                {
                    var a = list[j];
                    if (assigneeKey is not null && a.Key != assigneeKey) continue;
                    var status = TaskLifecycle.Rank(a.Status) >= TaskLifecycle.Rank(TaskLifecycle.Doing) ? a.Status : TaskLifecycle.Doing;
                    list[j] = a with { DispatchedAt = now, DispatchCount = a.DispatchCount + 1, Status = status, Warning = status == a.Status ? a.Warning : TaskLifecycle.WarningFor(status, a.VerifiedStatus, a.Pushed), UpdatedAt = now };
                }
                updated = WithAssignees(cur with { UpdatedAt = now }, list);
            }
            _board.Nodes[i] = updated;
            Save();
        }
        RaiseChanged();
        return updated;
    }

    public Node? Find(string id) { lock (_gate) return _board.Nodes.FirstOrDefault(n => n.Id == id); }

    /// <summary>Store an agent's relayed claim of where its work lives (openspec
    /// kanban-lifecycle-columns): branch, head commit, PR URL. Claims tell the
    /// verifier where to look; the status is moved separately through
    /// <see cref="UpdateNode"/>. Null arguments leave the stored value; a claim never
    /// erases linkage.</summary>
    public Node? RecordClaim(string id, string? branch, string? commit, string? prUrl, long now) => RecordClaim(id, null, branch, commit, prUrl, now);

    /// <summary>The same for ONE assignee (openspec task-multi-assignee); null key = the
    /// primary assignee, or the card itself when it has none.</summary>
    public Node? RecordClaim(string id, string? assigneeKey, string? branch, string? commit, string? prUrl, long now)
    {
        Node? updated;
        lock (_gate)
        {
            var i = _board.Nodes.FindIndex(n => n.Id == id);
            if (i < 0) return null;
            var cur = _board.Nodes[i];
            var list = AssigneesOf(cur).ToList();
            var j = AssigneeIndex(list, assigneeKey);
            if (j < 0 && assigneeKey is not null) return null;
            if (j < 0)
            {
                updated = cur with
                {
                    Branch = Clean(branch, 400) ?? cur.Branch,
                    HeadCommit = Clean(commit, 64) ?? cur.HeadCommit,
                    PrUrl = Clean(prUrl, 400) ?? cur.PrUrl,
                    UpdatedAt = now,
                };
                if ((updated with { UpdatedAt = cur.UpdatedAt }).Equals(cur)) return cur;
            }
            else
            {
                var a = list[j];
                var b = a with { Branch = Clean(branch, 400) ?? a.Branch, HeadCommit = Clean(commit, 64) ?? a.HeadCommit, PrUrl = Clean(prUrl, 400) ?? a.PrUrl };
                if (b == a) return cur;
                list[j] = b with { UpdatedAt = now };
                updated = WithAssignees(cur with { UpdatedAt = now }, list);
            }
            _board.Nodes[i] = updated;
            Save();
        }
        RaiseChanged();
        return updated;
    }

    /// <summary>Apply what the verifier observed (openspec kanban-lifecycle-columns,
    /// board-claims-advisory): records the facts, advances the status FORWARD ONLY — an
    /// observation never demotes a card (a branch deleted after its merge must not
    /// un-merge the task) — and recomputes the badge: a card whose status is above the
    /// verified state keeps its warning, one the facts have caught up with sheds it.
    /// Saves and stamps <c>UpdatedAt</c> only when something actually changed, so an
    /// idle card can go stale and sync doesn't churn.</summary>
    public Node? ApplyVerification(string id, TaskLifecycle.Facts facts, long now) => ApplyVerification(id, null, facts, now);

    /// <summary>The same for ONE assignee (openspec task-multi-assignee): the facts are that
    /// agent's branch/PR, its state advances forward only and its badge follows; the
    /// parent re-aggregates. Null key = the primary assignee (or the card itself when it
    /// has none).</summary>
    public Node? ApplyVerification(string id, string? assigneeKey, TaskLifecycle.Facts facts, long now)
    {
        Node? updated;
        bool changed;
        lock (_gate)
        {
            var i = _board.Nodes.FindIndex(n => n.Id == id);
            if (i < 0) return null;
            var cur = _board.Nodes[i];
            var observed = TaskLifecycle.FromFacts(facts);
            var list = AssigneesOf(cur).ToList();
            var j = AssigneeIndex(list, assigneeKey);
            if (j < 0 && assigneeKey is not null) return null;
            string from;
            if (j < 0)
            {
                from = cur.Status;
                var newStatus = observed is not null && TaskLifecycle.Rank(observed) > TaskLifecycle.Rank(cur.Status) ? observed : cur.Status;
                var newVerified = observed is not null && TaskLifecycle.Rank(observed) > TaskLifecycle.Rank(cur.VerifiedStatus) ? observed : cur.VerifiedStatus;
                updated = cur with
                {
                    Status = newStatus,
                    HeadCommit = facts.HeadCommit ?? cur.HeadCommit,
                    Pushed = facts.BranchExists ? facts.OnOrigin : cur.Pushed,
                    PrUrl = facts.PrUrl ?? cur.PrUrl,
                    PrNumber = facts.PrNumber ?? cur.PrNumber,
                    MergeCommit = facts.MergeCommit ?? cur.MergeCommit,
                    VerifiedStatus = newVerified,
                };
                // Advisory badge (openspec board-claims-advisory): null once the verified state
                // covers the card's status, else the claim-vs-verified line.
                updated = updated with { Warning = TaskLifecycle.WarningFor(updated.Status, updated.VerifiedStatus, updated.Pushed) };
                changed = !updated.Equals(cur);
                if (changed) updated = updated with { UpdatedAt = now, VerifiedAt = now };
            }
            else
            {
                var a = list[j];
                from = a.Status;
                var newStatus = observed is not null && TaskLifecycle.Rank(observed) > TaskLifecycle.Rank(a.Status) ? observed : a.Status;
                var newVerified = observed is not null && TaskLifecycle.Rank(observed) > TaskLifecycle.Rank(a.VerifiedStatus) ? observed : a.VerifiedStatus;
                var b = a with
                {
                    Status = newStatus,
                    HeadCommit = facts.HeadCommit ?? a.HeadCommit,
                    Pushed = facts.BranchExists ? facts.OnOrigin : a.Pushed,
                    PrUrl = facts.PrUrl ?? a.PrUrl,
                    PrNumber = facts.PrNumber ?? a.PrNumber,
                    MergeCommit = facts.MergeCommit ?? a.MergeCommit,
                    VerifiedStatus = newVerified,
                };
                b = b with { Warning = TaskLifecycle.WarningFor(b.Status, b.VerifiedStatus, b.Pushed) };
                changed = b != a;
                if (changed) list[j] = b with { UpdatedAt = now, VerifiedAt = now };
                updated = changed ? WithAssignees(cur with { UpdatedAt = now }, list) : cur;
            }
            if (changed)
            {
                _board.Nodes[i] = updated;
                Save();
                _logger.Info($"[TASKGRAPH] Verified node {id}{(j >= 0 && list.Count > 1 ? $" [{list[j].RepoId}]" : "")}: {from} -> {(j >= 0 ? list[j].Status : updated.Status)} (card {updated.Status}, pushed={(j >= 0 ? list[j].Pushed : updated.Pushed)}, pr={(j >= 0 ? list[j].PrNumber : updated.PrNumber)?.ToString() ?? "-"})");
            }
        }
        if (changed) RaiseChanged();
        return updated;
    }

    /// <summary>Stale = committed/pr-opened with no activity past the configured
    /// window — an unpushed branch or an open PR nobody is moving.</summary>
    public bool IsStale(Node n, long now)
    {
        var list = AssigneesOf(n);
        return list.Count == 0
            ? TaskLifecycle.IsStale(n.Status, n.UpdatedAt, now, StaleAfterMs)
            : list.Any(a => IsStale(a, now));
    }

    /// <summary>The stale guard for one assignee (openspec task-multi-assignee): its own
    /// hand-off state and its own last activity.</summary>
    public bool IsStale(Assignee a, long now) => TaskLifecycle.IsStale(a.Status, a.UpdatedAt, now, StaleAfterMs);

    /// <summary>The prerequisites of a task (the targets of its depends-on edges).</summary>
    public List<Node> Prerequisites(string id)
    {
        lock (_gate)
        {
            var targets = _board.Edges.Where(e => e.Source == id).Select(e => e.Target).ToHashSet(StringComparer.Ordinal);
            return _board.Nodes.Where(n => targets.Contains(n.Id)).ToList();
        }
    }

    /// <summary>Blocked = not delivered and at least one prerequisite is not
    /// delivered (pr-merged/done). A flag, never a column.</summary>
    public bool IsBlocked(string id) => Find(id) is { } n && !TaskLifecycle.IsDelivered(n.Status) && Prerequisites(id).Any(p => !TaskLifecycle.IsDelivered(p.Status));

    // Removes a node and any edges touching it, tombstoning the node AND those
    // edges so neither resurrects from a sync peer. Returns the count of edges
    // dropped, or -1 if the node id was unknown.
    public int DeleteNode(string id, long now)
    {
        int dropped;
        string? ideaId;
        lock (_gate)
        {
            var node = _board.Nodes.FirstOrDefault(n => n.Id == id);
            if (node is null) return -1;
            ideaId = node.IdeaId;
            _board.Nodes.RemoveAll(n => n.Id == id);
            var deadEdges = _board.Edges.Where(e => e.Source == id || e.Target == id).ToList();
            _board.Edges.RemoveAll(e => e.Source == id || e.Target == id);
            AddTombstone(id, now);
            foreach (var e in deadEdges) AddTombstone(e.Id, now);
            Save();
            dropped = deadEdges.Count;
        }
        _logger.Info($"[TASKGRAPH] Deleted node {id} (+{dropped} edge(s))");
        // Deleting a task RESTORES the idea it was promoted from, as inactive (openspec
        // ideas-consume-on-promotion). Only when THIS node is the one that consumed it;
        // completing/merging a task is a status change, never a delete, so it keeps the
        // idea consumed. Outside the graph lock.
        if (ideaId is { Length: > 0 }) _notes?.Unconsume(ideaId, id, now);
        RaiseChanged();
        return dropped;
    }

    /// <summary>Every node→idea promotion link (openspec ideas-consume-on-promotion):
    /// idea id → the task node id that promoted it, for the startup consumed-idea
    /// migration. Ties (two nodes on one idea, only possible after a cross-box merge)
    /// keep the first.</summary>
    public IReadOnlyDictionary<string, string> IdeaTaskLinks()
    {
        lock (_gate)
        {
            var map = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var n in _board.Nodes)
                if (n.IdeaId is { Length: > 0 } ideaId) map.TryAdd(ideaId, n.Id);
            return map;
        }
    }

    // --- machine boxes (plans/taskgraph-machine-groups.md) ---

    public Machine? AddMachine(string? name, double? x, double? y, double? w, double? h, long now)
    {
        var clean = Clean(name, MaxMachineNameLength) ?? "machine";
        var machine = new Machine(
            Guid.NewGuid().ToString("N"), clean,
            x ?? 0, y ?? 0,
            w is > 0 ? w.Value : DefaultMachineW,
            h is > 0 ? h.Value : DefaultMachineH,
            now, now);
        lock (_gate)
        {
            _board.Machines.Add(machine);
            Save();
        }
        _logger.Info($"[TASKGRAPH] Added machine {machine.Id}");
        RaiseChanged();
        return machine;
    }

    // Partial update of a box: only non-null fields apply. A supplied blank name
    // is rejected (returns null). Returns null if the id is unknown.
    public Machine? UpdateMachine(string id, string? name, double? x, double? y, double? w, double? h, long now)
    {
        Machine? updated = UpdateMachineCore(id, name, x, y, w, h, now);
        if (updated is not null) RaiseChanged();
        return updated;
    }

    private Machine? UpdateMachineCore(string id, string? name, double? x, double? y, double? w, double? h, long now)
    {
        lock (_gate)
        {
            var i = _board.Machines.FindIndex(m => m.Id == id);
            if (i < 0) return null;
            var cur = _board.Machines[i];

            string newName = cur.Name;
            if (name is not null)
            {
                var clean = Clean(name, MaxMachineNameLength);
                if (clean is null) return null;
                newName = clean;
            }

            var updated = cur with
            {
                Name = newName,
                X = x ?? cur.X,
                Y = y ?? cur.Y,
                W = w is > 0 ? w.Value : cur.W,
                H = h is > 0 ? h.Value : cur.H,
                UpdatedAt = now,
            };
            _board.Machines[i] = updated;
            Save();
            return updated;
        }
    }

    // Removes a machine box and DETACHES its member nodes (sets their MachineId
    // null) — a box is an organizing overlay, not an owner of the work. A member
    // node's stored {X,Y} is relative to its box, so on detach we translate it
    // back to absolute canvas coords (add the box's origin) — otherwise the node
    // would jump to near (0,0) on the next reload. The box is tombstoned and the
    // detached nodes are stamped so the detachment wins over stale sync copies.
    // Returns the count of nodes detached, or -1 if the machine id was unknown.
    public int DeleteMachine(string id, long now)
    {
        int detached;
        lock (_gate)
        {
            var m = _board.Machines.FirstOrDefault(x => x.Id == id);
            if (m is null) return -1;
            _board.Machines.RemoveAll(x => x.Id == id);
            AddTombstone(id, now);
            detached = 0;
            for (var i = 0; i < _board.Nodes.Count; i++)
            {
                if (_board.Nodes[i].MachineId == id)
                {
                    var n = _board.Nodes[i];
                    _board.Nodes[i] = n with { MachineId = null, X = n.X + m.X, Y = n.Y + m.Y, UpdatedAt = now };
                    detached++;
                }
            }
            Save();
        }
        _logger.Info($"[TASKGRAPH] Deleted machine {id} (detached {detached} node(s))");
        RaiseChanged();
        return detached;
    }

    public enum EdgeError { None, MissingNode, SelfLoop, Duplicate, Cycle }

    // Adds a Source->Target ("Source depends on Target") edge, refusing self-loops,
    // duplicates, and any edge that would create a dependency cycle.
    public (Edge? edge, EdgeError error) AddEdge(string? source, string? target, long now)
    {
        var s = (source ?? "").Trim();
        var t = (target ?? "").Trim();
        Edge edge;
        lock (_gate)
        {
            if (s.Length == 0 || t.Length == 0
                || _board.Nodes.All(n => n.Id != s) || _board.Nodes.All(n => n.Id != t))
                return (null, EdgeError.MissingNode);
            if (s == t) return (null, EdgeError.SelfLoop);
            if (_board.Edges.Any(e => e.Source == s && e.Target == t)) return (null, EdgeError.Duplicate);
            // A cycle would form if Target already depends (transitively) on Source.
            if (DependsOn(t, s)) return (null, EdgeError.Cycle);

            edge = new Edge(Guid.NewGuid().ToString("N"), s, t);
            _board.Edges.Add(edge);
            Save();
        }
        _logger.Info($"[TASKGRAPH] Added edge {s} -> {t}");
        RaiseChanged();
        return (edge, EdgeError.None);
    }

    // Removes an edge and tombstones it. A tombstoned edge id is dead forever —
    // re-adding the same dependency mints a new id, so no revival rule exists.
    public bool DeleteEdge(string id, long now)
    {
        bool removed;
        lock (_gate)
        {
            removed = _board.Edges.RemoveAll(e => e.Id == id) > 0;
            if (removed)
            {
                AddTombstone(id, now);
                Save();
            }
        }
        if (removed) { _logger.Info($"[TASKGRAPH] Deleted edge {id}"); RaiseChanged(); }
        return removed;
    }

    // --- sync layer (openspec sync-task-graph) ---

    /// <summary>Copy of the whole graph (elements + scratch + tombstones) for the
    /// sync layer.</summary>
    public GraphSnapshot Snapshot()
    {
        lock (_gate) return new GraphSnapshot(
            new List<Node>(_board.Nodes), new List<Edge>(_board.Edges),
            new List<Machine>(_board.Machines), _board.Scratch,
            _board.ScratchUpdatedAt, new List<GraphTombstone>(_board.Tombstones));
    }

    /// <summary>
    /// Merges a remote graph into the local one (openspec sync-task-graph).
    /// Nodes and machines merge per id with newest-UpdatedAt-wins (local wins
    /// ties), tombstones union with newest-DeletedAt-wins; a tombstone at or
    /// after an element's UpdatedAt suppresses it, a later edit revives it.
    /// Edges (immutable) merge as the union minus tombstoned ids, then a
    /// canonical validity rebuild in id order drops edges referencing missing
    /// nodes, self-loops, duplicate pairs, and cycle-formers — deterministic on
    /// identical input, so every peer converges on the same edge set. Scratch is
    /// LWW by ScratchUpdatedAt; an exact tie with differing text joins both
    /// sides in ordinal order (and bumps the stamp so peers adopt the join via
    /// plain LWW instead of re-joining forever). A null remote (older peer's
    /// store without a graph section) merges as empty — pure union, nothing
    /// local is lost. Deterministic and commutative, used by both pull-merge and
    /// push-merge. Saves when local state changed. Does NOT raise Changed.
    /// </summary>
    public MergeOutcome MergeFrom(GraphSnapshot? remote)
    {
        var r = remote ?? new GraphSnapshot(null, null, null, null, 0, null);
        var rNodes = r.Nodes ?? new List<Node>();
        var rEdges = r.Edges ?? new List<Edge>();
        var rMachines = r.Machines ?? new List<Machine>();
        var rTombstones = r.Tombstones ?? new List<GraphTombstone>();
        var rScratch = r.Scratch ?? "";
        lock (_gate)
        {
            // Tombstones: union by id, newest DeletedAt wins.
            var tombs = new Dictionary<string, long>();
            foreach (var t in _board.Tombstones) tombs[t.Id] = Math.Max(t.DeletedAt, tombs.GetValueOrDefault(t.Id));
            foreach (var t in rTombstones) tombs[t.Id] = Math.Max(t.DeletedAt, tombs.GetValueOrDefault(t.Id));

            var mergedNodes = MergeById(_board.Nodes, rNodes, n => n.Id, n => n.UpdatedAt, n => n.CreatedAt, tombs);
            // A peer on an older build writes cards without the assignee list: read the
            // legacy fields as the one assignee (openspec task-multi-assignee).
            for (var i = 0; i < mergedNodes.Count; i++) mergedNodes[i] = Normalize(mergedNodes[i]);
            var mergedMachines = MergeById(_board.Machines, rMachines, m => m.Id, m => m.UpdatedAt, m => m.CreatedAt, tombs);

            // A node whose box didn't survive the merge is detached in place —
            // a dangling MachineId must never reach the frontend.
            var machineIds = new HashSet<string>(mergedMachines.Select(m => m.Id));
            for (var i = 0; i < mergedNodes.Count; i++)
                if (mergedNodes[i].MachineId is { } mid && !machineIds.Contains(mid))
                    mergedNodes[i] = mergedNodes[i] with { MachineId = null };

            // Edges: union minus tombstoned ids, canonical validity rebuild.
            var nodeIds = new HashSet<string>(mergedNodes.Select(n => n.Id));
            var union = new Dictionary<string, Edge>();
            foreach (var e in _board.Edges) union[e.Id] = e;
            foreach (var e in rEdges) union.TryAdd(e.Id, e);
            var mergedEdges = new List<Edge>();
            var pairs = new HashSet<(string, string)>();
            foreach (var e in union.Values.OrderBy(e => e.Id, StringComparer.Ordinal))
            {
                if (tombs.ContainsKey(e.Id)) continue;
                if (!nodeIds.Contains(e.Source) || !nodeIds.Contains(e.Target)) continue;
                if (e.Source == e.Target) continue;
                if (!pairs.Add((e.Source, e.Target))) continue;
                if (Reaches(mergedEdges, e.Target, e.Source)) continue; // would close a cycle
                mergedEdges.Add(e);
            }

            // Scratch: LWW by stamp; exact tie with differing text joins both.
            var scratch = _board.Scratch;
            var scratchAt = _board.ScratchUpdatedAt;
            if (r.ScratchUpdatedAt > scratchAt)
            {
                scratch = rScratch;
                scratchAt = r.ScratchUpdatedAt;
            }
            else if (r.ScratchUpdatedAt == scratchAt && rScratch != scratch)
            {
                if (string.IsNullOrWhiteSpace(scratch)) scratch = rScratch;
                else if (!string.IsNullOrWhiteSpace(rScratch))
                {
                    var (first, second) = string.CompareOrdinal(scratch, rScratch) <= 0
                        ? (scratch, rScratch) : (rScratch, scratch);
                    scratch = first + "\n\n---\n\n" + second;
                }
                scratchAt++;
            }

            var mergedTombs = tombs.Select(kv => new GraphTombstone(kv.Key, kv.Value))
                .OrderBy(t => t.Id, StringComparer.Ordinal).ToList();

            var localChanged =
                !mergedNodes.SequenceEqual(_board.Nodes) ||
                !mergedEdges.SequenceEqual(_board.Edges) ||
                !mergedMachines.SequenceEqual(_board.Machines) ||
                scratch != _board.Scratch || scratchAt != _board.ScratchUpdatedAt;
            var tombsChanged = !mergedTombs.SequenceEqual(_board.Tombstones.OrderBy(t => t.Id, StringComparer.Ordinal));

            // Push needed when the merged graph holds anything the remote side
            // lacked (including a validity correction of the remote edge set).
            // Canonical comparison; a false positive only costs a redundant push.
            var remoteStale =
                !Canonical(mergedNodes, n => n.Id).SequenceEqual(Canonical(
                    rNodes.Where(n => !(tombs.TryGetValue(n.Id, out var dead) && dead >= n.UpdatedAt)), n => n.Id)) ||
                !Canonical(mergedMachines, m => m.Id).SequenceEqual(Canonical(
                    rMachines.Where(m => !(tombs.TryGetValue(m.Id, out var dead) && dead >= m.UpdatedAt)), m => m.Id)) ||
                !Canonical(mergedEdges, e => e.Id).SequenceEqual(Canonical(
                    rEdges.Where(e => !tombs.ContainsKey(e.Id)), e => e.Id)) ||
                scratch != rScratch || scratchAt != r.ScratchUpdatedAt ||
                !mergedTombs.SequenceEqual(rTombstones.OrderBy(t => t.Id, StringComparer.Ordinal));

            if (localChanged || tombsChanged)
            {
                _board.Nodes = mergedNodes;
                _board.Edges = mergedEdges;
                _board.Machines = mergedMachines;
                _board.Scratch = scratch;
                _board.ScratchUpdatedAt = scratchAt;
                _board.Tombstones = mergedTombs;
                Save();
                _logger.Info($"[TASKGRAPH] Merged remote graph ({mergedNodes.Count} node(s), {mergedEdges.Count} edge(s), {mergedMachines.Count} machine(s), {mergedTombs.Count} tombstone(s))");
            }
            return new MergeOutcome(localChanged, remoteStale);
        }
    }

    // Per-id LWW merge shared by nodes and machines: local order kept, per-id
    // newer UpdatedAt wins (local on tie), remote-only elements append in
    // CreatedAt order, then the tombstone filter.
    private static List<T> MergeById<T>(
        List<T> local, List<T> remote,
        Func<T, string> id, Func<T, long> updatedAt, Func<T, long> createdAt,
        Dictionary<string, long> tombs)
    {
        var remoteById = new Dictionary<string, T>();
        foreach (var r in remote) remoteById[id(r)] = r;
        var localIds = new HashSet<string>(local.Select(id));
        return local
            .Select(n => remoteById.TryGetValue(id(n), out var r) && updatedAt(r) > updatedAt(n) ? r : n)
            .Concat(remote.Where(r => !localIds.Contains(id(r))).OrderBy(createdAt))
            .Where(n => !(tombs.TryGetValue(id(n), out var dead) && dead >= updatedAt(n)))
            .ToList();
    }

    private static IEnumerable<T> Canonical<T>(IEnumerable<T> items, Func<T, string> id)
        => items.OrderBy(id, StringComparer.Ordinal);

    // Caller holds _gate. Deletion marker for any element id (GUIDs — one
    // namespace across nodes, edges, and machines).
    private void AddTombstone(string id, long now)
    {
        _board.Tombstones.RemoveAll(t => t.Id == id);
        _board.Tombstones.Add(new GraphTombstone(id, now));
    }

    private void RaiseChanged()
    {
        try { Changed?.Invoke(); }
        catch (Exception ex) { _logger.Error($"[TASKGRAPH] Changed handler failed: {ex.Message}"); }
    }

    // Does `from` reach `to` by following dependency edges (Source->Target)?
    // Caller holds _gate.
    private bool DependsOn(string from, string to) => Reaches(_board.Edges, from, to);

    private static bool Reaches(List<Edge> edges, string from, string to)
    {
        var seen = new HashSet<string>();
        var stack = new Stack<string>();
        stack.Push(from);
        while (stack.Count > 0)
        {
            var cur = stack.Pop();
            if (cur == to) return true;
            if (!seen.Add(cur)) continue;
            foreach (var e in edges)
                if (e.Source == cur) stack.Push(e.Target);
        }
        return false;
    }

    private static string? Clean(string? text, int max)
    {
        if (string.IsNullOrWhiteSpace(text)) return null;
        var t = text.Trim();
        return t.Length > max ? t[..max] : t;
    }

    private static string? CleanRepo(string? repoId)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return null;
        return repoId.Trim();
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var board = JsonSerializer.Deserialize<Board>(File.ReadAllText(_path));
            if (board is not null)
            {
                // Legacy files (pre-sync) lack the sync fields; explicit nulls
                // normalize to empties so the merge layer never sees null.
                board.Nodes ??= new List<Node>();
                board.Edges ??= new List<Edge>();
                board.Machines ??= new List<Machine>();
                board.Scratch ??= "";
                board.Tombstones ??= new List<GraphTombstone>();
                _board = board;
                MigrateToLifecycle();
                // Every card's assignee list made explicit (openspec task-multi-assignee);
                // in memory only — the next write persists it, so idle boards do not churn.
                for (var i = 0; i < _board.Nodes.Count; i++) _board.Nodes[i] = Normalize(_board.Nodes[i]);
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[TASKGRAPH] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
        }
    }

    /// <summary>One-time migration to the lifecycle statuses (openspec
    /// kanban-lifecycle-columns, amended by board-claims-advisory, schema 2): a card
    /// keeps its status — nothing is downgraded — and a "done" without merge evidence
    /// on the card gets the advisory badge until the verifier finds its merge. Runs
    /// from Load, before any reader; idempotent via the schema stamp.</summary>
    private void MigrateToLifecycle()
    {
        if (_board.SchemaVersion >= CurrentSchemaVersion) return;
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var migrated = 0;
        for (var i = 0; i < _board.Nodes.Count; i++)
        {
            var n = _board.Nodes[i];
            var evidence = n.MergeCommit is not null || (n.PrNumber is not null && TaskLifecycle.IsDelivered(n.VerifiedStatus));
            var (status, warn) = TaskLifecycle.MigrateStatus(n.Status, evidence);
            if (status == n.Status && !warn) continue;
            _board.Nodes[i] = n with
            {
                Status = status,
                Warning = warn ? TaskLifecycle.WarningFor(status, n.VerifiedStatus, n.Pushed) : n.Warning,
                UpdatedAt = now,
            };
            migrated++;
        }
        _board.SchemaVersion = CurrentSchemaVersion;
        Save();
        if (migrated > 0) _logger.Info($"[TASKGRAPH] Lifecycle migration: {migrated} done card(s) flagged unverified (schema {CurrentSchemaVersion})");
    }

    // Caller holds _gate. Atomic temp+rename — a kill mid-write can't truncate it.
    private void Save()
    {
        try
        {
            var cutoff = DateTimeOffset.UtcNow.AddDays(-TombstoneRetentionDays).ToUnixTimeMilliseconds();
            _board.Tombstones.RemoveAll(t => t.DeletedAt < cutoff);
            var tmp = _path + ".tmp";
            File.WriteAllText(tmp, JsonSerializer.Serialize(_board, JsonOpts));
            File.Move(tmp, _path, overwrite: true);
        }
        catch (Exception ex)
        {
            _logger.Error($"[TASKGRAPH] Failed to save {_path}: {ex.Message}");
        }
    }
}
