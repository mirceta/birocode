using System.Diagnostics;
using System.Globalization;
using System.Text;

namespace ClaudeWeb.LoopEvals;

// --- scoring result shapes (JSON-serializable, discovery-eval precedent) -----

public sealed record CheckResult(string Name, string Command, bool Passed, int ExitCode, string OutputTail);

/// <summary>The verdict (spec: acceptance checks define done — never byte-identity).</summary>
public sealed record AcceptanceVerdict(bool Passed, string? FailedCheck, IReadOnlyList<CheckResult> Checks);

/// <summary>Mechanical diff of the run's final tree vs eval/final — evidence, not verdict.</summary>
public sealed record DiffSummary(
    IReadOnlyList<string> Added, IReadOnlyList<string> Removed, IReadOnlyList<string> Changed)
{
    public bool Identical => Added.Count == 0 && Removed.Count == 0 && Changed.Count == 0;
}

public sealed record TurnOverlap(
    int Position, IReadOnlyList<string> RunFiles, IReadOnlyList<string> GoldenFiles, double Jaccard);

/// <summary>Trajectory vs the golden commit chain. State-changing run turns are
/// compared positionally against the golden commits; verify/no-op turns count in
/// <see cref="RunTurnsTotal"/> but not in the per-turn overlap.</summary>
public sealed record TrajectoryReport(
    int RunTurnsTotal, int RunStateChanges, int GoldenTurns,
    IReadOnlyList<TurnOverlap> Overlaps, int? FirstDivergencePosition);

public sealed record RunReport(
    string ExampleId, int RunIndex, string FinalStatus, string? StopReason, string? StopDetail,
    int Iterations, int QueueSent, bool TimedOut, double DurationSec,
    AcceptanceVerdict Verdict, DiffSummary Diff, TrajectoryReport Trajectory, string RunDir);

public sealed record EvalAggregate(
    string ExampleId, string Config, IReadOnlyList<RunReport> Runs)
{
    public int RunsTotal => Runs.Count;
    public int RunsPassed => Runs.Count(r => r.Verdict.Passed);
    public double PassRate => RunsTotal == 0 ? 0 : (double)RunsPassed / RunsTotal;
    public string WorstOutcome => Runs.Any(r => !r.Verdict.Passed)
        ? Runs.Where(r => !r.Verdict.Passed).Select(r => r.FinalStatus).First()
        : "passed";
    public int MinTurns => Runs.Count == 0 ? 0 : Runs.Min(r => r.Trajectory.RunTurnsTotal);
    public int MaxTurns => Runs.Count == 0 ? 0 : Runs.Max(r => r.Trajectory.RunTurnsTotal);
    public double MeanTurns => Runs.Count == 0 ? 0 : Runs.Average(r => r.Trajectory.RunTurnsTotal);
}

public static class Scorer
{
    /// <summary>Runs the manifest's acceptance checks, in order, in the run's final
    /// working copy via the platform shell. First failure names the check and stops
    /// (spec: checks fail means not done, failing check named).</summary>
    public static AcceptanceVerdict RunChecks(string workDir, IEnumerable<ExampleCheck> checks)
    {
        var results = new List<CheckResult>();
        foreach (var check in checks)
        {
            var (exit, output) = RunShell(workDir, check.Command);
            var passed = exit == 0;
            results.Add(new CheckResult(check.Name, check.Command, passed, exit, Tail(output, 400)));
            if (!passed)
                return new AcceptanceVerdict(false, check.Name, results);
        }
        return new AcceptanceVerdict(true, null, results);
    }

