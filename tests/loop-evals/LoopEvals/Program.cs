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

static Task<int> RunEval(List<string> a)
{
    _ = a;
    Console.Error.WriteLine("run mode is not implemented yet (loop-evals tasks §2–3)");
    return Task.FromResult(2);
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
