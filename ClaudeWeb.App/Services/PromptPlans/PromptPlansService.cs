using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.PromptPlans;

/// <summary>
/// User-defined prompt PLANS (plans/prompt-plans.md) — a named, ordered list of
/// prompt STEPS the user works through in sequence. The sibling of
/// <see cref="ClaudeWeb.Services.Prompts.PromptsService"/>: GLOBAL (not per-repo)
/// and backend-synced so the personal plan library follows the user across
/// devices and projects. Persisted to %APPDATA%\ClaudeWeb\prompt-plans.json with
/// the ATOMIC temp+rename write and never-reseed-on-unreadable load guard (the
/// PromptsService/NotesService pattern). Each plan has a name and ordered steps;
/// each step has a name, a details body, and an expected result. Step ORDER is the
/// send sequence, so create/edit fully REPLACES the step list (the client reorders
/// client-side and sends the whole array).
/// </summary>
public class PromptPlansService
{
    public const int MaxNameLength = 80;
    public const int MaxStepNameLength = 120;
    public const int MaxTextLength = 20_000;
    public const int MaxSteps = 100;
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Store _store = new();

    public PromptPlansService(Logger logger)
    {
        _logger = logger;
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "prompt-plans.json");
        Load();
    }

    public sealed record PlanStep(string Name, string Details, string Expected);
    public sealed record PromptPlan(string Id, string Name, IReadOnlyList<PlanStep> Steps);

    private sealed class Store
    {
        // Insertion order; the API returns plans in that order.
        public List<PromptPlan> Plans { get; set; } = new();
    }

    /// <summary>The whole plan library (insertion order).</summary>
    public List<PromptPlan> List()
    {
        lock (_gate) return new List<PromptPlan>(_store.Plans);
    }

    /// <summary>Adds a plan. Null if the name is empty (steps may be empty — you
    /// can name a plan first and fill in steps later).</summary>
    public PromptPlan? Add(string? name, IEnumerable<PlanStep>? steps)
    {
        var cleanName = CleanName(name, MaxNameLength);
        if (cleanName is null) return null;
        var plan = new PromptPlan(Guid.NewGuid().ToString("N"), cleanName, CleanSteps(steps));
        lock (_gate)
        {
            _store.Plans.Add(plan);
            Save();
        }
        _logger.Info($"[PROMPT-PLANS] Added plan {plan.Id} ({plan.Steps.Count} steps)");
        return plan;
    }

    /// <summary>Edits a plan (name + full step list). Null if the id is unknown or
    /// the name is empty.</summary>
    public PromptPlan? Update(string id, string? name, IEnumerable<PlanStep>? steps)
    {
        var cleanName = CleanName(name, MaxNameLength);
        if (cleanName is null) return null;
        lock (_gate)
        {
            var i = _store.Plans.FindIndex(p => p.Id == id);
            if (i < 0) return null;
            var updated = new PromptPlan(id, cleanName, CleanSteps(steps));
            _store.Plans[i] = updated;
            Save();
            _logger.Info($"[PROMPT-PLANS] Updated plan {id} ({updated.Steps.Count} steps)");
            return updated;
        }
    }

    /// <summary>Removes a plan. False if the id is unknown.</summary>
    public bool Delete(string id)
    {
        lock (_gate)
        {
            var removed = _store.Plans.RemoveAll(p => p.Id == id) > 0;
            if (removed) { Save(); _logger.Info($"[PROMPT-PLANS] Deleted plan {id}"); }
            return removed;
        }
    }

    // Returns null for an empty/whitespace name (the only required field).
    private static string? CleanName(string? name, int max)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        var n = name.Trim();
        return n.Length > max ? n[..max] : n;
    }

    private static string CleanField(string? text, int max)
    {
        var t = (text ?? string.Empty).Trim();
        return t.Length > max ? t[..max] : t;
    }

    // Normalize + cap the step list; drop fully-empty steps so a stray blank row
    // doesn't get persisted. Order is preserved (it IS the send sequence).
    private static List<PlanStep> CleanSteps(IEnumerable<PlanStep>? steps)
    {
        var result = new List<PlanStep>();
        if (steps is null) return result;
        foreach (var s in steps)
        {
            var name = CleanField(s?.Name, MaxStepNameLength);
            var details = CleanField(s?.Details, MaxTextLength);
            var expected = CleanField(s?.Expected, MaxTextLength);
            if (name.Length == 0 && details.Length == 0 && expected.Length == 0) continue;
            result.Add(new PlanStep(name, details, expected));
            if (result.Count >= MaxSteps) break;
        }
        return result;
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var store = JsonSerializer.Deserialize<Store>(File.ReadAllText(_path));
            if (store?.Plans != null) _store = store;
        }
        catch (Exception ex)
        {
            // Unreadable file: defaults in memory, file left ALONE for forensics.
            _logger.Error($"[PROMPT-PLANS] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
        }
    }

    // Caller holds _gate. Atomic: temp file then rename, so a kill mid-write can
    // never leave a truncated store.
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
            _logger.Error($"[PROMPT-PLANS] Failed to save {_path}: {ex.Message}");
        }
    }
}
