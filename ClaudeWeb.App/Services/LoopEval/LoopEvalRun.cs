using System.Text.Json;
using ClaudeWeb.Services.Auth;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.LoopEval;

/// <summary>
/// One live-mode eval run's state (openspec: add-loop-eval-ui-runner, design D3).
/// Owns the run's one-shot session credential and derives the UI-visible state
/// machine (preflight → armed → running → passed/failed/error/stopped) purely
/// from the runner's stdout — the suite's own output is the single source of
/// truth, this class only parses it:
///   - <c>@@LOOPEVAL@@ {json}</c> lines → per-assertion verdicts + per-scenario
///     summaries (the suite's existing machine-readable contract),
///   - the watch banner / arm assert → armed,
///   - the per-poll <c>loop status=…</c> lines → running + iteration count.
///
/// CREDENTIAL LIFETIME = RUN LIFETIME: the ctor mints a tagged session in the
/// real session store; every terminal transition (exit, stop, error) revokes
/// exactly that session. The raw token is held internally for the child's env
/// and never appears in a snapshot. Stale tokens from a crashed harness are
/// swept by tag at service start (see LoopEvalRunnerService).
///
/// Thread-safe: stdout/stderr callbacks, the waiter task, and HTTP requests all
/// touch a run concurrently.
/// </summary>
public sealed class LoopEvalRun
{
    /// <summary>The session tag every runner-minted credential carries, so a
    /// boot-time sweep can revoke orphans without touching browser sessions.</summary>
    public const string SessionTag = "loopeval-runner";

    private const int TailMaxLines = 500;
    private const string VerdictMarker = "@@LOOPEVAL@@";

    public sealed record AssertRecord(string Scenario, string Name, bool Ok, string Detail);
    public sealed record SummaryRecord(string Scenario, bool Pass, IReadOnlyList<string> Failed);

    private readonly AuthService _auth;
    private readonly Logger _logger;
    private readonly object _gate = new();
    private readonly List<string> _tail = new();
    private readonly List<AssertRecord> _asserts = new();
    private readonly List<SummaryRecord> _summaries = new();
    private string _state = "preflight";
    private int? _exitCode;
    private string? _error;
    private int? _iteration;
    private long? _finishedAt;
    private IReadOnlyList<string> _leftoverRepos = Array.Empty<string>();
    private int _rev;

    public string Scenario { get; }
    public string Title { get; }
    public string RunId { get; } = Guid.NewGuid().ToString("N");
    public long StartedAt { get; } = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <summary>The raw one-shot session token for the child's env. Internal on
    /// purpose: it must never leave the process except via LOOPEVAL_LIVE_TOKEN.</summary>
    internal string Token { get; }

    public LoopEvalRun(string scenario, string title, AuthService auth, Logger logger)
    {
        Scenario = scenario;
        Title = title;
        _auth = auth;
        _logger = logger;
        Token = auth.CreateSession(SessionTag);
    }

    /// <summary>Bumped on every mutation — the SSE stream sends a fresh snapshot
    /// whenever (RunId, Rev) changes.</summary>
    public int Rev { get { lock (_gate) return _rev; } }

    public bool IsTerminal
    {
        get { lock (_gate) return _state is "passed" or "failed" or "error" or "stopped"; }
    }

    /// <summary>Feed one runner output line: append to the tail and advance the
    /// derived state. Safe to call after a terminal transition (tail still
    /// grows for late flushes; the state never leaves a terminal value).</summary>
    public void FeedLine(string? line)
    {
        if (line is null) return;
        lock (_gate)
        {
            _tail.Add(line);
            if (_tail.Count > TailMaxLines) _tail.RemoveRange(0, _tail.Count - TailMaxLines);

            var marker = line.IndexOf(VerdictMarker, StringComparison.Ordinal);
            if (marker >= 0) ParseVerdict(line[(marker + VerdictMarker.Length)..].Trim());

            if (_state is "preflight" && line.Contains("WATCH IT LIVE", StringComparison.Ordinal))
                _state = "armed";
            if (_state is "preflight" or "armed" && line.Contains("loop status=", StringComparison.Ordinal))
                _state = "running";

            var iter = IterationOf(line);
            if (iter is not null) _iteration = iter;

            _rev++;
        }
    }

