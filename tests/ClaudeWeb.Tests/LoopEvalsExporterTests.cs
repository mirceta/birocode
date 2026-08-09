using System.Text.Json;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.LoopEvals;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// Exporter tests for the loop-evals curation module (tasks §4.4): five-commit
/// chain round-trip, carry-forward turn mapping, and the sources-untouched
/// guarantee (spec: curation never mutates its sources).
/// </summary>
public class LoopEvalsExporterTests
{
    // --- fixture: a temp source repo with base + N commits ------------------

    private sealed class TempSourceRepo : IDisposable
    {
        public string Dir { get; }
        public string BaseSha { get; }
        public List<string> ChainShas { get; } = new();

        public TempSourceRepo(int chainLength)
        {
            Dir = Path.Combine(Path.GetTempPath(), "loopeval-src-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Dir);
            Git("init", "-q", "-b", "main");
            Git("config", "user.name", "tester");
            Git("config", "user.email", "tester@example.invalid");

            File.WriteAllText(Path.Combine(Dir, "README.md"), "base state\n");
            Git("add", "-A");
            Git("commit", "-q", "-m", "base");
            BaseSha = Git("rev-parse", "HEAD").Trim();

            for (var i = 1; i <= chainLength; i++)
            {
                File.WriteAllText(Path.Combine(Dir, $"step{i}.txt"), $"step {i}\n");
                Git("add", "-A");
                Git("commit", "-q", "-m", $"step {i}");
                ChainShas.Add(Git("rev-parse", "HEAD").Trim());
            }
        }

        public string Git(params string[] args) => GitRun.Must(Dir, args);

        /// <summary>Everything an export could plausibly disturb: all refs, HEAD,
        /// and the working-tree status.</summary>
        public string Fingerprint() =>
            Git("for-each-ref") + "|" + Git("rev-parse", "HEAD") + "|" + Git("status", "--porcelain");

        public void Dispose()
        {
            try
            {
                foreach (var f in Directory.EnumerateFiles(Dir, "*", SearchOption.AllDirectories))
                    File.SetAttributes(f, FileAttributes.Normal);
                Directory.Delete(Dir, recursive: true);
            }
            catch { /* best effort */ }
        }
    }

    private static (BundleExporter Exporter, string Root) NewExporter()
    {
        var root = Path.Combine(Path.GetTempPath(), "loopeval-root-" + Guid.NewGuid().ToString("N"));
        var exporter = new BundleExporter(
            new AppConfig { LoopEvalsExamplesRoot = root }, new Logger());
        return (exporter, root);
    }

    private static ExportRequest Request(TempSourceRepo src, List<ExportTurnDto> turns, string id = "test-example") =>
        new(id, "test description", src.Dir, "Do the five steps.\n",
            new List<ExportCheckDto> { new("readme", "type README.md") },
            turns, "plan", null, Overwrite: false);

    // --- 4.4a: five-commit chain round-trip ---------------------------------

    [Fact]
    public void FiveCommitChain_RoundTripsThroughBundle()
    {
        using var src = new TempSourceRepo(chainLength: 5);
        var (exporter, root) = NewExporter();
        try
        {
            var turns = new List<ExportTurnDto>();
            for (var i = 0; i < 5; i++)
            {
                turns.Add(new ExportTurnDto("user", $"do step {i + 1}", "instruct", null));
                turns.Add(new ExportTurnDto("assistant", $"did step {i + 1}", null, src.ChainShas[i]));
            }

            var result = exporter.Export(Request(src, turns));
            Assert.Equal(src.BaseSha, result.StartSha);
            Assert.Equal(src.ChainShas[^1], result.FinalSha);
            Assert.Equal(5, result.GoldenCommits);

            // Clone the bundle and verify the ref contract (spec scenario: cloned
            // golden branch is exactly those five commits in order).
            var clone = Path.Combine(Path.GetTempPath(), "loopeval-clone-" + Guid.NewGuid().ToString("N"));
            try
            {
                GitRun.Must("", "clone", "--quiet", Path.Combine(result.ExampleDir, "repo.bundle"), clone);
                Assert.Equal(src.BaseSha, GitRun.Must(clone, "rev-parse", "eval/start^{commit}").Trim());
                Assert.Equal(src.ChainShas[^1], GitRun.Must(clone, "rev-parse", "eval/final^{commit}").Trim());
                var chain = GitRun.Must(clone, "rev-list", "--reverse", "eval/start..eval/final")
                    .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                Assert.Equal(src.ChainShas, chain);
            }
            finally
            {
                TryDelete(clone);
            }
        }
        finally
        {
            TryDelete(root);
        }
    }

