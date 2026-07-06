using System.Text;
using System.Text.Json;
using ClaudeWeb.DiscoveryEval;
using ClaudeWeb.Services.StructuredAsk;

// DiscoveryEval — offline eval harness for the discover-local-apps agentic feature.
// See openspec/changes/add-discovery-eval/ and tests/discovery-eval/README.md.
//
//   DiscoveryEval selftest
//       Offline checks: scorer unit cases + prompt-seam identity. No gateway needed.
//
//   DiscoveryEval run [--fixture <dir>] [--n <N>] [--candidates <dir>]
//                     [--json <out.json>] [--assert-recall <0..1>]
//       Runs the REAL discovery path N times per prompt (baseline + each candidate
//       file) against the fixture and prints scores + deltas. Needs the
//       ClaudeMonitor gateway on localhost:5123.

Console.OutputEncoding = Encoding.UTF8;
var argList = args.ToList();
var mode = argList.Count > 0 ? argList[0] : "help";

return mode switch
{
    "selftest" => SelfTest.Run(),
    "run" => await RunEval(argList.Skip(1).ToList()),
    _ => Help(),
};

static int Help()
{
    Console.WriteLine("usage: DiscoveryEval selftest");
    Console.WriteLine("       DiscoveryEval run [--fixture <dir>] [--n <N>] [--candidates <dir>]");
    Console.WriteLine("                         [--json <out.json>] [--assert-recall <0..1>]");
    return 2;
}

static string? Opt(List<string> a, string name)
{
    var i = a.IndexOf(name);
    return i >= 0 && i + 1 < a.Count ? a[i + 1] : null;
}

static string RepoRoot()
{
    // Walk up from the binary until we find the solution file — works from any
    // bin/<config>/<tfm> depth and from `dotnet run`.
    var dir = new DirectoryInfo(AppContext.BaseDirectory);
    while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "ClaudeWeb.sln")))
        dir = dir.Parent;
    return dir?.FullName
        ?? throw new InvalidOperationException("could not locate ClaudeWeb.sln above " + AppContext.BaseDirectory);
}

static async Task<int> RunEval(List<string> a)
{
    var root = RepoRoot();
    var fixtureDir = Path.GetFullPath(Opt(a, "--fixture")
        ?? Path.Combine(root, "tests", "discovery-eval", "fixtures", "hard-mix"));
    var n = int.TryParse(Opt(a, "--n"), out var parsedN) ? Math.Max(1, parsedN) : 3;
    var candidatesDir = Opt(a, "--candidates");
    var jsonOut = Opt(a, "--json");
    var assertRecall = double.TryParse(Opt(a, "--assert-recall"), out var t) ? t : (double?)null;

    var expectedPath = Path.Combine(fixtureDir, "expected.json");
    if (!File.Exists(expectedPath))
    {
        Console.Error.WriteLine($"no expected.json in fixture: {fixtureDir}");
        return 2;
    }
    var expected = ExpectedApp.LoadFile(expectedPath);

    // Prompt set: the shipped baseline always runs; each *.txt/*.md in --candidates
    // is one candidate template (must contain {{OUTPUT_FORMAT}}).
    var prompts = new List<(string Label, string? Template)> { ("baseline", null) };
    if (candidatesDir is not null)
    {
        foreach (var file in Directory.EnumerateFiles(candidatesDir)
                     .Where(f => f.EndsWith(".txt") || f.EndsWith(".md"))
                     .OrderBy(f => f))
        {
            var text = File.ReadAllText(file);
            if (!text.Contains("{{OUTPUT_FORMAT}}"))
            {
                Console.Error.WriteLine($"skipping candidate without {{{{OUTPUT_FORMAT}}}}: {file}");
                continue;
            }
            prompts.Add((Path.GetFileNameWithoutExtension(file), text));
        }
    }

    Console.WriteLine($"fixture   : {fixtureDir}");
    Console.WriteLine($"expected  : {expected.Count} apps ({string.Join(", ", expected.Select(e => $"{e.Folder}:{e.Port}"))})");
    Console.WriteLine($"runs/prompt: {n}   prompts: {string.Join(", ", prompts.Select(p => p.Label))}");
    Console.WriteLine();

    var ask = new LocalAppDiscoveryAsk(new StructuredAskRunner("claudeweb-discovery-eval"));
    var runner = new EvalRunner(ask);
    var aggregates = new List<EvalAggregate>();

    foreach (var (label, template) in prompts)
    {
        Console.WriteLine($"── prompt '{label}' ──");
        var agg = await runner.RunAsync(label, template, fixtureDir, expected, n,
            onRun: r => Console.WriteLine(
                $"  run {r.RunIndex}/{n}: " + (r.Error is not null ? $"ERROR: {r.Error}" : r.Score!.Render())));
        aggregates.Add(agg);
        Console.WriteLine(
            $"  => perfect {agg.RunsPerfect}/{agg.RunsTotal}, perfect-recall {agg.RunsPerfectRecall}/{agg.RunsTotal}, " +
            $"worst recall {agg.WorstRecall:0.00}, mean recall {agg.MeanRecall:0.00}, mean precision {agg.MeanPrecision:0.00}" +
            (agg.RunsErrored > 0 ? $", errored {agg.RunsErrored}" : ""));
        Console.WriteLine();
    }

    // Deltas vs baseline (task 4.2) — candidates are scored, never adopted.
    var baseline = aggregates[0];
    if (aggregates.Count > 1)
    {
        Console.WriteLine("── deltas vs baseline ──");
        foreach (var c in aggregates.Skip(1))
            Console.WriteLine(
                $"  {c.PromptLabel}: perfect-recall {c.RunsPerfectRecall - baseline.RunsPerfectRecall:+0;-0;+0} runs, " +
                $"worst recall {c.WorstRecall - baseline.WorstRecall:+0.00;-0.00;+0.00}, " +
                $"mean recall {c.MeanRecall - baseline.MeanRecall:+0.00;-0.00;+0.00}, " +
                $"mean precision {c.MeanPrecision - baseline.MeanPrecision:+0.00;-0.00;+0.00}");
        Console.WriteLine();
    }

    if (jsonOut is not null)
    {
        File.WriteAllText(jsonOut, JsonSerializer.Serialize(aggregates,
            new JsonSerializerOptions { WriteIndented = true }));
        Console.WriteLine($"machine-readable report: {jsonOut}");
    }

    if (assertRecall is { } threshold)
    {
        var ok = baseline.WorstRecall >= threshold;
        Console.WriteLine($"assert: baseline worst recall {baseline.WorstRecall:0.00} {(ok ? ">=" : "<")} {threshold:0.00} → {(ok ? "PASS" : "FAIL")}");
        return ok ? 0 : 1;
    }
    return 0;
}

