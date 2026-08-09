using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.LoopEvals;

public sealed record ExportCheckDto(string Name, string Command);

/// <summary>One in-span turn as curated: order = span order, CommitSha only on
/// turns the Operator associated with a commit (carry-forward turns send null).</summary>
public sealed record ExportTurnDto(string Role, string Text, string? Label, string? CommitSha);

public sealed record ExportRequest(
    string ExampleId,
    string Description,
    string RepoCopyPath,
    string PlanText,
    List<ExportCheckDto> Checks,
    List<ExportTurnDto> Turns,
    string? SeedMode,
    List<string>? SeedItems,
    bool Overwrite);

public sealed record ExportResult(
    string ExampleDir, string StartSha, string FinalSha, int GoldenCommits, int TurnCount);

/// <summary>
/// Builds a golden example bundle from a curated association (spec: export produces
/// eval/start cut before the first associated commit, golden as the associated
/// commit chain, eval/final at its tip, plus manifest and labeled transcript).
/// The source repo copy is only ever read — refs are created in a throwaway clone,
/// so sources stay byte-identical (spec: curation never mutates its sources).
/// </summary>
public sealed partial class BundleExporter
{
    private readonly AppConfig _config;
    private readonly Logger _logger;

    [GeneratedRegex("^[a-z0-9][a-z0-9._-]{0,63}$")]
    private static partial Regex ExampleIdRegex();

    [GeneratedRegex("^[0-9a-f]{7,40}$")]
    private static partial Regex ShaRegex();

    public BundleExporter(AppConfig config, Logger logger)
    {
        _config = config;
        _logger = logger;
    }

    /// <summary>Configured examples root; external to any repo by default (spec:
    /// real-world captures storable outside the repository).</summary>
    public string ExamplesRoot => string.IsNullOrWhiteSpace(_config.LoopEvalsExamplesRoot)
        ? Path.Combine(AppPaths.DataDir, "loop-evals-examples")
        : _config.LoopEvalsExamplesRoot;

