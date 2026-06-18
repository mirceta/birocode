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
/// </summary>
public class TaskGraphService
{
    public const int MaxTitleLength = 2_000;
    public const int MaxNoteLength = 20_000;
    // The free-text scratchpad below the graph (an experiment: if the operator
    // reaches for this instead of the graph, the graph isn't earning its keep).
    public const int MaxScratchLength = 200_000;
    public static readonly string[] Statuses = { "todo", "doing", "done" };
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Board _board = new();

    public TaskGraphService(Logger logger)
    {
        _logger = logger;
        var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "ClaudeWeb");
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "taskgraph.json");
        Load();
    }

    // A node carries only what the dashboard needs: a title + optional note, an
    // optional repoId (shown as a label/colour — no live agent telemetry), a
    // status, and its canvas position {x,y} (the operator places nodes by hand).
    public sealed record Node(
        string Id, string Title, string? Note, string? RepoId, string Status,
        double X, double Y, long CreatedAt, long UpdatedAt);

    // Source depends on Target (Target is the prerequisite).
    public sealed record Edge(string Id, string Source, string Target);

    public sealed class Board
    {
        public List<Node> Nodes { get; set; } = new();
        public List<Edge> Edges { get; set; } = new();
        public string Scratch { get; set; } = "";
    }

    public Board Get()
    {
        lock (_gate) return new Board { Nodes = _board.Nodes.ToList(), Edges = _board.Edges.ToList(), Scratch = _board.Scratch };
    }

    // Replaces the whole scratchpad text (length-capped). Returns what was stored.
    public string SetScratch(string? text)
    {
        var t = text ?? "";
        if (t.Length > MaxScratchLength) t = t[..MaxScratchLength];
        lock (_gate)
        {
            _board.Scratch = t;
            Save();
        }
        return t;
    }

    public Node? AddNode(string? title, string? note, string? repoId, double x, double y, long now)
    {
        var clean = Clean(title, MaxTitleLength);
        if (clean is null) return null;
        var node = new Node(
            Guid.NewGuid().ToString("N"), clean, Clean(note, MaxNoteLength),
            CleanRepo(repoId), "todo", x, y, now, now);
        lock (_gate)
        {
            _board.Nodes.Add(node);
            Save();
        }
        _logger.Info($"[TASKGRAPH] Added node {node.Id}");
        return node;
    }

    // Partial update: only non-null fields are applied. `status` is validated;
    // `repoId` of empty string clears the link. Returns null if the id is unknown
    // (or a supplied title is blank / status invalid).
    public Node? UpdateNode(string id, string? title, string? note, string? repoId, string? status, double? x, double? y, long now)
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

    // Removes a node and any edges touching it. Returns the count of edges dropped,
    // or -1 if the node id was unknown.
    public int DeleteNode(string id)
    {
        lock (_gate)
        {
            if (_board.Nodes.RemoveAll(n => n.Id == id) == 0) return -1;
            var dropped = _board.Edges.RemoveAll(e => e.Source == id || e.Target == id);
            Save();
            _logger.Info($"[TASKGRAPH] Deleted node {id} (+{dropped} edge(s))");
            return dropped;
        }
    }

    public enum EdgeError { None, MissingNode, SelfLoop, Duplicate, Cycle }

    // Adds a Source->Target ("Source depends on Target") edge, refusing self-loops,
    // duplicates, and any edge that would create a dependency cycle.
    public (Edge? edge, EdgeError error) AddEdge(string? source, string? target, long now)
    {
        var s = (source ?? "").Trim();
        var t = (target ?? "").Trim();
        lock (_gate)
        {
            if (s.Length == 0 || t.Length == 0
                || _board.Nodes.All(n => n.Id != s) || _board.Nodes.All(n => n.Id != t))
                return (null, EdgeError.MissingNode);
            if (s == t) return (null, EdgeError.SelfLoop);
            if (_board.Edges.Any(e => e.Source == s && e.Target == t)) return (null, EdgeError.Duplicate);
            // A cycle would form if Target already depends (transitively) on Source.
            if (DependsOn(t, s)) return (null, EdgeError.Cycle);

            var edge = new Edge(Guid.NewGuid().ToString("N"), s, t);
            _board.Edges.Add(edge);
            Save();
            _logger.Info($"[TASKGRAPH] Added edge {s} -> {t}");
            return (edge, EdgeError.None);
        }
    }

    public bool DeleteEdge(string id)
    {
        lock (_gate)
        {
            var removed = _board.Edges.RemoveAll(e => e.Id == id) > 0;
            if (removed) { Save(); _logger.Info($"[TASKGRAPH] Deleted edge {id}"); }
            return removed;
        }
    }

    // Does `from` reach `to` by following dependency edges (Source->Target)?
    // Caller holds _gate.
    private bool DependsOn(string from, string to)
    {
        var seen = new HashSet<string>();
        var stack = new Stack<string>();
        stack.Push(from);
        while (stack.Count > 0)
        {
            var cur = stack.Pop();
            if (cur == to) return true;
            if (!seen.Add(cur)) continue;
            foreach (var e in _board.Edges)
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
            if (board is not null) _board = board;
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