    /// <summary>Fetches the golden refs back from the bundle (the run clone was
    /// deliberately stripped of them) under a private ref namespace, then diffs the
    /// run's final tree against eval/final.</summary>
    public static (DiffSummary Diff, IReadOnlyList<string[]> GoldenTurnFiles) FetchGoldenAndDiff(
        string runDir, GoldenExample example)
    {
        GitCli.Must(runDir, "fetch", "--quiet", "--no-tags", example.BundlePath,
            "+refs/tags/eval/final:refs/loopevals/final",
            "+refs/heads/golden:refs/loopevals/golden");
        var final = GitCli.Must(runDir, "rev-parse", "refs/loopevals/final^{commit}").Trim();

        var added = new List<string>();
        var removed = new List<string>();
        var changed = new List<string>();
        var lines = GitCli.Must(runDir, "diff", "--name-status", final, "HEAD")
            .Split('\n', StringSplitOptions.RemoveEmptyEntries);
        foreach (var line in lines)
        {
            var parts = line.Split('\t', StringSplitOptions.TrimEntries);
            if (parts.Length < 2) continue;
            switch (parts[0][0])
            {
                case 'A': added.Add(parts[1]); break;
                case 'D': removed.Add(parts[1]); break;
                case 'R': changed.Add(parts[^1]); break;
                default: changed.Add(parts[1]); break;
            }
        }

        var goldenFiles = example.GoldenShas()
            .Select(sha => GitCli.Must(runDir, "diff-tree", "--no-commit-id", "--name-only", "-r", sha)
                .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
            .ToList();

        return (new DiffSummary(added, removed, changed), goldenFiles);
    }

    /// <summary>Positional files-touched comparison of the run's state-changing
    /// turns vs the golden commit chain; first divergence = first position where
    /// the run touched none of the golden turn's files (or stopped short).</summary>
    public static TrajectoryReport CompareTrajectory(
        IReadOnlyList<TurnCommit> turns, IReadOnlyList<string[]> goldenTurnFiles)
    {
        var stateChanges = turns.Where(t => t.Files.Count > 0).ToList();
        var overlaps = new List<TurnOverlap>();
        int? firstDivergence = null;

        var positions = Math.Max(stateChanges.Count, goldenTurnFiles.Count);
        for (var i = 0; i < positions; i++)
        {
            var run = i < stateChanges.Count ? stateChanges[i].Files : Array.Empty<string>();
            var golden = i < goldenTurnFiles.Count ? goldenTurnFiles[i] : Array.Empty<string>();
            var union = run.Union(golden, StringComparer.OrdinalIgnoreCase).Count();
            var inter = run.Intersect(golden, StringComparer.OrdinalIgnoreCase).Count();
            var jaccard = union == 0 ? 1.0 : (double)inter / union;
            overlaps.Add(new TurnOverlap(i, run.ToArray(), golden.ToArray(), jaccard));
            if (firstDivergence is null && golden.Length > 0 && inter == 0)
                firstDivergence = i;
        }

        return new TrajectoryReport(turns.Count, stateChanges.Count, goldenTurnFiles.Count,
            overlaps, firstDivergence);
    }

    public static RunReport Score(GoldenExample example, RunOutcome run)
    {
        var (diff, goldenTurnFiles) = FetchGoldenAndDiff(run.RunDir, example);
        var verdict = RunChecks(run.RunDir, example.Manifest.Checks);
        var trajectory = CompareTrajectory(run.Turns, goldenTurnFiles);
        return new RunReport(
            example.Manifest.Id, run.RunIndex, run.FinalStatus, run.StopReason, run.StopDetail,
            run.Iterations, run.QueueSent, run.TimedOut, Math.Round(run.DurationSec, 1),
            verdict, diff, trajectory, run.RunDir);
    }

    // --- console rendering ---------------------------------------------------

    public static string Render(RunReport r)
    {
        var sb = new StringBuilder();
        var verdict = r.Verdict.Passed ? "PASS" : $"FAIL ({r.Verdict.FailedCheck})";
        sb.AppendLine(Inv($"run {r.RunIndex}  {verdict,-24} status {r.FinalStatus}")
            + (r.StopReason is null ? "" : $" ({r.StopReason})")
            + $"  turns {r.Trajectory.RunTurnsTotal} ({r.Trajectory.RunStateChanges} changed state; golden {r.Trajectory.GoldenTurns})"
            + Inv($"  {r.DurationSec:0}s"));
        sb.AppendLine($"        diff vs eval/final: "
            + (r.Diff.Identical ? "identical"
               : $"+{r.Diff.Added.Count} added, -{r.Diff.Removed.Count} missing, ~{r.Diff.Changed.Count} changed"));
        foreach (var o in r.Trajectory.Overlaps)
            sb.AppendLine(Inv($"        turn {o.Position}: overlap {o.Jaccard:0.00}  run[{string.Join(", ", o.RunFiles)}] golden[{string.Join(", ", o.GoldenFiles)}]"));
        if (r.Trajectory.FirstDivergencePosition is { } d)
            sb.AppendLine($"        first divergence at state-change {d}");
        return sb.ToString().TrimEnd();
    }

    public static string RenderAggregate(EvalAggregate a)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"== {a.ExampleId} [{a.Config}] ==");
        sb.AppendLine(Inv($"pass rate {a.RunsPassed}/{a.RunsTotal} ({a.PassRate:P0})  worst: {a.WorstOutcome}")
            + Inv($"  turns min/mean/max: {a.MinTurns}/{a.MeanTurns:0.0}/{a.MaxTurns}"));
        return sb.ToString().TrimEnd();
    }

    private static string Inv(FormattableString f) => f.ToString(CultureInfo.InvariantCulture);

    // --- plumbing ------------------------------------------------------------

    private static (int ExitCode, string Output) RunShell(string workDir, string command)
    {
        var psi = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = $"/d /s /c \"{command}\"",
            WorkingDirectory = workDir,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        using var p = Process.Start(psi)!;
        var stdout = p.StandardOutput.ReadToEnd();
        var stderr = p.StandardError.ReadToEnd();
        if (!p.WaitForExit(120_000))
        {
            try { p.Kill(entireProcessTree: true); } catch { }
            return (-1, "check timed out after 120s");
        }
        return (p.ExitCode, stdout + (stderr.Length > 0 ? "\n" + stderr : ""));
    }

    private static string Tail(string s, int n)
    {
        s = s.Trim();
        return s.Length <= n ? s : "…" + s[^n..];
    }
}