    public ExportResult Export(ExportRequest req)
    {
        // --- shape validation, before any filesystem work
        if (string.IsNullOrWhiteSpace(req.ExampleId) || !ExampleIdRegex().IsMatch(req.ExampleId))
            throw new ArgumentException("example id must be lowercase [a-z0-9._-], starting alphanumeric");
        if (string.IsNullOrWhiteSpace(req.PlanText))
            throw new ArgumentException("plan.md text is required");
        if (req.Checks is not { Count: > 0 } ||
            req.Checks.Any(c => string.IsNullOrWhiteSpace(c.Name) || string.IsNullOrWhiteSpace(c.Command)))
            throw new ArgumentException("at least one acceptance check with name and command is required");
        if (req.Turns is not { Count: > 0 })
            throw new ArgumentException("the curated span contains no turns");
        CurationService.ValidateRepoCopy(req.RepoCopyPath);

        var associated = req.Turns.Where(t => !string.IsNullOrWhiteSpace(t.CommitSha))
            .Select(t => t.CommitSha!.Trim().ToLowerInvariant()).ToList();
        if (associated.Count == 0)
            throw new ArgumentException("no turn is associated with a commit — the golden chain would be empty");
        if (associated.Any(s => !ShaRegex().IsMatch(s)))
            throw new ArgumentException("associated commit SHAs must be hex (7-40 chars)");

        // --- resolve + validate the chain in the SOURCE copy (read-only queries)
        var full = associated.Select(s =>
        {
            var (exit, stdout, stderr) = GitRun.Run(req.RepoCopyPath, "rev-parse", "--verify", s + "^{commit}");
            if (exit != 0)
                throw new ArgumentException($"commit {s} not found in the repo copy: {stderr.Trim()}");
            return stdout.Trim();
        }).ToList();

        var startParent = GitRun.Run(req.RepoCopyPath, "rev-parse", "--verify", full[0] + "^");
        if (startParent.ExitCode != 0)
            throw new ArgumentException(
                $"first associated commit {full[0][..8]} has no parent — eval/start (the state before it) would not exist");
        var startSha = startParent.StdOut.Trim();

        // The golden branch must be EXACTLY the associated commits in order (spec
        // scenario: cloned golden branch is exactly those N commits) — so each
        // commit's parent must be the previous associated commit.
        for (var i = 1; i < full.Count; i++)
        {
            var parent = GitRun.Must(req.RepoCopyPath, "rev-parse", "--verify", full[i] + "^").Trim();
            if (!string.Equals(parent, full[i - 1], StringComparison.OrdinalIgnoreCase))
                throw new ArgumentException(
                    $"associated commits are not a contiguous chain: {full[i][..8]}'s parent is {parent[..8]}, "
                    + $"not the previously associated {full[i - 1][..8]} — associate every commit in between, or none of them");
        }
        var finalSha = full[^1];

        // --- renumber the span 0..n-1 with full SHAs (loader contract: manifest
        // turns mirror the transcript 1:1; carry-forward turns keep null)
        var shaQueue = new Queue<string>(full);
        var turns = req.Turns.Select((t, i) => new
        {
            index = i,
            role = string.IsNullOrWhiteSpace(t.Role) ? "user" : t.Role,
            text = t.Text ?? "",
            label = string.IsNullOrWhiteSpace(t.Label) ? null : t.Label!.Trim(),
            commitSha = string.IsNullOrWhiteSpace(t.CommitSha) ? null : shaQueue.Dequeue(),
        }).ToList();

        var exampleDir = Path.Combine(ExamplesRoot, req.ExampleId);
        if (Directory.Exists(exampleDir))
        {
            if (!req.Overwrite)
                throw new InvalidOperationException($"example '{req.ExampleId}' already exists at {exampleDir} (set overwrite to replace)");
            ForceDelete(exampleDir);
        }

        // --- cut refs in a throwaway clone, never in the source copy
        var tmp = Path.Combine(Path.GetTempPath(), "loopeval-export-" + Guid.NewGuid().ToString("N"));
        try
        {
            GitRun.Must("", "clone", "--quiet", req.RepoCopyPath, tmp);
            foreach (var sha in full.Prepend(startSha))
            {
                var (exit, _, _) = GitRun.Run(tmp, "cat-file", "-e", sha + "^{commit}");
                if (exit != 0)
                    throw new ArgumentException(
                        $"commit {sha[..8]} is not reachable from the repo copy's branches — is it only on a stash or a detached head?");
            }
            GitRun.Must(tmp, "tag", "eval/start", startSha);
            GitRun.Must(tmp, "branch", "-f", "golden", finalSha);
            GitRun.Must(tmp, "tag", "eval/final", finalSha);

            Directory.CreateDirectory(exampleDir);
            GitRun.Must(tmp, "bundle", "create", Path.Combine(exampleDir, "repo.bundle"),
                "eval/start", "eval/final", "golden");
        }
        finally
        {
            try { ForceDelete(tmp); } catch { /* temp leftovers are harmless */ }
        }

        // --- manifest + plan + labeled transcript, loader-compatible shapes
        File.WriteAllText(Path.Combine(exampleDir, "plan.md"), req.PlanText, new UTF8Encoding(false));

        var jsonl = new StringBuilder();
        foreach (var t in turns)
            jsonl.AppendLine(JsonSerializer.Serialize(t));
        File.WriteAllText(Path.Combine(exampleDir, "conversation.jsonl"), jsonl.ToString(), new UTF8Encoding(false));

        var manifest = new
        {
            id = req.ExampleId,
            description = req.Description ?? "",
            loop = new
            {
                kind = "queue",
                seed = new
                {
                    mode = string.Equals(req.SeedMode, "items", StringComparison.OrdinalIgnoreCase) ? "items" : "plan",
                    items = req.SeedItems ?? new List<string>(),
                },
            },
            turns = turns.Select(t => new { t.index, t.commitSha }).ToList(),
            checks = req.Checks.Select(c => new { name = c.Name.Trim(), command = c.Command.Trim() }).ToList(),
        };
        File.WriteAllText(Path.Combine(exampleDir, "manifest.json"),
            JsonSerializer.Serialize(manifest, new JsonSerializerOptions { WriteIndented = true }),
            new UTF8Encoding(false));

        _logger.Info($"[LOOPEVALS] Exported '{req.ExampleId}' -> {exampleDir} "
            + $"({full.Count} golden commits, {turns.Count} turns)");
        return new ExportResult(exampleDir, startSha, finalSha, full.Count, turns.Count);
    }

    /// <summary>Recursive delete that survives git's read-only pack files.</summary>
    private static void ForceDelete(string dir)
    {
        if (!Directory.Exists(dir)) return;
        foreach (var f in Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories))
            File.SetAttributes(f, FileAttributes.Normal);
        Directory.Delete(dir, recursive: true);
    }
}
