using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.TaskGraph;

namespace ClaudeWeb.Services.Policeman;

/// <summary>
/// The policeman (openspec one-policeman): the reading half of the one loop. The verifier reads
/// the facts and moves cards, the judge flags the mechanically stuck; around them, every pass,
/// this class
/// <list type="number">
/// <item><see cref="Trace"/> — BEFORE the verifier: each repo's pull requests, traced to the cards
/// they deliver (<see cref="PrTrace"/>, fed the branches the harness recorded at dispatch so
/// unrecorded work is discovered too — openspec policeman-board-behind) and linked, so a card
/// behind its PR is moved by the facts; a MERGED discovery is marked "board behind reality";</item>
/// <item><see cref="Read"/> — AFTER the verifier: for every in-flight card whose assignee has said
/// something new since its last observation, ONE question to the model (<see cref="ICardReader"/>);
/// the answer, validated, becomes the card's Agent section;</item>
/// <item><see cref="Flag"/> — 🆘 by rule, informed by the reading: an unanswered question, a block
/// or an error that persists; a column that contradicts the facts for two sweeps.</item>
/// </list>
/// Everything is stamped <see cref="Actor"/>; nothing here talks to an agent, moves a card by
/// opinion, or clears a flag it did not raise.
/// </summary>
public sealed class PolicemanSweep
{
    public const string Actor = BoardIntegrity.Policeman;
    /// <summary>How often one repo's PRs are listed on GitHub (an operator's pass lists at once).</summary>
    public static readonly TimeSpan TraceEvery = TimeSpan.FromMinutes(5);
    /// <summary>How long a question / block / error may stand unanswered before the card is flagged.</summary>
    public static readonly TimeSpan AttentionWindow = TimeSpan.FromHours(2);
    /// <summary>A column ahead of the facts is flagged after this many consecutive sweeps.</summary>
    public const int AgainstSweeps = 2;
    public const int ExcerptChars = 240;

    /// <summary>What an assignee last said, kept per card for the Policeman tab.</summary>
    public sealed record Said(string Agent, string Text, long? At, IReadOnlyList<AgentMessage> Tail);

    private readonly TaskGraphService _graph;
    private readonly IPrFactsProbe _pr;
    private readonly IAgentDirectory _agents;
    private readonly ICardReader _reader;
    private readonly PolicemanSettings _settings;
    private readonly Logger _logger;
    private readonly object _gate = new();
    private readonly Dictionary<string, long> _tracedAt = new(StringComparer.Ordinal);   // assignee key → last GitHub listing
    private readonly Dictionary<string, int> _against = new(StringComparer.Ordinal);     // card id → consecutive sweeps ahead of the facts
    private readonly Dictionary<string, Said> _said = new(StringComparer.Ordinal);       // card id → what its agent last said
    private readonly Dictionary<string, string> _behind = new(StringComparer.Ordinal);   // card id → merged PR discovered but unlinkable (board behind reality)

    public PolicemanSweep(TaskGraphService graph, IPrFactsProbe pr, IAgentDirectory agents, ICardReader reader, PolicemanSettings settings, Logger logger)
    {
        _graph = graph;
        _pr = pr;
        _agents = agents;
        _reader = reader;
        _settings = settings;
        _logger = logger;
    }

    /// <summary>What each card's agent last said, as of the last pass.</summary>
    public IReadOnlyDictionary<string, Said> LastSaid { get { lock (_gate) return new Dictionary<string, Said>(_said, StringComparer.Ordinal); } }

    /// <summary>How many consecutive sweeps a card's column has been ahead of the facts.</summary>
    public int AgainstFor(string id) { lock (_gate) return _against.TryGetValue(id, out var n) ? n : 0; }

    /// <summary>The cards the loop polices: not delivered, not manual, not another human developer's (openspec kanban-external-owner).</summary>
    public static bool InFlight(TaskGraphService.Node n) => !CardDomain.IsHandsOff(n) && !TaskLifecycle.IsDelivered(n.Status);

    /// <summary>A card is behind its PR when the PR is open and the column is below PR open, or
    /// the PR is merged and the column is below Merged. Pure.</summary>
    public static bool CardIsBehind(string cardStatus, string prState)
    {
        if (string.Equals(prState, "MERGED", StringComparison.OrdinalIgnoreCase)) return TaskLifecycle.Rank(cardStatus) < TaskLifecycle.Rank(TaskLifecycle.PrMerged);
        if (string.Equals(prState, "OPEN", StringComparison.OrdinalIgnoreCase)) return TaskLifecycle.Rank(cardStatus) < TaskLifecycle.Rank(TaskLifecycle.PrOpened);
        return false;
    }

