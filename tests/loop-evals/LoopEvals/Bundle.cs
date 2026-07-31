using System.Text.Json;
using System.Text.Json.Serialization;

namespace ClaudeWeb.LoopEvals;

// --- manifest.json ----------------------------------------------------------

public sealed record ExampleCheck(
    [property: JsonPropertyName("name")] string Name,
    [property: JsonPropertyName("command")] string Command);

public sealed record ExampleTurnRef(
    [property: JsonPropertyName("index")] int Index,
    [property: JsonPropertyName("commitSha")] string? CommitSha);

public sealed record LoopSeed(
    [property: JsonPropertyName("mode")] string Mode,          // "plan" | "items"
    [property: JsonPropertyName("items")] List<string>? Items);

public sealed record LoopHints(
    [property: JsonPropertyName("kind")] string Kind,          // first supported: "queue"
    [property: JsonPropertyName("seed")] LoopSeed Seed);

public sealed record ExampleManifest(
    [property: JsonPropertyName("id")] string Id,
    [property: JsonPropertyName("description")] string Description,
    [property: JsonPropertyName("loop")] LoopHints Loop,
    [property: JsonPropertyName("turns")] List<ExampleTurnRef> Turns,
    [property: JsonPropertyName("checks")] List<ExampleCheck> Checks);

// --- conversation.jsonl -----------------------------------------------------

public sealed record ConversationTurn(
    [property: JsonPropertyName("index")] int Index,
    [property: JsonPropertyName("role")] string Role,
    [property: JsonPropertyName("text")] string Text,
    [property: JsonPropertyName("label")] string? Label,
    [property: JsonPropertyName("commitSha")] string? CommitSha);

// --- the loaded bundle ------------------------------------------------------

/// <summary>
/// A golden example bundle loaded from disk: manifest + plan + labeled transcript
/// + the path to repo.bundle. <see cref="CloneTo"/> materializes the example repo
/// into a scratch clone and verifies the transcript joins to real repo states
/// (spec: bundle is self-contained; transcript turns join to repo states).
/// </summary>
public sealed class GoldenExample
{
    public required string Dir { get; init; }
    public required ExampleManifest Manifest { get; init; }
    public required string PlanText { get; init; }
    public required IReadOnlyList<ConversationTurn> Conversation { get; init; }

    public string BundlePath => Path.Combine(Dir, "repo.bundle");

    public static GoldenExample Load(string exampleDir)
    {
        var dir = Path.GetFullPath(exampleDir);
        if (!Directory.Exists(dir))
            throw new DirectoryNotFoundException($"example directory not found: {dir}");

        string Req(string file)
        {
            var p = Path.Combine(dir, file);
            if (!File.Exists(p)) throw new FileNotFoundException($"bundle is missing {file}", p);
            return p;
        }

        var manifest = JsonSerializer.Deserialize<ExampleManifest>(File.ReadAllText(Req("manifest.json")))
            ?? throw new InvalidDataException("manifest.json parsed to null");
        Req("repo.bundle");
        var plan = File.ReadAllText(Req("plan.md"));

        var turns = new List<ConversationTurn>();
        foreach (var line in File.ReadLines(Req("conversation.jsonl")))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            turns.Add(JsonSerializer.Deserialize<ConversationTurn>(line)
                ?? throw new InvalidDataException("conversation.jsonl line parsed to null"));
        }

