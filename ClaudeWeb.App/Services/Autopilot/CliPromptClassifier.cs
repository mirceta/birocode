using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text.Json;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// The REAL brain (fix-suggestion-loop-inert, D5 — the slice the stub always
/// stood in for): classifies the agent's trailing message against the user's
/// routine prompts with a one-shot <c>claude -p</c> call (fast/cheap model, JSON
/// out: chosen routine index or abstain + confidence + one-line reason), behind
/// the exact <see cref="PromptClassifier.Verdict"/> contract the gate already
/// consumes — the brain proposes, the gate disposes. Threshold, word-scoped
/// kill switch and operator gate apply to CLI verdicts identically.
///
/// <para><b>Off the tick path.</b> A CLI call takes seconds; the engine's 10s
/// tick must never block on it. <see cref="TryGetOrStart"/> is per-repo
/// single-flight: the tick that first sees a NEW trailing message starts one
/// background classification and reports in-flight (the engine holds with a
/// "classifying" reason); later ticks consume the cached verdict. The cache is
/// keyed by the message snippet, so one new agent message costs at most one CLI
/// call per armed repo — the engine's own per-message dedup then keeps the
/// verdict from being re-acted-on.</para>
///
/// <para><b>Fallback.</b> On CLI error, timeout, or unparseable output the stub
/// classifier's verdict is used and its reason notes the fallback — a broken CLI
/// can only ever degrade the loop to the stub, never wedge it.</para>
///
/// <para><c>CLAUDEWEB_BRAIN_CLI</c> overrides the spawned executable (the e2e
/// points it at a fake); the prompt travels via STDIN, so even a .cmd shim is
/// safe here (no multiline-argument truncation — see
/// <see cref="CliRunnerService"/>'s resolver note).</para>
/// </summary>
public class CliPromptClassifier
{
    private static readonly TimeSpan CliTimeout = TimeSpan.FromSeconds(90);
    private const int MaxMessageChars = 4000;

    private readonly PromptClassifier _stub;
    private readonly Logger _logger;

    public CliPromptClassifier(PromptClassifier stub, Logger logger)
    {
        _stub = stub;
        _logger = logger;
    }

    // One slot per repo: the snippet being (or already) classified and, once the
    // background call lands, its verdict. A newer snippet replaces the slot — a
    // late result for a superseded message is dropped on arrival.
    private sealed class Slot
    {
        public string Snippet = "\0none";
        public PromptClassifier.Verdict? Verdict;
    }

    private readonly ConcurrentDictionary<string, Slot> _slots = new();

    /// <summary>Single-flight cache lookup: returns the cached verdict for this
    /// repo+message, or starts one background classification and reports
    /// in-flight. Never blocks.</summary>
    public (PromptClassifier.Verdict? Verdict, bool InFlight) TryGetOrStart(
        string repoId, string message, string snippet, double threshold,
        IReadOnlyList<PromptClassifier.Routine> routines, string model)
    {
        var slot = _slots.GetOrAdd(repoId, _ => new Slot());
        lock (slot)
        {
            if (slot.Snippet == snippet)
                return (slot.Verdict, slot.Verdict is null);
            slot.Snippet = snippet;
            slot.Verdict = null;
        }

        _ = Task.Run(async () =>
        {
            var v = await ClassifyOnceAsync(message, threshold, routines, model);
            lock (slot)
            {
                if (slot.Snippet == snippet) slot.Verdict = v;
            }
        });
        return (null, true);
    }

    /// <summary>One full classification: CLI call, parse, then the same fence
    /// the stub applies (threshold). Falls back to the
    /// stub verdict on any CLI failure, noting the fallback in the reason.</summary>
    private async Task<PromptClassifier.Verdict> ClassifyOnceAsync(
        string message, double threshold, IReadOnlyList<PromptClassifier.Routine> routines, string model)
    {
        // The stub already answers the degenerate cases deterministically — no
        // routines, empty message — without spending a CLI call.
        if (routines.Count == 0 || string.IsNullOrWhiteSpace(message))
            return _stub.Classify(message, threshold, routines);

        string raw;
        try
        {
            var sw = Stopwatch.StartNew();
            raw = await RunCliAsync(BuildPrompt(message, routines), model);
            _logger.Info($"[AUTOPILOT] cli brain answered in {sw.Elapsed.TotalSeconds:0.0}s");
        }
        catch (Exception ex)
        {
            _logger.Error($"[AUTOPILOT] cli brain failed ({ex.Message}) — falling back to the stub");
            return Fallback(ex.Message, message, threshold, routines);
        }

        if (ParseChoice(raw) is not { } choice)
        {
            _logger.Error("[AUTOPILOT] cli brain output unparseable — falling back to the stub");
            return Fallback("unparseable output", message, threshold, routines);
        }

        var (index, confidence, reason) = choice;
        if (index < 0 || index >= routines.Count)
            return new PromptClassifier.Verdict(true, null, Math.Clamp(confidence, 0, 1),
                $"cli: {(string.IsNullOrWhiteSpace(reason) ? "no routine clearly applies" : reason)}");

        var label = routines[index].Label;
        var conf = Math.Round(Math.Clamp(confidence, 0, 1), 2);

        // The gate's threshold applies to CLI verdicts identically (D5).
        if (conf < threshold)
            return new PromptClassifier.Verdict(true, label, conf,
                $"below threshold ({conf:0.00} < {threshold:0.00}) — cli: {reason}");
        return new PromptClassifier.Verdict(false, label, conf, $"cli: {reason}");
    }

