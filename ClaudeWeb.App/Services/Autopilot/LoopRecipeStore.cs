using System.Text.Json;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// Named reusable loop templates (openspec: loop-recipes). A recipe carries everything
/// a loop needs — prompt, sentinel, iteration cap — so arming a codified loop means
/// picking a recipe, not composing a prompt from scratch. GLOBAL and backend-persisted
/// (%APPDATA%\ClaudeWeb\loop-recipes.json) so recipes are shared by every device, with
/// the same atomic temp+rename write and never-reseed-on-unreadable load guard as
/// <see cref="LoopConfigStore"/>.
///
/// On first load the store seeds the two ritual recipes ("Drive the feature",
/// "Finish and ship"). Seeding is tracked by id in <c>SeededIds</c>: once a seed id has
/// been planted it is NEVER planted again, so a user edit is never overwritten and a
/// user delete is never resurrected.
///
/// The looped-agent output contract (sentinel + <c>NEEDS_HUMAN:</c> — see
/// docs/loop-driven-agent-convention.md) is part of each seed's VISIBLE prompt text.
/// A drive-mode send wraps the recipe text with the situational briefing (openspec:
/// loop-agent-briefing) — a deterministic, operator-inspectable composition previewed
/// in the dock; the recipe editor shows the stored text that composition carries.
/// The seeds' own contract paragraph deliberately stays: suggest-mode pends deliver
/// the stored text raw, so it must remain self-sufficient (the drive-mode repeat of
/// the marker line is harmless).
/// </summary>
public class LoopRecipeStore
{
    public const int MaxPromptLength = 20_000;
    public const int MaxNameLength = 80;
    private static readonly JsonSerializerOptions JsonOpts = new() { WriteIndented = true };

    // The contract paragraph every seed recipe ends with, verbatim. Kept as one
    // constant so both seeds state the same contract as the convention doc.
    public const string ContractParagraph =
        "When the whole job is genuinely done, end your reply with LOOP_DONE as the final line. "
        + "If you are blocked on a decision only the human can make, end your reply with "
        + "NEEDS_HUMAN: <your question> and stop.";

    private readonly Logger _logger;
    private readonly string _path;
    private readonly object _gate = new();
    private Store _store = new();

