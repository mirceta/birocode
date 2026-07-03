using ClaudeWeb.Services.StructuredAsk;

namespace ClaudeWeb.DiscoveryEval;

/// <summary>One discovery attempt: a score, or the error that prevented one.</summary>
public sealed record RunOutcome(int RunIndex, ScoreResult? Score, string? Error);

/// <summary>Aggregate over N runs of one (fixture, prompt) pair.</summary>
public sealed record EvalAggregate(
    string PromptLabel,
    string FixtureName,
    IReadOnlyList<RunOutcome> Runs)
{
    public int RunsTotal => Runs.Count;
    public int RunsErrored => Runs.Count(r => r.Error is not null);
    public int RunsPerfectRecall => Runs.Count(r => r.Score is { Recall: >= 1.0 });
    public int RunsPerfect => Runs.Count(r => r.Score is { } s && s.Perfect);

    /// <summary>Worst recall across runs; an errored run counts as 0 (it found nothing).</summary>
    public double WorstRecall => Runs.Count == 0 ? 0 : Runs.Min(r => r.Score?.Recall ?? 0.0);

    public double MeanRecall => Runs.Count == 0 ? 0 : Runs.Average(r => r.Score?.Recall ?? 0.0);
    public double MeanPrecision => Runs.Count == 0 ? 0 : Runs.Average(r => r.Score?.Precision ?? 0.0);
}

/// <summary>Runs the SHIPPED discovery path against a fixture N times and scores each
/// run against the fixture's expected.json. No reimplementation: the ask, gateway
/// transport, JSON extraction, validating parse, and retry loop are the production
/// ones (design D1); only the scan root and (optionally) the prompt template differ.</summary>
public sealed class EvalRunner
{
    private readonly LocalAppDiscoveryAsk _ask;

    public EvalRunner(LocalAppDiscoveryAsk ask) => _ask = ask;

    public async Task<EvalAggregate> RunAsync(
        string promptLabel,
        string? promptTemplate,          // null = shipped baseline
        string fixtureDir,
        IReadOnlyList<ExpectedApp> expected,
        int n,
        Action<RunOutcome>? onRun = null,
        CancellationToken ct = default)
    {
        var outcomes = new List<RunOutcome>(n);
        for (var i = 1; i <= n; i++)
        {
            ct.ThrowIfCancellationRequested();
            RunOutcome outcome;
            try
            {
                // Each call gets its own unique gateway identity inside the runner,
                // so N runs are independent by construction.
                var result = await _ask.DiscoverAsync(fixtureDir, promptTemplate, ct);
                outcome = result.Success && result.Report is not null
                    ? new RunOutcome(i, Scorer.Score(result.Report.Apps, expected), null)
                    : new RunOutcome(i, null, result.Error ?? "unknown discovery failure");
            }
            catch (OperationCanceledException) { throw; }
            catch (Exception ex)
            {
                outcome = new RunOutcome(i, null, ex.Message);
            }
            outcomes.Add(outcome);
            onRun?.Invoke(outcome);
        }
        return new EvalAggregate(promptLabel, Path.GetFileName(fixtureDir.TrimEnd('\\', '/')), outcomes);
    }
}
