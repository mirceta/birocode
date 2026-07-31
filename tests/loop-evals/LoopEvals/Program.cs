using System.Text.Json;
using ClaudeWeb.LoopEvals;

// LoopEvals — offline, developer-facing eval harness for autopilot loops.
// See tests/loop-evals/README.md and the loop-evals OpenSpec capability.

var argList = args.ToList();
var mode = argList.FirstOrDefault() ?? "help";

return mode switch
{
    "validate" => Validate(argList.Skip(1).ToList()),
    "run" => await RunEval(argList.Skip(1).ToList()),
    _ => Help(),
};

static int Help()
{
    Console.WriteLine("""
        LoopEvals — score autopilot loop configs against golden human-driven runs.

        usage:
          LoopEvals validate --example <id> [--examples-root <dir>]
              load a golden example bundle, clone it to scratch, verify the
              transcript joins to real repo states. Offline, no agent calls.

          LoopEvals run --example <id> [options]
              replay the example's plan through the production queue loop and
              score the result against the golden run. Spends real agent turns.

            --examples-root <dir>   default: tests/loop-evals/examples
                                    (or env LOOPEVALS_EXAMPLES_ROOT)
            --runs <N>              repeat N times, aggregate (default 1)
            --turn-cap <N>          hard cap on agent turns (default 12)
            --timeout-min <N>       wall-clock timeout per run (default 30)
            --broken                deliberately mis-seed the loop (E2E sanity:
                                    a broken config must score worse)
            --json <file>           also write the report as JSON
        """);
    return 2;
}

static string? Opt(List<string> a, string name)
{
    var i = a.IndexOf(name);
    return i >= 0 && i + 1 < a.Count ? a[i + 1] : null;
}

static string RepoRoot()
{
    var dir = AppContext.BaseDirectory;
    while (dir != null && !File.Exists(Path.Combine(dir, "ClaudeWeb.sln")))
        dir = Path.GetDirectoryName(dir);
    return dir ?? throw new InvalidOperationException("could not locate repo root (ClaudeWeb.sln)");
}

static string ExamplesRoot(List<string> a) =>
    Opt(a, "--examples-root")
    ?? Environment.GetEnvironmentVariable("LOOPEVALS_EXAMPLES_ROOT")
    ?? Path.Combine(RepoRoot(), "tests", "loop-evals", "examples");

static string RequireExampleDir(List<string> a)
{
    var id = Opt(a, "--example")
        ?? throw new ArgumentException("--example <id> is required");
    return Path.Combine(ExamplesRoot(a), id);
}

static int Validate(List<string> a)
{
    var exampleDir = RequireExampleDir(a);
    Console.WriteLine($"loading  {exampleDir}");
    var example = GoldenExample.Load(exampleDir);
    Console.WriteLine($"loaded   {example.Manifest.Id}: {example.Conversation.Count} turns, " +
                      $"{example.GoldenShas().Count()} golden commits, {example.Manifest.Checks.Count} checks");

    var scratch = Path.Combine(Path.GetTempPath(), "loop-evals", "validate-" + Guid.NewGuid().ToString("N")[..8]);
    try
    {
        var clone = example.CloneTo(scratch);
        Console.WriteLine($"cloned   eval/start {clone.StartSha[..8]} -> eval/final {clone.FinalSha[..8]}");
        Console.WriteLine($"chain    {string.Join(" -> ", clone.GoldenChain.Select(s => s[..8]))}");
        var states = example.EffectiveStatePerTurn(clone.StartSha);
        for (var i = 0; i < states.Count; i++)
        {
            var t = example.Conversation[i];
            var own = t.CommitSha != null ? "commit" : "carry ";
            Console.WriteLine($"turn {i}   [{t.Role,-9}] {own} {states[i][..8]}  {(t.Label ?? ""),-14} {Trunc(t.Text, 60)}");
        }
        Console.WriteLine("OK — bundle is self-contained and transcript joins to repo states.");
        return 0;
    }
    finally
    {
        TryDelete(scratch);
    }
}

static async Task<int> RunEval(List<string> a)
{
    var exampleDir = RequireExampleDir(a);
    var runs = Math.Max(1, int.TryParse(Opt(a, "--runs"), out var n) ? n : 1);
    var turnCap = Math.Clamp(int.TryParse(Opt(a, "--turn-cap"), out var tc) ? tc : 12, 1, 100);
    var timeout = TimeSpan.FromMinutes(Math.Max(1, int.TryParse(Opt(a, "--timeout-min"), out var tm) ? tm : 30));
    var broken = a.Contains("--broken");
    var jsonOut = Opt(a, "--json");
    var outRoot = Opt(a, "--out")
        ?? Path.Combine(RepoRoot(), ".loop-evals", DateTime.Now.ToString("yyyyMMdd-HHmmss"));

    var example = GoldenExample.Load(exampleDir);
    var settings = new RunSettings(turnCap, timeout, broken);
    var config = $"queue drive, cap {turnCap}, verify on{(broken ? ", BROKEN seed" : "")}";
    Console.WriteLine($"example  {example.Manifest.Id}: {example.Manifest.Description}");
    Console.WriteLine($"config   {config}; {runs} run(s), timeout {timeout.TotalMinutes:0}min");
    Console.WriteLine($"out      {outRoot}");

    // The isolated harness datadir — MUST be set before any app service resolves
    // AppPaths.DataDir (read once per process).
    Directory.CreateDirectory(outRoot);
    Environment.SetEnvironmentVariable("CLAUDEWEB_DATADIR", Path.Combine(outRoot, "datadir"));

    var reports = new List<RunReport>();
    await using (var host = await EvalHost.StartAsync(Path.Combine(outRoot, "datadir")))
    {
        var runner = new EvalRunner(host);
        for (var i = 1; i <= runs; i++)
        {
            Console.WriteLine($"--- run {i}/{runs} ---");
            var runDir = Path.Combine(outRoot, $"run-{i}");
            var outcome = await runner.RunOnceAsync(example, i, runDir, settings);
            var report = Scorer.Score(example, outcome);
            reports.Add(report);
            Console.WriteLine(Scorer.Render(report));
        }
    }

    var aggregate = new EvalAggregate(example.Manifest.Id, config, reports);
    Console.WriteLine();
    Console.WriteLine(Scorer.RenderAggregate(aggregate));

    var jsonPath = jsonOut ?? Path.Combine(outRoot, "report.json");
    File.WriteAllText(jsonPath, JsonSerializer.Serialize(aggregate,
        new JsonSerializerOptions { WriteIndented = true }));
    Console.WriteLine($"report   {jsonPath}");

    return aggregate.RunsPassed == aggregate.RunsTotal ? 0 : 1;
}

static string Trunc(string s, int n)
{
    s = s.Replace('\n', ' ');
    return s.Length <= n ? s : s[..n] + "…";
}

static void TryDelete(string dir)
{
    try
    {
        if (!Directory.Exists(dir)) return;
        // git objects are read-only on Windows; strip attributes before delete.
        foreach (var f in Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories))
            File.SetAttributes(f, FileAttributes.Normal);
        Directory.Delete(dir, recursive: true);
    }
    catch { /* scratch cleanup is best-effort */ }
}