        var ex = new GoldenExample { Dir = dir, Manifest = manifest, PlanText = plan, Conversation = turns };
        ex.ValidateShape();
        return ex;
    }

    /// <summary>Cross-file consistency, no git needed.</summary>
    private void ValidateShape()
    {
        var dirName = Path.GetFileName(Dir.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar));
        if (!string.Equals(Manifest.Id, dirName, StringComparison.OrdinalIgnoreCase))
            throw new InvalidDataException($"manifest id '{Manifest.Id}' != directory name '{dirName}'");

        if (Manifest.Turns.Count != Conversation.Count)
            throw new InvalidDataException(
                $"manifest has {Manifest.Turns.Count} turns but conversation.jsonl has {Conversation.Count}");

        for (var i = 0; i < Conversation.Count; i++)
        {
            var m = Manifest.Turns[i];
            var c = Conversation[i];
            if (m.Index != i || c.Index != i)
                throw new InvalidDataException($"turn at position {i} has index manifest={m.Index} transcript={c.Index}");
            if (!string.Equals(m.CommitSha, c.CommitSha, StringComparison.OrdinalIgnoreCase))
                throw new InvalidDataException($"turn {i}: manifest commitSha != transcript commitSha");
        }

        if (Manifest.Checks.Count == 0)
            throw new InvalidDataException("manifest declares no acceptance checks — 'done' would be undefined");
        if (!GoldenShas().Any())
            throw new InvalidDataException("no turn has an associated commit — the golden chain is empty");
    }

    /// <summary>The associated commit chain, in turn order (carry-forward turns skipped).</summary>
    public IEnumerable<string> GoldenShas() =>
        Manifest.Turns.Where(t => !string.IsNullOrEmpty(t.CommitSha)).Select(t => t.CommitSha!);

    /// <summary>
    /// Resolves each turn to the SHA of the repo state after it: an associated turn
    /// maps to its own commit; a turn without one carries the previous state forward
    /// (before the first associated commit that is the eval/start state).
    /// </summary>
    public IReadOnlyList<string> EffectiveStatePerTurn(string startSha)
    {
        var states = new List<string>(Conversation.Count);
        var current = startSha;
        foreach (var t in Manifest.Turns)
        {
            if (!string.IsNullOrEmpty(t.CommitSha)) current = t.CommitSha!;
            states.Add(current);
        }
        return states;
    }

    /// <summary>
    /// Clones repo.bundle into <paramref name="scratchDir"/> (must not exist yet),
    /// checks out eval/start on a work branch, and verifies the ref contract:
    /// eval/start + eval/final tags exist, golden branch exists, eval/final is the
    /// tip of golden, and the manifest's golden chain is exactly
    /// eval/start..eval/final in order.
    /// </summary>
    public GoldenClone CloneTo(string scratchDir)
    {
        if (Directory.Exists(scratchDir) && Directory.EnumerateFileSystemEntries(scratchDir).Any())
            throw new InvalidOperationException($"scratch dir not empty: {scratchDir}");
        Directory.CreateDirectory(scratchDir);

        GitCli.Must("", "clone", "--quiet", BundlePath, scratchDir);

        var start = GitCli.Must(scratchDir, "rev-parse", "eval/start^{commit}").Trim();
        var final = GitCli.Must(scratchDir, "rev-parse", "eval/final^{commit}").Trim();
        var goldenTip = GitCli.Must(scratchDir, "rev-parse", "origin/golden^{commit}").Trim();
        if (final != goldenTip)
            throw new InvalidDataException($"eval/final ({final[..8]}) is not the tip of golden ({goldenTip[..8]})");

        var chain = GitCli.Must(scratchDir, "rev-list", "--reverse", "eval/start..eval/final")
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var expected = GoldenShas().ToArray();
        if (!chain.SequenceEqual(expected, StringComparer.OrdinalIgnoreCase))
            throw new InvalidDataException(
                "manifest turn→SHA chain does not match eval/start..eval/final:\n" +
                $"  golden branch: {string.Join(" -> ", chain.Select(s => s[..8]))}\n" +
                $"  manifest:      {string.Join(" -> ", expected.Select(s => s[..8]))}");

        return new GoldenClone(this, scratchDir, start, final, chain);
    }
}

/// <summary>A verified scratch clone of an example repo.</summary>
public sealed record GoldenClone(
    GoldenExample Example,
    string WorkDir,
    string StartSha,
    string FinalSha,
    IReadOnlyList<string> GoldenChain);