    public LoopRecipeStore(Logger logger)
    {
        _logger = logger;
        var dir = AppPaths.DataDir;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, "loop-recipes.json");
        Load();
        Seed();
    }

    public sealed record Recipe(string Id, string Name, string Prompt, string Sentinel, int MaxIterations);

    private sealed class Store
    {
        // Insertion order; the API returns them in that order.
        public List<Recipe> Recipes { get; set; } = new();
        // Seed ids that have EVER been planted. A deleted or edited seed id stays
        // here, so reseeding can't overwrite or resurrect it.
        public List<string> SeededIds { get; set; } = new();
        // Seed ids the one-time honest-name migration has already visited (additive;
        // old files load with an empty list and migrate once on next start).
        public List<string> MigratedIds { get; set; } = new();
    }

    /// <summary>The whole recipe set (insertion order).</summary>
    public List<Recipe> List()
    {
        lock (_gate) return new List<Recipe>(_store.Recipes);
    }

    public Recipe? Get(string id)
    {
        lock (_gate) return _store.Recipes.FirstOrDefault(r => r.Id == id);
    }

    /// <summary>Adds a recipe. Null if name or prompt is empty.</summary>
    public Recipe? Add(string? name, string? prompt, string? sentinel, int? maxIterations)
    {
        var cleanName = CleanName(name);
        var cleanPrompt = CleanPrompt(prompt);
        if (cleanName is null || cleanPrompt is null) return null;
        var recipe = new Recipe(
            Guid.NewGuid().ToString("N"), cleanName, cleanPrompt,
            CleanSentinel(sentinel), CleanCap(maxIterations));
        lock (_gate)
        {
            _store.Recipes.Add(recipe);
            Save();
        }
        _logger.Info($"[LOOP-RECIPES] Added \"{recipe.Name}\" ({recipe.Id})");
        return recipe;
    }

    /// <summary>Edits a recipe. Null if the id is unknown or name/prompt is empty.</summary>
    public Recipe? Update(string id, string? name, string? prompt, string? sentinel, int? maxIterations)
    {
        var cleanName = CleanName(name);
        var cleanPrompt = CleanPrompt(prompt);
        if (cleanName is null || cleanPrompt is null) return null;
        lock (_gate)
        {
            var i = _store.Recipes.FindIndex(r => r.Id == id);
            if (i < 0) return null;
            var updated = new Recipe(id, cleanName, cleanPrompt, CleanSentinel(sentinel), CleanCap(maxIterations));
            _store.Recipes[i] = updated;
            Save();
            _logger.Info($"[LOOP-RECIPES] Updated \"{updated.Name}\" ({id})");
            return updated;
        }
    }

    /// <summary>Removes a recipe. False if the id is unknown. A removed seed stays
    /// removed — its id remains in SeededIds.</summary>
    public bool Delete(string id)
    {
        lock (_gate)
        {
            var removed = _store.Recipes.RemoveAll(r => r.Id == id) > 0;
            if (removed) { Save(); _logger.Info($"[LOOP-RECIPES] Deleted {id}"); }
            return removed;
        }
    }

    // The built-in recipes codifying the feature-delivery ritual, named for what they
    // drive (openspec: unify-loop-types — a recipe loop drives a ritual, so its name
    // must say which one). Stable ids so the seeded-once guard can recognize them
    // across restarts. Exact wording is a draft to be tuned from real looped runs.
    private static IEnumerable<Recipe> SeedRecipes() => new[]
    {
        new Recipe(
            "seed-drive-feature",
            "Drive the OpenSpec change",
            "Continue driving the current OpenSpec change: pick the next unchecked task in its "
            + "tasks.md, implement it, verify it actually works, and mark it complete. Commit "
            + "finished work with a clear message before moving on. Stay on the feature branch.\n\n"
            + ContractParagraph,
            "LOOP_DONE", 10),
        new Recipe(
            "seed-finish-ship",
            "Finish and ship the change",
            "Finish and ship the current work: verify the build and tests pass, update the docs "
            + "and the understanding-app so they match what is actually built, commit everything "
            + "on the feature branch, and open a pull request.\n\n"
            + ContractParagraph,
            "LOOP_DONE", 5),
    };

    // The pre-rename seed versions, kept only so Migrate() can recognize a planted
    // seed the user never touched. Prompts were unchanged by the rename, so the old
    // name plus the CURRENT prompt is the byte-identical fingerprint.
    private static readonly IReadOnlyDictionary<string, string> OldSeedNames =
        new Dictionary<string, string>
        {
            ["seed-drive-feature"] = "Drive the feature",
            ["seed-finish-ship"] = "Finish and ship",
        };

    private void Seed()
    {
        lock (_gate)
        {
            var changed = false;
            foreach (var seed in SeedRecipes())
            {
                if (!_store.SeededIds.Contains(seed.Id))
                {
                    _store.Recipes.Add(seed);
                    _store.SeededIds.Add(seed.Id);
                    changed = true;
                    _logger.Info($"[LOOP-RECIPES] Seeded \"{seed.Name}\"");
                    continue;
                }
                changed |= Migrate(seed);
            }
            if (changed) Save();
        }
    }

    // One-time honest-name migration (openspec: unify-loop-types, design D6): a
    // planted seed still byte-identical to the OLD seed (old name + unchanged prompt)
    // gets the new name; anything the user edited or deleted is left alone, and each
    // id migrates at most once so a later user rename can never be overwritten again.
    // Caller holds _gate; returns whether anything changed.
    private bool Migrate(Recipe seed)
    {
        if (_store.MigratedIds.Contains(seed.Id)) return false;
        _store.MigratedIds.Add(seed.Id);
        var i = _store.Recipes.FindIndex(r => r.Id == seed.Id);
        if (i < 0) return true; // deleted seed: just remember not to look again
        var planted = _store.Recipes[i];
        if (OldSeedNames.TryGetValue(seed.Id, out var oldName)
            && planted.Name == oldName && planted.Prompt == seed.Prompt)
        {
            _store.Recipes[i] = planted with { Name = seed.Name };
            _logger.Info($"[LOOP-RECIPES] Migrated seed \"{oldName}\" -> \"{seed.Name}\"");
        }
        return true;
    }

    private static string? CleanName(string? name)
    {
        if (string.IsNullOrWhiteSpace(name)) return null;
        var n = name.Trim();
        return n.Length > MaxNameLength ? n[..MaxNameLength] : n;
    }

    private static string? CleanPrompt(string? prompt)
    {
        if (string.IsNullOrWhiteSpace(prompt)) return null;
        var p = prompt.Trim();
        return p.Length > MaxPromptLength ? p[..MaxPromptLength] : p;
    }

    private static string CleanSentinel(string? sentinel) =>
        string.IsNullOrWhiteSpace(sentinel) ? LoopConfigStore.DefaultSentinel : sentinel.Trim();

    private static int CleanCap(int? cap) =>
        Math.Clamp(cap ?? LoopConfigStore.DefaultMaxIterations, 1, 100);

    private void Load()
    {
        try
        {
            if (!File.Exists(_path)) return;
            var store = JsonSerializer.Deserialize<Store>(File.ReadAllText(_path));
            if (store is null) return;
            store.Recipes ??= new();
            store.SeededIds ??= new();
            store.MigratedIds ??= new();
            _store = store;
        }
        catch (Exception ex)
        {
            // Unreadable file: defaults in memory, file left ALONE for forensics.
            _logger.Error($"[LOOP-RECIPES] Failed to load {_path} (using defaults, file untouched): {ex.Message}");
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
            _logger.Error($"[LOOP-RECIPES] Failed to save {_path}: {ex.Message}");
        }
    }
}