    private PromptClassifier.Verdict Fallback(
        string why, string message, double threshold, IReadOnlyList<PromptClassifier.Routine> routines)
    {
        var s = _stub.Classify(message, threshold, routines);
        return s with { Reason = $"cli fallback ({AutopilotService.Snippet(why)}): {s.Reason}" };
    }

    // The classification prompt: the trailing message, the numbered label space,
    // and a strict JSON-only reply contract. The CLI may only pick an index (or
    // abstain) — it can never introduce text the user didn't put in their list.
    private static string BuildPrompt(string message, IReadOnlyList<PromptClassifier.Routine> routines)
    {
        var msg = message.Length > MaxMessageChars ? message[..MaxMessageChars] + "…" : message;
        var list = string.Join("\n", routines.Select((r, i) => $"{i}: {r.Label.Replace('\n', ' ')}"));
        return
            "You are a routing classifier inside an automation harness. A coding agent just ended its turn with this message:\n\n"
            + "<agent_message>\n" + msg + "\n</agent_message>\n\n"
            + "The user's routine prompts (the replies they habitually send next):\n" + list + "\n\n"
            + "Which routine, if any, is clearly the right next reply to that message? "
            + "Answer with ONLY one JSON object, no prose, no code fence:\n"
            + "{\"index\": <routine number, or -1 if none clearly applies>, \"confidence\": <0.0-1.0>, \"reason\": \"<one short sentence>\"}";
    }

    /// <summary>Spawns the one-shot CLI call: prompt on STDIN, <c>--output-format
    /// json</c> envelope on stdout. Kills the process on timeout.</summary>
    private static async Task<string> RunCliAsync(string prompt, string model)
    {
        var exe = Environment.GetEnvironmentVariable("CLAUDEWEB_BRAIN_CLI");
        if (string.IsNullOrWhiteSpace(exe)) exe = CliRunnerService.ClaudeExecutable;

        var psi = new ProcessStartInfo
        {
            FileName = exe,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = System.Text.Encoding.UTF8,
            // Neutral cwd: classification must not pick up a repo's project
            // context (or cost its tokens) — it only routes between known labels.
            WorkingDirectory = Path.GetTempPath(),
        };
        psi.ArgumentList.Add("-p");
        psi.ArgumentList.Add("--output-format");
        psi.ArgumentList.Add("json");
        psi.ArgumentList.Add("--model");
        psi.ArgumentList.Add(model);
        // Max-plan / CLI auth, like every harness CLI spawn.
        psi.EnvironmentVariables.Remove("ANTHROPIC_API_KEY");

        using var process = new Process { StartInfo = psi };
        process.Start();
        await process.StandardInput.WriteAsync(prompt);
        process.StandardInput.Close();

        using var cts = new CancellationTokenSource(CliTimeout);
        var stdout = process.StandardOutput.ReadToEndAsync(cts.Token);
        try
        {
            await process.WaitForExitAsync(cts.Token);
        }
        catch (OperationCanceledException)
        {
            try { process.Kill(entireProcessTree: true); } catch { /* already gone */ }
            throw new TimeoutException($"cli call exceeded {CliTimeout.TotalSeconds:0}s");
        }
        var output = await stdout;
        if (process.ExitCode != 0)
            throw new InvalidOperationException($"cli exited {process.ExitCode}");
        return output;
    }

    /// <summary>Unwraps the CLI's <c>--output-format json</c> envelope, then the
    /// model's JSON object from the result text. Null = unparseable.</summary>
    private static (int Index, double Confidence, string Reason)? ParseChoice(string raw)
    {
        try
        {
            // The envelope is the last JSON line on stdout ({"type":"result",...}).
            string? resultText = null;
            foreach (var line in raw.Split('\n'))
            {
                var t = line.Trim();
                if (t.Length == 0 || t[0] != '{') continue;
                try
                {
                    using var doc = JsonDocument.Parse(t);
                    if (doc.RootElement.TryGetProperty("result", out var res) && res.ValueKind == JsonValueKind.String)
                        resultText = res.GetString();
                }
                catch { /* not the envelope line */ }
            }
            if (resultText is null) return null;

            var start = resultText.IndexOf('{');
            var end = resultText.LastIndexOf('}');
            if (start < 0 || end <= start) return null;
            using var choice = JsonDocument.Parse(resultText[start..(end + 1)]);
            var root = choice.RootElement;
            var index = root.TryGetProperty("index", out var i) && i.ValueKind == JsonValueKind.Number ? i.GetInt32() : -1;
            var conf = root.TryGetProperty("confidence", out var c) && c.ValueKind == JsonValueKind.Number ? c.GetDouble() : 0;
            var reason = root.TryGetProperty("reason", out var r) && r.ValueKind == JsonValueKind.String ? r.GetString() ?? "" : "";
            return (index, conf, reason);
        }
        catch
        {
            return null;
        }
    }
}
