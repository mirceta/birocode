using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;
using ClaudeWeb.Services.Policeman;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec policeman-handoff-detection (fleet task f6179626): an agent's conversation that ENDS
/// by calling for a NEW task on ANOTHER agent is read as <c>handoff</c> through the same
/// one-question pipeline — the reader's prompt names the state, its parser reads the target, the
/// sweep stamps the Agent section with the summary + target, flags it after the window while no
/// follow-up exists, and every pass correlates a follow-up card (by the source #ref, by the target
/// repo, or by shared words) after which the badge reads "tracked" and is never flagged.
/// </summary>
public sealed class PolicemanHandoffTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-handoff-" + Guid.NewGuid().ToString("N"));
    private readonly Logger _logger = new();
    private readonly TaskGraphService _graph;
    private readonly FakeFleet _fleet = new();
    private readonly FakePrs _prs = new();
    private readonly FakeReader _reader = new();
    private readonly PolicemanSettings _settings = new(null);
    private readonly PolicemanSweep _sweep;
    private static readonly long Now0 = 1_700_000_000_000L;
    private const long H = 3600_000L;

    public PolicemanHandoffTests()
    {
        Directory.CreateDirectory(_dir);
        _graph = new TaskGraphService(_logger, _dir, new NotesService(_logger, _dir));
        _sweep = new PolicemanSweep(_graph, _prs, _fleet, _reader, _settings, _logger);
    }

    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private TaskGraphService.Node Card(string title, string repo = "r-webflow", long at = 0)
    {
        var t = at == 0 ? Now0 : at;
        var n = _graph.AddNode(title, null, repo, null, 0, 0, t)!;
        _graph.Assign(n.Id, null, repo, "arch", t);
        _graph.MarkDispatched(n.Id, t);
        return _graph.UpdateNode(n.Id, null, null, null, null, "doing", null, null, t)!;
    }

    // ---- fakes ----------------------------------------------------------------------------------

    private sealed class FakeFleet : IAgentDirectory
    {
        public readonly Dictionary<string, List<AgentMessage>> Transcripts = new(StringComparer.Ordinal);
        /// <summary>name → repoId, what the fleet can resolve; anything else is an error.</summary>
        public readonly Dictionary<string, string> Known = new(StringComparer.OrdinalIgnoreCase) { ["prg"] = "r-prg", ["spacex/prg#1"] = "r-prg", ["r-prg"] = "r-prg", ["r-webflow"] = "r-webflow" };
        public ArchAgentService.AgentRef ResolveAgent(string? machine, string? repoRef) =>
            repoRef is not null && Known.TryGetValue(repoRef, out var id) ? new(new ArchAgentService.MachineRef(true, null, null), id, null) : new(new ArchAgentService.MachineRef(true, null, null), null, $"no agent \"{repoRef}\"");
        public GitHubRemoteLookup GitHubRemoteOf(ArchAgentService.AgentRef agent) => new("acme/" + agent.RepoId, "https://github.com/acme/" + agent.RepoId + ".git", agent.RepoId!, agent.RepoId!, null);
        public string AgentLabel(string? sourceId, string repoId) => "spacex/" + repoId + "#1";
        public void AuditTool(string tool, string? repoKey, string outcome) { }
        public (IReadOnlyList<AgentMessage>? Messages, string? Refusal) ReadTranscript(string? sourceId, string repoId, int tail)
            => Transcripts.TryGetValue(repoId, out var m) ? (m.TakeLast(tail).ToList(), null) : (new List<AgentMessage>(), null);
        public ArchAgentService.ToolOutcome SendToAgent(string? sourceId, string repoId, string text) => new(true, "sent", "ok");
        public IReadOnlyDictionary<string, string> RecordedTaskBranches(string? sourceId, string repoId) => new Dictionary<string, string>();
    }

    private sealed class FakePrs : IPrFactsProbe
    {
        public PrFacts? ProbePr(PrRef pr) => null;
        public string? OriginUrl(string clonePath) => null;
        public IReadOnlyList<PrListItem> ListPrs(string ownerRepo, string state, int limit) => Array.Empty<PrListItem>();
        public bool? MergeIsAncestor(string clonePath, string mergeCommit, IReadOnlyList<string> liveCommits) => null;
    }

    private sealed class FakeReader : ICardReader
    {
        public readonly List<CardQuestion> Asked = new();
        public Func<CardQuestion, CardReading> Answer = q => new CardReading(CardObservations.Working, "on it", 500, null);
        public Task<CardReading> ReadAsync(CardQuestion question, CancellationToken ct) { Asked.Add(question); return Task.FromResult(Answer(question)); }
    }

    private const string HandoffWords = "Wrote HANDOFF.md for the prg agent: the invoice import must skip voided rows; hand this off to a prg agent to fix and merge, then I'll pull it.";

    // ---- the reading ------------------------------------------------------------------------------

    [Fact]
    public void A_conversation_that_ends_in_a_handoff_is_stamped_handoff_with_the_summary_and_the_target()
    {
        var n = Card("Knjiga pošte orchestration");
        _fleet.Transcripts["r-webflow"] = new() { new AgentMessage("user", "finish it", Now0 - H), new AgentMessage("assistant", HandoffWords, Now0 - 10 * 60_000) };
        _reader.Answer = q => new CardReading(CardObservations.Handoff, "the invoice import in prg must skip voided rows; a prg agent should fix and merge it", 1200, null, "prg");
        var (questions, _) = _sweep.Read(Now0);
        Assert.Single(questions);
        Assert.Equal(CardObservations.Handoff, questions[0].State);
        var obs = _graph.Find(n.Id)!.Observation!;
        Assert.Equal(BoardIntegrity.Policeman, obs.By);
        Assert.Equal(CardObservations.Handoff, obs.State);
        Assert.Equal("prg", obs.Target);
        Assert.Null(obs.FollowUpId);                                  // nothing on the board answers it yet
        Assert.True(CardObservations.NeedsAttention(obs.State));
    }

    [Fact]
    public void The_readers_prompt_teaches_the_handoff_state_and_its_parser_reads_the_target()
    {
        var q = new CardQuestion("a1", "Orchestration", "doing", "doing", "spacex/r-webflow#1", new[] { new AgentMessage("assistant", HandoffWords, null) });
        var prompt = CliCardReader.BuildPrompt(q);
        Assert.Contains("- handoff: Handoff pending", prompt);
        Assert.Contains("\"handoff\" is for a conversation whose LAST turns conclude", prompt);
        Assert.Contains("\"target\"", prompt);
        var parsed = CliCardReader.Parse("{\"state\":\"handoff\",\"summary\":\"prg must skip voided rows\",\"target\":\"prg\"}")!.Value;
        Assert.Equal(("handoff", "prg must skip voided rows", 0, "prg"), parsed);
        Assert.Null(CliCardReader.Parse("{\"state\":\"handoff\",\"summary\":\"x\",\"target\":\"null\"}")!.Value.Target);
        Assert.Null(CliCardReader.Parse("{\"state\":\"working\",\"summary\":\"x\"}")!.Value.Target);
        Assert.Equal(8, CardObservations.States.Count);
    }

    // ---- the flag ---------------------------------------------------------------------------------

    [Fact]
    public void An_unanswered_handoff_is_flagged_after_the_window_naming_the_target_but_never_once_a_follow_up_exists()
    {
        var n = Card("Orchestration");
        _graph.SetObservation(n.Id, new TaskGraphService.CardObservation(Now0, BoardIntegrity.Policeman, CardObservations.Handoff, "prg must skip voided rows", null, "prg"), Now0);
        _sweep.Flag(Now0 + H);
        Assert.Null(_graph.Find(n.Id)!.NeedsHuman);                  // inside the window: a badge, not a flag
        _sweep.Flag(Now0 + 3 * H);
        var flag = _graph.Find(n.Id)!.NeedsHuman!;
        Assert.Equal(BoardIntegrity.Policeman, flag.By);
        Assert.Matches("ended in a handoff .* ago and no follow-up task exists yet \\(for prg\\): prg must skip voided rows", flag.Reason!);
        // A follow-up appears: the sweep links it and withdraws its own flag.
        var follow = _graph.AddNode("prg: skip voided rows in the invoice import", "from the handoff on #" + TaskGraphService.ShortId(n.Id), "r-prg", null, 0, 0, Now0 + 3 * H + 1)!;
        _graph.Assign(follow.Id, null, "r-prg", "arch", Now0 + 3 * H + 1);
        _sweep.Read(Now0 + 3 * H + 2);
        Assert.Equal(follow.Id, _graph.Find(n.Id)!.Observation!.FollowUpId);
        _sweep.Flag(Now0 + 3 * H + 3);
        Assert.Null(_graph.Find(n.Id)!.NeedsHuman);
        // Tracked: never flagged again however long it stands.
        _sweep.Flag(Now0 + 30 * H);
        Assert.Null(_graph.Find(n.Id)!.NeedsHuman);
    }

    // ---- the correlation ----------------------------------------------------------------------------

    [Fact]
    public void A_follow_up_is_found_by_the_source_ref_by_the_target_repo_or_by_shared_words_and_never_the_card_itself()
    {
        var card = Card("Orchestration");
        var obs = new TaskGraphService.CardObservation(Now0, BoardIntegrity.Policeman, CardObservations.Handoff, "the invoice import must skip voided rows and re-run the register export", null, "prg");
        string? Resolve(string t) => t == "prg" ? "r-prg" : null;
        Assert.Null(Handoffs.FollowUpFor(card, obs, _graph.Get().Nodes, Resolve));

        // Too old to be the answer (created long before the words were read).
        var old = _graph.AddNode("Old prg card", null, "r-prg", null, 0, 0, Now0 - 3 * H)!;
        _graph.Assign(old.Id, null, "r-prg", "arch", Now0 - 3 * H);
        Assert.Null(Handoffs.FollowUpFor(card, obs, _graph.Get().Nodes, Resolve));

        // By shared words, in the window, even on an unnamed repo.
        var words = _graph.AddNode("Skip voided rows in the invoice import", null, null, null, 0, 0, Now0 + 60_000)!;
        Assert.Equal(words.Id, Handoffs.FollowUpFor(card, obs, _graph.Get().Nodes, Resolve)!.Id);

        // By the target repo, created a little BEFORE the reading (the arch was faster): wins over words.
        var byRepo = _graph.AddNode("Fix the thing", null, "r-prg", null, 0, 0, Now0 - 30 * 60_000)!;
        _graph.Assign(byRepo.Id, null, "r-prg", "arch", Now0 - 30 * 60_000);
        Assert.Equal(byRepo.Id, Handoffs.FollowUpFor(card, obs, _graph.Get().Nodes, Resolve)!.Id);

        // By the source card's #ref in the note: the strongest link, whatever its age or repo.
        var byRef = _graph.AddNode("Follow-up", "handoff from #" + TaskGraphService.ShortId(card.Id), null, null, 0, 0, Now0 - 5 * H)!;
        Assert.Equal(byRef.Id, Handoffs.FollowUpFor(card, obs, _graph.Get().Nodes, Resolve)!.Id);

        // Delivered cards never count; the card itself never counts.
        _graph.UpdateNode(byRef.Id, null, null, null, null, "done", null, null, Now0 + 2);
        Assert.Equal(byRepo.Id, Handoffs.FollowUpFor(card, obs, _graph.Get().Nodes, Resolve)!.Id);
        var self = Handoffs.FollowUpFor(card, obs with { Target = "r-webflow" }, new[] { card }, (t) => t == "r-webflow" ? "r-webflow" : null);
        Assert.Null(self);

        Assert.Equal(new[] { "invoice", "import", "skip", "voided", "rows", "re-run", "register", "export" }.ToHashSet(StringComparer.OrdinalIgnoreCase),
            Handoffs.SignificantWords(obs.Summary));
        Assert.Null(Handoffs.CleanTarget("  null "));
        Assert.Equal("spacex/prg#1", Handoffs.CleanTarget(" spacex/prg#1 "));
    }

    [Fact]
    public void A_handoff_read_after_the_arch_already_created_the_task_is_tracked_at_once_and_a_later_reading_replaces_it()
    {
        var n = Card("Orchestration");
        var follow = _graph.AddNode("prg: skip voided rows", null, "r-prg", null, 0, 0, Now0 - 60_000)!;
        _graph.Assign(follow.Id, null, "r-prg", "arch", Now0 - 60_000);
        _fleet.Transcripts["r-webflow"] = new() { new AgentMessage("assistant", HandoffWords, Now0 - 10 * 60_000) };
        _reader.Answer = q => new CardReading(CardObservations.Handoff, "prg must skip voided rows", 900, null, "spacex/prg#1");
        _sweep.Read(Now0);
        var obs = _graph.Find(n.Id)!.Observation!;
        Assert.Equal(CardObservations.Handoff, obs.State);
        Assert.Equal(follow.Id, obs.FollowUpId);
        Assert.Null(_sweep.ReasonFor(_graph.Find(n.Id)!, Now0 + 5 * H));
        // The agent speaks again and is read as working: the handoff reading is simply replaced.
        _fleet.Transcripts["r-webflow"].Add(new AgentMessage("assistant", "Pulled their fix, continuing.", Now0 + H));
        _reader.Answer = q => new CardReading(CardObservations.Working, "pulled the fix, continuing", 800, null);
        _sweep.Read(Now0 + H + 1);
        Assert.Equal(CardObservations.Working, _graph.Find(n.Id)!.Observation!.State);
        Assert.Null(_graph.Find(n.Id)!.Observation!.Target);
    }
}
