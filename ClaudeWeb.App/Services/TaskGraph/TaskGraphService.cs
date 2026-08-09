using System.Text.Json;
using ClaudeWeb.Services.Logging;

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
    public static readonly string[] Statuses = { "todo", "doing", "done" };
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Board _board = new();

    /// <summary>Raised after every successful LOCAL mutation (add/update/delete/
    /// scratch). NOT raised by MergeFrom — the sync layer must not re-trigger
    /// itself when applying remote state.</summary>
    public event Action? Changed;

    public TaskGraphService(Logger logger)
    {
        _logger = logger;
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "taskgraph.json");
        Load();
    }

    // A node carries only what the dashboard needs: a title + optional note, an
    // optional repoId (shown as a label/colour — no live agent telemetry), an
    // optional machineId (the grouping box it lives in — null = unplaced), a
    // status, and its canvas position {x,y} (the operator places nodes by hand).
    public sealed record Node(
        string Id, string Title, string? Note, string? RepoId, string? MachineId, string Status,
        double X, double Y, long CreatedAt, long UpdatedAt);

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

    public Node? AddNode(string? title, string? note, string? repoId, string? machineId, double x, double y, long now)
    {
        var clean = Clean(title, MaxTitleLength);
        if (clean is null) return null;
        var node = new Node(
            Guid.NewGuid().ToString("N"), clean, Clean(note, MaxNoteLength),
            CleanRepo(repoId), CleanRepo(machineId), "todo", x, y, now, now);
        lock (_gate)
        {
            _board.Nodes.Add(node);
            Save();
        }
        _logger.Info($"[TASKGRAPH] Added node {node.Id}");
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
            string? newRepo = repoId is null ? cur.RepoId : CleanRepo(repoId);
            string? newMachine = machineId is null ? cur.MachineId : CleanRepo(machineId);
            string newStatus = cur.Status;
            if (status is not null)
            {
                if (!Statuses.Contains(status)) return null;
                newStatus = status;
            }

            var updated = cur with
            {
                Title = newTitle,
                Note = newNote,
                RepoId = newRepo,
                MachineId = newMachine,
                Status = newStatus,
                X = x ?? cur.X,
                Y = y ?? cur.Y,
                UpdatedAt = now,
            };
            _board.Nodes[i] = updated;
            Save();
            return updated;
        }
    }

    // Removes a node and any edges touching it, tombstoning the node AND those
    // edges so neither resurrects from a sync peer. Returns the count of edges
    // dropped, or -1 if the node id was unknown.
    public int DeleteNode(string id, long now)
    {
        int dropped;
        lock (_gate)
        {
            if (_board.Nodes.RemoveAll(n => n.Id == id) == 0) return -1;
            var deadEdges = _board.Edges.Where(e => e.Source == id || e.Target == id).ToList();
            _board.Edges.RemoveAll(e => e.Source == id || e.Target == id);
            AddTombstone(id, now);
            foreach (var e in deadEdges) AddTombstone(e.Id, now);
            Save();
            dropped = deadEdges.Count;
        }
        _logger.Info($"[TASKGRAPH] Deleted node {id} (+{dropped} edge(s))");
        RaiseChanged();
        return dropped;
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
            }
        }
        catch (Exception ex)
        {
            _logger.Error($"[TASKGRAPH] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
        }
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
