using System.Text;
using System.Text.RegularExpressions;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Prompts;
using ClaudeWeb.Services.Repositories;

namespace ClaudeWeb.Services.Autopilot;

/// <summary>
/// Slice 1 of loop-autopilot (plans/loop-autopilot.md): DISCOVER the user's
/// recurring "routine" prompts by mining the Claude Code transcripts already on
/// disk (~/.claude/projects/&lt;cwd&gt;/&lt;session&gt;.jsonl). The autopilot brain
/// later classifies each agent turn into one of these or "escalate"; before any
/// of that we just surface what the user actually keeps re-typing, so they can
/// confirm the set.
///
/// Read-only and backfill-only: it reuses <see cref="SessionService"/> to parse
/// every session for every registered repo, groups the human-typed messages by a
/// normalised key, and reports the ones that recur. No acting, no new writes.
/// </summary>
public class AutopilotDiscoveryService
{
    private readonly RepositoryRegistry _repos;
    private readonly SessionService _sessions;
    private readonly PromptsService _prompts;
    private readonly Logger _logger;

    public AutopilotDiscoveryService(
        RepositoryRegistry repos, SessionService sessions, PromptsService prompts, Logger logger)
    {
        _repos = repos;
        _sessions = sessions;
        _prompts = prompts;
        _logger = logger;
    }

    // A prompt must recur at least this many times across history to count as
    // "routine" — one-off task prompts appear once and are filtered out.
    private const int MinCount = 3;
    // A genuine routine reply is SHORT ("deploy", "keep it", "continue from where you
    // left off"). Anything longer is a one-off instruction or a pasted block (skill
    // files, command output, multi-paragraph rants) — never a sendable routine, even
    // if its wrapper text recurs. Cap on the normalised key length.
    private const int MaxRoutineChars = 64;
    // Cap sessions scanned per repo (newest first) so a huge history can't make
    // the scan unbounded; plenty to surface what recurs.
    private const int MaxSessionsPerRepo = 150;
    private const int MaxSampleContexts = 3;
    private const int SampleContextChars = 160;

    public sealed record RoutinePrompt(
        string Text,
        int Count,
        int Sessions,
        int Repos,
        bool MatchesCustomPrompt,
        IReadOnlyList<string> SampleContexts);

    public sealed record DiscoveryResult(
        int SessionsScanned,
        int UserMessagesScanned,
        IReadOnlyList<RoutinePrompt> Routines);

    public DiscoveryResult Discover()
    {
        // key (normalised text) -> accumulator
        var groups = new Dictionary<string, Group>();
        var sessionsScanned = 0;
        var userMessages = 0;

        foreach (var repo in _repos.GetAll().Where(r => r.Exists))
        {
            List<SessionSummary> sessions;
            try { sessions = _sessions.ListSessions(repo.Path); }
            catch (Exception ex) { _logger.Error($"[AUTOPILOT] list sessions failed for {repo.Name}: {ex.Message}"); continue; }

            foreach (var session in sessions.Take(MaxSessionsPerRepo))
            {
                var msgs = _sessions.GetMessages(repo.Path, session.Id);
                if (msgs.Count == 0) continue;
                sessionsScanned++;

                string? lastAssistant = null;
                foreach (var m in msgs)
                {
                    if (m.Role == "assistant")
                    {
                        lastAssistant = m.Text;
                        continue;
                    }

                    // m.Role == "user": a human-typed reply.
                    userMessages++;
                    var key = Normalise(m.Text);
                    // Must be short, not system-noise, and contain a letter (drops bare
                    // list fragments like "1." that normalise to digits/punctuation).
                    if (key.Length == 0 || key.Length > MaxRoutineChars
                        || !key.Any(char.IsLetter) || IsNoise(key)) continue;

                    if (!groups.TryGetValue(key, out var g))
                    {
                        g = new Group();
                        groups[key] = g;
                    }
                    g.Count++;
                    g.SessionIds.Add(session.Id);
                    g.RepoIds.Add(repo.Id);
                    g.BumpOriginal(m.Text.Trim());
                    if (lastAssistant != null && g.Samples.Count < MaxSampleContexts)
                        g.Samples.Add(Snippet(lastAssistant));
                }
            }
        }

        var customKeys = _prompts.List()
            .SelectMany(p => new[] { Normalise(p.Text), Normalise(p.Label) })
            .Where(k => k.Length > 0)
            .ToHashSet();

        var routines = groups
            .Where(kv => kv.Value.Count >= MinCount)
            .Select(kv => new RoutinePrompt(
                Text: kv.Value.BestOriginal(),
                Count: kv.Value.Count,
                Sessions: kv.Value.SessionIds.Count,
                Repos: kv.Value.RepoIds.Count,
                MatchesCustomPrompt: customKeys.Contains(kv.Key),
                SampleContexts: kv.Value.Samples))
            .OrderByDescending(r => r.Count)
            .ThenByDescending(r => r.Sessions)
            .ToList();

        _logger.Info($"[AUTOPILOT] discovery: {routines.Count} routine prompts from {sessionsScanned} sessions, {userMessages} user messages");
        return new DiscoveryResult(sessionsScanned, userMessages, routines);
    }

    private sealed class Group
    {
        public int Count;
        public readonly HashSet<string> SessionIds = new();
        public readonly HashSet<string> RepoIds = new();
        public readonly List<string> Samples = new();
        private readonly Dictionary<string, int> _originals = new();

        public void BumpOriginal(string original)
        {
            _originals.TryGetValue(original, out var n);
            _originals[original] = n + 1;
        }

        // The most common original casing/spacing for display.
        public string BestOriginal() =>
            _originals.OrderByDescending(kv => kv.Value).First().Key;
    }

    private static readonly Regex Whitespace = new(@"\s+", RegexOptions.Compiled);

    /// <summary>
    /// Group key: lowercase, whitespace collapsed, surrounding punctuation
    /// trimmed — so "Deploy.", "deploy" and "deploy\n" all count as one routine.
    /// </summary>
    private static string Normalise(string text)
    {
        if (string.IsNullOrWhiteSpace(text)) return "";
        var s = Whitespace.Replace(text.Trim().ToLowerInvariant(), " ");
        return s.Trim(' ', '.', '!', '?', ',', ';', ':');
    }

    // System-injected "user" lines that aren't anything the human typed — the
    // CLI records these when a turn is interrupted, a tool is cancelled, a slash
    // command runs, or a skill/caveat block is spliced in. They recur structurally
    // and would otherwise masquerade as a top routine prompt.
    private static bool IsNoise(string normalisedKey) =>
        normalisedKey.StartsWith("[request interrupted") ||
        normalisedKey == "[no response requested]" ||
        normalisedKey.StartsWith("api error") ||
        normalisedKey.StartsWith("[the user") ||
        // CLI/system wrapper tags: <command-name>, <command-message>,
        // <local-command-caveat>, <system-reminder>, etc.
        normalisedKey.StartsWith("<") ||
        // A slash command the user invoked, not a reply they typed.
        normalisedKey.StartsWith("/") ||
        // Pasted skill/instruction blocks the CLI records as a user turn.
        normalisedKey.StartsWith("base directory for this skill") ||
        normalisedKey.StartsWith("caveat:");

    private static string Snippet(string text)
    {
        var s = Whitespace.Replace(text.Trim(), " ");
        return s.Length > SampleContextChars ? s[..SampleContextChars] + "…" : s;
    }
}