/// <summary>Offline checks — no gateway, no model calls.</summary>
internal static class SelfTest
{
    private static int _failures;

    public static int Run()
    {
        // ── scorer: perfect match (task 2.4) ──
        var expected = new List<ExpectedApp>
        {
            new() { Folder = "homepage-widgets", Port = 5411 },
            new() { Folder = "tools/status-board", Port = 5412 },
        };
        var perfect = Scorer.Score(new[]
        {
            Finding(@".\homepage-widgets\", 5411),   // messy path must still match
            Finding("Tools/Status-Board", 5412),     // case-insensitive
        }, expected);
        Check("perfect recall", perfect.Recall == 1.0);
        Check("perfect precision", perfect.Precision == 1.0);
        Check("perfect: no missing", perfect.Missing.Count == 0);
        Check("perfect: no extra", perfect.Extra.Count == 0);

        // ── scorer: a miss ──
        var miss = Scorer.Score(new[] { Finding("homepage-widgets", 5411) }, expected);
        Check("miss lowers recall", miss.Recall < 1.0);
        Check("miss populates missing", miss.Missing.Count == 1 && miss.Missing[0] == "tools/status-board:5412");
        Check("miss keeps precision", miss.Precision == 1.0);

        // ── scorer: an invented app ──
        var invented = Scorer.Score(new[]
        {
            Finding("homepage-widgets", 5411),
            Finding("tools/status-board", 5412),
            Finding("gateway-proxy", 9999),
        }, expected);
        Check("extra lowers precision", invented.Precision < 1.0);
        Check("extra populates extra", invented.Extra.Count == 1 && invented.Extra[0] == "gateway-proxy:9999");
        Check("extra keeps recall", invented.Recall == 1.0);

        // ── scorer: same folder, wrong port is BOTH missing and extra ──
        var wrongPort = Scorer.Score(new[] { Finding("homepage-widgets", 1234) },
            new List<ExpectedApp> { new() { Folder = "homepage-widgets", Port = 5411 } });
        Check("wrong port misses", wrongPort.Missing.Count == 1);
        Check("wrong port is extra", wrongPort.Extra.Count == 1);

        // ── scorer: empty edges ──
        Check("nothing expected, nothing found = perfect",
            Scorer.Score(Array.Empty<LocalAppFinding>(), new List<ExpectedApp>()).Perfect);

        // ── prompt seam: no-override path is byte-identical to the shipped prompt (task 3.2) ──
        Check("BuildPrompt() == BuildPrompt(BaselinePromptTemplate)",
            LocalAppDiscoveryAsk.BuildPrompt() ==
            LocalAppDiscoveryAsk.BuildPrompt(LocalAppDiscoveryAsk.BaselinePromptTemplate));
        Check("baseline prompt renders the output format",
            !LocalAppDiscoveryAsk.BuildPrompt().Contains("{{OUTPUT_FORMAT}}") &&
            LocalAppDiscoveryAsk.BuildPrompt().Contains("\"apps\""));
        Check("baseline template carries the shipped signature text",
            LocalAppDiscoveryAsk.BaselinePromptTemplate.Contains("Scan THIS repository") &&
            LocalAppDiscoveryAsk.BaselinePromptTemplate.Contains("{{OUTPUT_FORMAT}}"));
        var custom = "custom template {{OUTPUT_FORMAT}} end";
        Check("override is honored",
            LocalAppDiscoveryAsk.BuildPrompt(custom).StartsWith("custom template") &&
            !LocalAppDiscoveryAsk.BuildPrompt(custom).Contains("{{OUTPUT_FORMAT}}"));

        Console.WriteLine();
        Console.WriteLine(_failures == 0 ? "selftest: ALL PASS" : $"selftest: {_failures} FAILURE(S)");
        return _failures == 0 ? 0 : 1;
    }

    private static LocalAppFinding Finding(string folder, int port) =>
        new() { Name = folder, Folder = folder, Port = port, Evidence = "test", StartCommand = "" };

    private static void Check(string name, bool ok)
    {
        if (!ok) _failures++;
        Console.WriteLine($"  [{(ok ? "pass" : "FAIL")}] {name}");
    }
}