    // --- 4.4b: carry-forward turn mapping -----------------------------------

    [Fact]
    public void CarryForwardTurns_KeepNullSha_AndIndicesRenumber()
    {
        using var src = new TempSourceRepo(chainLength: 2);
        var (exporter, root) = NewExporter();
        try
        {
            // span: instruct, work (commit 1), discussion (no commit), work (commit 2)
            var turns = new List<ExportTurnDto>
            {
                new("user", "start", "instruct", null),
                new("assistant", "did step 1", null, src.ChainShas[0]),
                new("user", "hmm, thinking out loud", "course-correct", null),
                new("assistant", "did step 2", null, src.ChainShas[1]),
            };

            var result = exporter.Export(Request(src, turns, id: "carry-forward"));

            var lines = File.ReadAllLines(Path.Combine(result.ExampleDir, "conversation.jsonl"))
                .Where(l => !string.IsNullOrWhiteSpace(l))
                .Select(l => JsonSerializer.Deserialize<JsonElement>(l))
                .ToList();
            Assert.Equal(4, lines.Count);
            for (var i = 0; i < 4; i++)
                Assert.Equal(i, lines[i].GetProperty("index").GetInt32());

            // The discussion turn carries no commit of its own (spec scenario: the
            // golden branch gains no commit for it) — its state is the loader's
            // carry-forward of turn 1's commit.
            Assert.Equal(JsonValueKind.Null, lines[0].GetProperty("commitSha").ValueKind);
            Assert.Equal(src.ChainShas[0], lines[1].GetProperty("commitSha").GetString());
            Assert.Equal(JsonValueKind.Null, lines[2].GetProperty("commitSha").ValueKind);
            Assert.Equal(src.ChainShas[1], lines[3].GetProperty("commitSha").GetString());
            Assert.Equal("course-correct", lines[2].GetProperty("label").GetString());

            // manifest turns mirror the transcript 1:1 (loader contract)
            var manifest = JsonSerializer.Deserialize<JsonElement>(
                File.ReadAllText(Path.Combine(result.ExampleDir, "manifest.json")));
            var mTurns = manifest.GetProperty("turns").EnumerateArray().ToList();
            Assert.Equal(4, mTurns.Count);
            Assert.Equal(JsonValueKind.Null, mTurns[2].GetProperty("commitSha").ValueKind);
            Assert.Equal(src.ChainShas[1], mTurns[3].GetProperty("commitSha").GetString());
            Assert.Equal(2, result.GoldenCommits);
        }
        finally
        {
            TryDelete(root);
        }
    }

    // --- 4.4c: sources byte-identical after export --------------------------

    [Fact]
    public void Export_LeavesSourceRepoUntouched()
    {
        using var src = new TempSourceRepo(chainLength: 3);
        var (exporter, root) = NewExporter();
        try
        {
            var before = src.Fingerprint();
            var turns = new List<ExportTurnDto>
            {
                new("user", "go", "instruct", null),
                new("assistant", "one", null, src.ChainShas[0]),
                new("assistant", "two", null, src.ChainShas[1]),
                new("assistant", "three", null, src.ChainShas[2]),
            };
            exporter.Export(Request(src, turns, id: "untouched"));

            Assert.Equal(before, src.Fingerprint());
            Assert.DoesNotContain("eval/", src.Git("for-each-ref"));
            Assert.DoesNotContain("golden", src.Git("branch", "--list"));
        }
        finally
        {
            TryDelete(root);
        }
    }

    // --- 4.4d: a non-contiguous association is rejected ---------------------

    [Fact]
    public void NonContiguousChain_IsRejected()
    {
        using var src = new TempSourceRepo(chainLength: 3);
        var (exporter, root) = NewExporter();
        try
        {
            // Associate commits 1 and 3, skipping 2 — golden would not be
            // "exactly those commits in order".
            var turns = new List<ExportTurnDto>
            {
                new("assistant", "one", null, src.ChainShas[0]),
                new("assistant", "three", null, src.ChainShas[2]),
            };
            var ex = Assert.Throws<ArgumentException>(() => exporter.Export(Request(src, turns, id: "gap")));
            Assert.Contains("contiguous", ex.Message);
        }
        finally
        {
            TryDelete(root);
        }
    }

    private static void TryDelete(string dir)
    {
        try
        {
            if (!Directory.Exists(dir)) return;
            foreach (var f in Directory.EnumerateFiles(dir, "*", SearchOption.AllDirectories))
                File.SetAttributes(f, FileAttributes.Normal);
            Directory.Delete(dir, recursive: true);
        }
        catch { /* best effort */ }
    }
}