    // ---- 1. trace ----------------------------------------------------------------------------

    /// <summary>List each relevant repo's pull requests and link every PR that traces to a card
    /// sitting behind it. Only repos with an in-flight assignee that records no PR yet are asked,
    /// at most once per <see cref="TraceEvery"/> unless <paramref name="force"/>.</summary>
    public (IReadOnlyList<PolicemanJournal.Traced> Traced, IReadOnlyList<string> Notes) Trace(long now, bool force)
    {
        var traced = new List<PolicemanJournal.Traced>();
        var notes = new List<string>();
        var wanted = new Dictionary<string, (string? SourceId, string RepoId)>(StringComparer.Ordinal);
        foreach (var n in _graph.Get().Nodes.Where(InFlight))
            foreach (var a in TaskGraphService.AssigneesOf(n))
                // An agentless leg (openspec cross-repo-effort-legs) has no agent to trace through;
                // the verifier resolves its PR from its own checkout's origin + recorded branch.
                if (!TaskLifecycle.IsDelivered(a.Status) && a.PrUrl is null && a.PrNumber is null && Effort.HasAgent(a))
                    wanted[a.Key] = (a.SourceId, a.RepoId);
        foreach (var (key, t) in wanted)
        {
            lock (_gate) if (!force && _tracedAt.TryGetValue(key, out var at) && now - at < TraceEvery.TotalMilliseconds) continue;
            var agent = _agents.ResolveAgent(t.SourceId, t.RepoId);
            if (agent.Error is not null || agent.RepoId is null) { notes.Add($"{t.RepoId}: {agent.Error ?? "unknown agent"}"); continue; }
            var remote = _agents.GitHubRemoteOf(agent);
            lock (_gate) _tracedAt[key] = now;
            if (remote.OwnerRepo is null) { if (remote.Refusal is { } r) notes.Add($"{remote.Label}: {r.Detail}"); continue; }
            IReadOnlyList<PrListItem> prs;
            try { prs = _pr.ListPrs(remote.OwnerRepo, "all", 50); }
            catch (Exception ex) { notes.Add($"{remote.OwnerRepo}: could not list pull requests — {ex.Message}"); continue; }
            var taskBranches = _agents.RecordedTaskBranches(t.SourceId, t.RepoId);
            foreach (var pr in prs)
            {
                var nodes = _graph.Get().Nodes;
                var m = PrTrace.Trace(pr, nodes, agent.RepoId, taskBranches);
                if (m is null || !CardIsBehind(m.Node.Status, pr.State)) continue;
                var merged = string.Equals(pr.State, "MERGED", StringComparison.OrdinalIgnoreCase);
                var mine = TaskGraphService.AssigneesOf(m.Node).FirstOrDefault(a => a.RepoId == agent.RepoId && (a.SourceId ?? "") == (t.SourceId ?? ""));
                if (mine is not null && (mine.PrUrl is not null || mine.PrNumber is not null)) continue; // linked already: the verifier moves it
                if (mine is null && TaskGraphService.AssigneesOf(m.Node).Count > 0)
                {
                    // Another assignee's repo — not linkable from here. A MERGED discovery must
                    // not vanish silently (openspec policeman-board-behind): Flag() raises it.
                    if (merged)
                    {
                        lock (_gate) _behind[m.Node.Id] = $"PR #{pr.Number} is merged ({pr.Url}) but the card records no link, and none of its assignees is on {agent.RepoId} — {m.How}";
                        notes.Add($"{TaskGraphService.CardRef(m.Node.Id)}: merged PR #{pr.Number} discovered but not linkable ({m.How})");
                    }
                    continue;
                }
                // The card recorded nothing and the PR is already merged: the board was BEHIND
                // reality. Link it — the verifier's forward-only advance does the rest.
                _graph.RecordClaim(m.Node.Id, mine?.Key, pr.HeadRefName, null, pr.Url, now);
                lock (_gate) _behind.Remove(m.Node.Id);
                traced.Add(new PolicemanJournal.Traced(m.Node.Id, m.Node.Title, $"PR #{pr.Number} {pr.State.ToLowerInvariant()}", m.How, Behind: merged));
                _logger.Info($"[POLICEMAN] {(merged ? "board behind reality: " : "")}PR #{pr.Number} ({pr.State}) traced to {TaskGraphService.CardRef(m.Node.Id)}: {m.How}");
            }
        }
        return (traced, notes);
    }

    // ---- 2. read -----------------------------------------------------------------------------