    // Caller holds _gate.
    private void ParseVerdict(string json)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var scenario = root.TryGetProperty("scenario", out var sc) ? sc.GetString() ?? "" : "";
            if (root.TryGetProperty("summary", out var sm) && sm.ValueKind == JsonValueKind.True)
            {
                var failed = root.TryGetProperty("failed", out var f) && f.ValueKind == JsonValueKind.Array
                    ? f.EnumerateArray().Select(x => x.GetString() ?? "").ToList()
                    : new List<string>();
                _summaries.Add(new SummaryRecord(scenario,
                    root.TryGetProperty("pass", out var p) && p.ValueKind == JsonValueKind.True, failed));
            }
            else if (root.TryGetProperty("assert", out var name))
            {
                var ok = root.TryGetProperty("ok", out var okEl) && okEl.ValueKind == JsonValueKind.True;
                var detail = root.TryGetProperty("detail", out var d) ? d.GetString() ?? "" : "";
                _asserts.Add(new AssertRecord(scenario, name.GetString() ?? "", ok, detail));
                // Belt-and-braces armed signal: the arm assert fires just before
                // the watch banner, so either one flips the state.
                if (_state is "preflight" && ok &&
                    (name.GetString() ?? "").EndsWith("loop armed", StringComparison.Ordinal))
                    _state = "armed";
            }
        }
        catch (JsonException)
        {
            // A torn/interleaved line — the tail still shows it verbatim.
        }
    }

    private static int? IterationOf(string line)
    {
        var at = line.IndexOf("iter=", StringComparison.Ordinal);
        if (at < 0) return null;
        var start = at + 5;
        var end = start;
        while (end < line.Length && char.IsDigit(line[end])) end++;
        return end > start && int.TryParse(line.AsSpan(start, end - start), out var n) ? n : null;
    }

    /// <summary>Terminal transition for a completed process. Exit 0 = passed;
    /// nonzero with recorded verdicts = failed (the suite spoke); nonzero with
    /// none = error (it crashed before saying anything). No-op if already
    /// terminal (a Stop won the race). Revokes the run's session.</summary>
    public void MarkExited(int exitCode)
    {
        lock (_gate)
        {
            if (IsTerminalUnsafe()) return;
            _exitCode = exitCode;
            _state = exitCode == 0 ? "passed"
                : _asserts.Count > 0 || _summaries.Count > 0 ? "failed"
                : "error";
            FinishUnsafe();
        }
        Revoke();
    }

    /// <summary>Terminal transition for an operator stop. Revokes the session.</summary>
    public void MarkStopped()
    {
        lock (_gate)
        {
            if (IsTerminalUnsafe()) return;
            _state = "stopped";
            FinishUnsafe();
        }
        Revoke();
    }

    /// <summary>Terminal transition for a harness-side failure (spawn error,
    /// timeout). Revokes the session.</summary>
    public void MarkError(string message)
    {
        lock (_gate)
        {
            if (IsTerminalUnsafe()) return;
            _error = message;
            _tail.Add(message);
            _state = "error";
            FinishUnsafe();
        }
        Revoke();
    }

    /// <summary>Post-terminal leftover report: any <c>loopeval-*-live</c> repo
    /// still registered after the run ended (design D3 — detected and named,
    /// never silently ignored).</summary>
    public void SetLeftoverRepos(IReadOnlyList<string> names)
    {
        lock (_gate)
        {
            _leftoverRepos = names;
            _rev++;
        }
    }

    private bool IsTerminalUnsafe() => _state is "passed" or "failed" or "error" or "stopped";

    private void FinishUnsafe()
    {
        _finishedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        _rev++;
    }

    private void Revoke()
    {
        _auth.RevokeSession(Token);
        _logger.Info($"[LOOPEVAL] run {Scenario} reached '{SnapshotState()}' — one-shot session revoked");
    }

    private string SnapshotState() { lock (_gate) return _state; }

    /// <summary>The UI-facing view. Never includes the token.</summary>
    public object Snapshot()
    {
        lock (_gate)
        {
            return new
            {
                scenario = Scenario,
                title = Title,
                state = _state,
                startedAt = StartedAt,
                finishedAt = _finishedAt,
                exitCode = _exitCode,
                iteration = _iteration,
                error = _error,
                pass = _state == "passed" ? true : _state is "failed" or "error" or "stopped" ? false : (bool?)null,
                asserts = _asserts.Select(a => new { scenario = a.Scenario, name = a.Name, ok = a.Ok, detail = a.Detail }).ToList<object>(),
                summaries = _summaries.Select(s => new { scenario = s.Scenario, pass = s.Pass, failed = s.Failed }).ToList<object>(),
                leftoverRepos = _leftoverRepos,
                tail = string.Join("\n", _tail),
            };
        }
    }
}