    /// <summary>For every in-flight card: what its assignee last said, and — when that is newer
    /// than the card's last observation — one question to the model, its answer written on the
    /// card. Reading is skipped (words still gathered) when the settings say so.</summary>
    public (IReadOnlyList<PolicemanJournal.Question> Questions, IReadOnlyList<string> Notes) Read(long now, CancellationToken ct = default)
    {
        var questions = new List<PolicemanJournal.Question>();
        var notes = new List<string>();
        var settings = _settings.Current;
        var asked = 0;
        foreach (var n in _graph.Get().Nodes.Where(InFlight))
        {
            // A handoff already read (openspec policeman-handoff-detection): every pass looks for
            // the follow-up card it calls for, so the badge stops asking once someone created it —
            // no model call, pure correlation, whether or not the agent has said anything new.
            if (n.Observation is { By: Actor, State: CardObservations.Handoff, FollowUpId: null } pending
                && Handoffs.FollowUpFor(n, pending, _graph.Get().Nodes, ResolveTargetRepo) is { } followUp)
            {
                _graph.SetObservation(n.Id, pending with { FollowUpId = followUp.Id }, now, onlyIfBy: Actor);
                notes.Add($"{TaskGraphService.CardRef(n.Id)}: handoff tracked — follow-up {TaskGraphService.CardRef(followUp.Id)} \"{followUp.Title}\"");
            }
            var set = TaskGraphService.AssigneesOf(n).Where(a => !TaskLifecycle.IsDelivered(a.Status) && Effort.HasAgent(a)).ToList();
            if (set.Count == 0) continue;
            Said? best = null;
            foreach (var a in set)
            {
                var (msgs, refusal) = _agents.ReadTranscript(a.SourceId, a.RepoId, settings.Tail);
                if (msgs is null) { notes.Add($"{TaskGraphService.CardRef(n.Id)}: {refusal}"); continue; }
                var last = msgs.LastOrDefault(m => m.Role == "assistant") ?? msgs.LastOrDefault();
                if (last is null) continue;
                var said = new Said(_agents.AgentLabel(a.SourceId, a.RepoId), last.Text, last.At, msgs);
                if (best is null || (said.At ?? 0) > (best.At ?? 0)) best = said;
            }
            if (best is null) continue;
            lock (_gate) _said[n.Id] = best;
            var cur = _graph.Find(n.Id) ?? n;
            var newer = best.At is { } at ? cur.Observation is null || at > cur.Observation.At : cur.Observation is null;
            if (!newer) continue;
            if (!settings.Enabled) continue;
            if (asked >= settings.MaxQuestionsPerPass) { notes.Add($"{TaskGraphService.CardRef(n.Id)}: not asked — this pass's {settings.MaxQuestionsPerPass} questions are spent; next pass"); continue; }
            asked++;
            var q = new CardQuestion(n.Id, n.Title, cur.Status, cur.VerifiedStatus ?? TaskLifecycle.Todo, best.Agent, best.Tail);
            CardReading reading;
            try { reading = _reader.ReadAsync(q, ct).GetAwaiter().GetResult(); }
            catch (Exception ex) { reading = new CardReading(null, null, 0, ex.Message); }
            var excerpt = best.Text.Length > ExcerptChars ? best.Text[..ExcerptChars].TrimEnd() + "…" : best.Text;
            if (reading.Error is not null || !CardObservations.IsState(reading.State) || string.IsNullOrWhiteSpace(reading.Summary))
            {
                questions.Add(new PolicemanJournal.Question(n.Id, n.Title, best.Agent, excerpt, null, null, reading.Tokens, reading.Error ?? "no usable answer"));
                continue;
            }
            var summary = reading.Summary!.Trim();
            if (summary.Length > CardObservations.MaxSummary) summary = summary[..CardObservations.MaxSummary].TrimEnd() + "…";
            var observation = new TaskGraphService.CardObservation(now, Actor, reading.State!, summary, null, reading.State == CardObservations.Handoff ? Handoffs.CleanTarget(reading.Target) : null);
            // A handoff whose follow-up already exists (the arch was faster) is tracked at once.
            if (observation.State == CardObservations.Handoff && Handoffs.FollowUpFor(cur, observation, _graph.Get().Nodes, ResolveTargetRepo) is { } existing)
                observation = observation with { FollowUpId = existing.Id };
            _graph.SetObservation(n.Id, observation, now);
            questions.Add(new PolicemanJournal.Question(n.Id, n.Title, best.Agent, excerpt, reading.State, summary, reading.Tokens, null));
        }
        return (questions, notes);
    }

    // ---- 3. flag -----------------------------------------------------------------------------

    /// <summary>🆘 by rule, informed by the reading; and the loop's own such flags withdrawn once
    /// the reason is gone. The judge's mechanical stamps (stuck by silence or an explicit block)
    /// are its own to raise and clear; a flag by an agent or the Operator is never touched.</summary>
    public void Flag(long now)
    {
        foreach (var n in _graph.Get().Nodes.Where(InFlight))
        {
            var reason = ReasonFor(n, now);
            var cur = n.NeedsHuman;
            if (reason is not null)
            {
                if (cur is null) _graph.SetNeedsHuman(n.Id, new TaskGraphService.HumanRequest(now, Actor, reason), now);
            }
            else if (cur is { By: Actor or BoardIntegrity.BoardCheck } && !BoardIntegrity.IsMechanicalReason(cur.Reason))
            {
                _graph.SetNeedsHuman(n.Id, null, now, onlyIfBy: cur.By);
            }
        }
    }

    /// <summary>Pure but for the against-counter: why the loop would flag this card now, or null.</summary>
    public string? ReasonFor(TaskGraphService.Node n, long now)
    {
        string? reason = null;
        var o = n.Observation;
        if (o is not null && o.By == Actor && CardObservations.NeedsAttention(o.State) && now - o.At >= AttentionWindow.TotalMilliseconds)
        {
            var since = Ago(now - o.At);
            reason = o.State switch
            {
                CardObservations.AskedQuestion => $"asked a question {since} ago and nobody answered: {o.Summary}",
                CardObservations.Blocked => $"says it is blocked, for {since}: {o.Summary}",
                // A handoff is flagged only while no follow-up card exists (openspec policeman-handoff-detection).
                CardObservations.Handoff => o.FollowUpId is null
                    ? $"ended in a handoff {since} ago and no follow-up task exists yet{(o.Target is null ? "" : $" (for {o.Target})")}: {o.Summary}"
                    : null,
                _ => $"its last turn failed, {since} ago: {o.Summary}",
            };
        }
        var set = TaskGraphService.AssigneesOf(n);
        var ahead = set.Count > 0 ? set.Any(a => TaskLifecycle.IsUnverified(a.Status, a.VerifiedStatus)) : TaskLifecycle.IsUnverified(n.Status, n.VerifiedStatus);
        int against;
        lock (_gate)
        {
            if (ahead) _against[n.Id] = against = (_against.TryGetValue(n.Id, out var c) ? c : 0) + 1;
            else { _against.Remove(n.Id); against = 0; }
        }
        // A cross-repo effort whose column claims merged while a leg is not (openspec
        // cross-repo-effort-legs) is flagged at once, EVERY leg named — never silently done.
        if (reason is null && Effort.MismatchReason(n, a => Effort.IsAgentless(a) ? Effort.LegLabel(a) + " (no agent)" : _agents.AgentLabel(a.SourceId, a.RepoId)) is { } mismatch)
            reason = mismatch;
        if (reason is null && against >= AgainstSweeps)
            reason = $"the column says {Word(n.Status)} but the facts show only {Word(n.VerifiedStatus)}, for {against} sweeps";
        // Board behind reality (openspec policeman-board-behind): a merged PR was discovered
        // for this card but could not be linked. Self-clears once the card records a PR link
        // (the verifier takes over) or has advanced to pr-merged anyway.
        string? behind;
        lock (_gate)
        {
            _behind.TryGetValue(n.Id, out behind);
            if (behind is not null && (n.PrUrl is not null || n.PrNumber is not null
                || set.Any(a => a.PrUrl is not null || a.PrNumber is not null)
                || TaskLifecycle.Rank(n.Status) >= TaskLifecycle.Rank(TaskLifecycle.PrMerged)))
            {
                _behind.Remove(n.Id);
                behind = null;
            }
        }
        if (reason is null && behind is not null) reason = "board behind reality — " + behind;
        return reason;
    }

    private static string Word(string? status) => status switch
    {
        "todo" => "To do", "doing" => "Doing", "committed" => "Committed", "pr-opened" => "PR open", "pr-merged" => "Merged", "done" => "Done", _ => "To do",
    };

    /// <summary>The repo id a handoff's target names (a handle, id or unique name the fleet
    /// knows), or null when the words are looser than that ("a prg agent").</summary>
    private string? ResolveTargetRepo(string target)
    {
        try
        {
            var a = _agents.ResolveAgent(null, target);
            return a.Error is null ? a.RepoId : null;
        }
        catch { return null; }
    }

    private static string Ago(long ms)
    {
        if (ms < 3600_000) return $"{Math.Max(1, ms / 60_000)} min";
        var h = ms / 3600_000.0;
        return h < 48 ? $"{h:0.#} h" : $"{Math.Floor(h / 24)} d";
    }
}
