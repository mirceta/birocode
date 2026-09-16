using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Notes;
using ClaudeWeb.Services.Policeman;
using ClaudeWeb.Services.TaskGraph;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// openspec one-policeman — the reading half of the loop, against fakes for the fleet, GitHub and
/// the model: a PR that traces to a card behind it is linked (so the verifier moves it), the model
/// is asked exactly once per card with new words and its answer becomes the Agent section, nothing
/// is asked when nothing is new or reading is off, an unanswered question is flagged after the
/// window and cleared once the agent continues, a column ahead of the facts is flagged after two
/// sweeps, and the reader's prompt and parser are pure.
/// </summary>
public sealed class PolicemanSweepTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cwtest-sweep-" + Guid.NewGuid().ToString("N"));
    private readonly Logger _logger = new();
    private readonly TaskGraphService _graph;
    private readonly FakeFleet _fleet = new();
    private readonly FakePrs _prs = new();
    private readonly FakeReader _reader = new();
    private readonly PolicemanSettings _settings = new(null);
    private readonly PolicemanSweep _sweep;
    private static readonly long Now0 = 1_700_000_000_000L;
    private const long H = 3600_000L;

    public PolicemanSweepTests()
    {
        Directory.CreateDirectory(_dir);
        _graph = new TaskGraphService(_logger, _dir, new NotesService(_logger, _dir));
        _sweep = new PolicemanSweep(_graph, _prs, _fleet, _reader, _settings, _logger);
    }

    public void Dispose() { try { Directory.Delete(_dir, recursive: true); } catch { /* best effort */ } }

    private TaskGraphService.Node Card(string title, string status = "doing")
    {
        var n = _graph.AddNode(title, null, "r1", null, 0, 0, Now0)!;
        _graph.Assign(n.Id, null, "r1", "arch", Now0);
        _graph.MarkDispatched(n.Id, Now0);
        return _graph.UpdateNode(n.Id, null, null, null, null, status, null, null, Now0)!;
    }

    // ---- fakes ----------------------------------------------------------------------------------

    private sealed class FakeFleet : IAgentDirectory
    {
        public readonly Dictionary<string, List<AgentMessage>> Transcripts = new(StringComparer.Ordinal);
        public string? Refusal;
        public readonly List<(string Repo, string Text)> Sent = new();
        public ArchAgentService.AgentRef ResolveAgent(string? machine, string? repoRef) => new(new ArchAgentService.MachineRef(true, null, null), repoRef, null);
        public GitHubRemoteLookup GitHubRemoteOf(ArchAgentService.AgentRef agent) => new("acme/" + agent.RepoId, "https://github.com/acme/" + agent.RepoId + ".git", agent.RepoId!, agent.RepoId!, null);
        public string AgentLabel(string? sourceId, string repoId) => "self/" + repoId + "#1";
        public void AuditTool(string tool, string? repoKey, string outcome) { }
        public (IReadOnlyList<AgentMessage>? Messages, string? Refusal) ReadTranscript(string? sourceId, string repoId, int tail)
            => Refusal is not null ? (null, Refusal) : (Transcripts.TryGetValue(repoId, out var m) ? m.TakeLast(tail).ToList() : new List<AgentMessage>(), null);
        public ArchAgentService.ToolOutcome SendToAgent(string? sourceId, string repoId, string text) { Sent.Add((repoId, text)); return new ArchAgentService.ToolOutcome(true, "sent", "ok"); }
    }

    private sealed class FakePrs : IPrFactsProbe
    {
        public readonly List<PrListItem> Prs = new();
        public int Lists;
        public PrFacts? ProbePr(PrRef pr) => null;
        public string? OriginUrl(string clonePath) => null;
        public IReadOnlyList<PrListItem> ListPrs(string ownerRepo, string state, int limit) { Lists++; return Prs; }
        public bool? MergeIsAncestor(string clonePath, string mergeCommit, IReadOnlyList<string> liveCommits) => null;
    }

    private sealed class FakeReader : ICardReader
    {
        public readonly List<CardQuestion> Asked = new();
        public Func<CardQuestion, CardReading> Answer = q => new CardReading(CardObservations.Working, "on it: " + q.Messages[^1].Text, 700, null);
        public Task<CardReading> ReadAsync(CardQuestion question, CancellationToken ct) { Asked.Add(question); return Task.FromResult(Answer(question)); }
    }

    // ---- trace ----------------------------------------------------------------------------------

    [Fact]
    public void A_pull_request_that_traces_to_a_card_behind_it_is_linked_and_listed_at_most_every_five_minutes()
    {
        var n = Card("Add OAuth login");
        _prs.Prs.Add(new PrListItem(42, "Add OAuth login", "https://github.com/acme/r1/pull/42", "OPEN", false, "feat/oauth", "abc", null, "prg", null));
        var (traced, _) = _sweep.Trace(Now0, force: false);
        Assert.Single(traced);
        Assert.Equal("PR #42 open", traced[0].Pr);
        var a = TaskGraphService.AssigneesOf(_graph.Find(n.Id)!)[0];
        Assert.Equal("https://github.com/acme/r1/pull/42", a.PrUrl);
        Assert.Equal("feat/oauth", a.Branch);
        Assert.Equal(1, _prs.Lists);
        // Linked now: nothing left to ask GitHub for on this repo.
        _sweep.Trace(Now0 + 60_000, force: false);
        Assert.Equal(1, _prs.Lists);
        // A second card without a PR asks again — but not within five minutes of the last listing, unless forced.
        Card("Another one");
        _sweep.Trace(Now0 + 120_000, force: false);
        Assert.Equal(1, _prs.Lists);
        _sweep.Trace(Now0 + 120_000, force: true);
        Assert.Equal(2, _prs.Lists);
    }

    // ---- read -----------------------------------------------------------------------------------

    [Fact]
    public void One_question_per_card_with_new_words_and_the_answer_becomes_the_agent_section()
    {
        var n = Card("Export CSV");
        _fleet.Transcripts["r1"] = new() { new AgentMessage("user", "please export", Now0 - H), new AgentMessage("assistant", "Which API key should I use?", Now0 - 30 * 60_000) };
        _reader.Answer = q => new CardReading(CardObservations.AskedQuestion, "asks which API key to use", 1100, null);
        var (questions, _) = _sweep.Read(Now0);
        Assert.Single(questions);
        Assert.Equal(CardObservations.AskedQuestion, questions[0].State);
        Assert.Equal(1100, questions[0].Tokens);
        Assert.Single(_reader.Asked);
        Assert.Equal("Export CSV", _reader.Asked[0].Title);
        var obs = _graph.Find(n.Id)!.Observation!;
        Assert.Equal(BoardIntegrity.Policeman, obs.By);
        Assert.Equal(CardObservations.AskedQuestion, obs.State);
        Assert.Equal("asks which API key to use", obs.Summary);
        Assert.Equal("self/r1#1", _sweep.LastSaid[n.Id].Agent);
        // Nothing new: not asked again.
        _sweep.Read(Now0 + 60_000);
        Assert.Single(_reader.Asked);
        // New words: asked once more.
        _fleet.Transcripts["r1"].Add(new AgentMessage("assistant", "Got the key, continuing.", Now0 + 90_000));
        _reader.Answer = q => new CardReading(CardObservations.Working, "continuing with the key", 900, null);
        _sweep.Read(Now0 + 120_000);
        Assert.Equal(2, _reader.Asked.Count);
        Assert.Equal(CardObservations.Working, _graph.Find(n.Id)!.Observation!.State);
    }

    [Fact]
    public void Reading_off_a_refusal_an_unusable_answer_and_the_per_pass_budget_leave_the_card_unread_but_journaled()
    {
        var n = Card("Quiet one");
        _fleet.Transcripts["r1"] = new() { new AgentMessage("assistant", "working", Now0 - 60_000) };
        _settings.Update(false, null, null, null);
        var (q0, _) = _sweep.Read(Now0);
        Assert.Empty(q0); Assert.Empty(_reader.Asked);
        Assert.True(_sweep.LastSaid.ContainsKey(n.Id), "the words are still gathered for the tab");
        _settings.Update(true, null, null, null);
        _reader.Answer = _ => new CardReading("nonsense", "?", 50, null);
        var (q1, _) = _sweep.Read(Now0);
        Assert.Single(q1); Assert.NotNull(q1[0].Error); Assert.Null(_graph.Find(n.Id)!.Observation);
        _fleet.Refusal = "r1 is claimed by the operator";
        var (q2, notes) = _sweep.Read(Now0);
        Assert.Empty(q2); Assert.Contains(notes, x => x.Contains("claimed"));
        _fleet.Refusal = null;
        _settings.Update(true, null, null, 1);
        Card("Second"); Card("Third");
        _reader.Asked.Clear();
        _reader.Answer = q => new CardReading(CardObservations.Working, "ok", 10, null);
        var (q3, notes3) = _sweep.Read(Now0);
        Assert.Single(_reader.Asked);
        Assert.Contains(notes3, x => x.Contains("questions are spent"));
    }

    // ---- flag -----------------------------------------------------------------------------------

    [Fact]
    public void An_unanswered_question_is_flagged_after_the_window_and_cleared_once_the_agent_continues()
    {
        var n = Card("Export CSV");
        _graph.SetObservation(n.Id, new TaskGraphService.CardObservation(Now0, BoardIntegrity.Policeman, CardObservations.AskedQuestion, "asks which key"), Now0);
        _sweep.Flag(Now0 + H);
        Assert.Null(_graph.Find(n.Id)!.NeedsHuman);
        _sweep.Flag(Now0 + 3 * H);
        var flag = _graph.Find(n.Id)!.NeedsHuman!;
        Assert.Equal(BoardIntegrity.Policeman, flag.By);
        Assert.Matches("asked a question .* ago and nobody answered: asks which key", flag.Reason!);
        Assert.False(BoardIntegrity.IsMechanicalReason(flag.Reason));
        // The Operator answers; the agent continues; the next reading clears the flag.
        _graph.AnswerNeedsHuman(n.Id, "use the sandbox key", Now0 + 3 * H + 1);
        Assert.Equal("use the sandbox key", _graph.Find(n.Id)!.NeedsHuman!.Answer);
        _graph.SetObservation(n.Id, new TaskGraphService.CardObservation(Now0 + 4 * H, BoardIntegrity.Policeman, CardObservations.Working, "continuing with the sandbox key"), Now0 + 4 * H);
        _sweep.Flag(Now0 + 4 * H);
        Assert.Null(_graph.Find(n.Id)!.NeedsHuman);
    }

    [Fact]
    public void A_column_ahead_of_the_facts_is_flagged_after_two_sweeps_and_the_judges_own_stamp_is_left_to_the_judge()
    {
        var n = Card("Rename the settings page", "pr-opened"); // claims PR open; nothing verified
        _sweep.Flag(Now0);
        Assert.Null(_graph.Find(n.Id)!.NeedsHuman);
        Assert.Equal(1, _sweep.AgainstFor(n.Id));
        _sweep.Flag(Now0 + 60_000);
        Assert.Matches("the column says PR open but the facts show only To do, for 2 sweeps", _graph.Find(n.Id)!.NeedsHuman!.Reason!);
        // A mechanical stamp is not the sweep's to clear.
        var s = Card("Silent");
        _graph.SetNeedsHuman(s.Id, new TaskGraphService.HumanRequest(Now0, BoardIntegrity.Policeman, "pinged, no PR and no progress for 30 h (window 24 h)"), Now0);
        _sweep.Flag(Now0 + 120_000);
        Assert.NotNull(_graph.Find(s.Id)!.NeedsHuman);
        // The Operator's flag is never touched either.
        var o = Card("Operator's");
        _graph.SetNeedsHuman(o.Id, new TaskGraphService.HumanRequest(Now0, BoardIntegrity.Operator, "look at this"), Now0);
        _sweep.Flag(Now0 + 120_000);
        Assert.Equal(BoardIntegrity.Operator, _graph.Find(o.Id)!.NeedsHuman!.By);
    }

    // ---- the reader's pure parts --------------------------------------------------------------

    [Fact]
    public void The_readers_prompt_shows_the_card_the_words_as_data_and_the_seven_states_and_its_parser_unwraps_the_cli_envelope()
    {
        var q = new CardQuestion("a1", "Export CSV", "doing", "doing", "self/prg#1", new[] { new AgentMessage("assistant", "Which key?", null) });
        var prompt = CliCardReader.BuildPrompt(q);
        Assert.Contains("\"Export CSV\"", prompt);
        Assert.Contains("<agent_messages>", prompt);
        Assert.Contains("[assistant] Which key?", prompt);
        foreach (var key in CardObservations.States.Keys) Assert.Contains("- " + key + ":", prompt);
        Assert.Contains("ONLY one JSON object", prompt);
        var envelope = "{\"type\":\"result\",\"result\":\"Sure: {\\\"state\\\": \\\"Asked-Question\\\", \\\"summary\\\": \\\"asks which key\\\"}\",\"usage\":{\"input_tokens\":900,\"output_tokens\":30}}\n";
        var parsed = CliCardReader.Parse(envelope);
        Assert.NotNull(parsed);
        Assert.Equal(("asked-question", "asks which key", 930), parsed!.Value);
        Assert.Equal(("working", "fine", 0), CliCardReader.Parse("{\"state\":\"working\",\"summary\":\"fine\"}")!.Value);
        Assert.Null(CliCardReader.Parse("no json here"));
    }

    [Fact]
    public void The_arch_flattens_a_transcript_outcome_to_typed_messages()
    {
        var local = new { repoId = "r1", messages = new object[] { new { role = "user", text = "go", at = new DateTime(2026, 9, 16, 10, 0, 0, DateTimeKind.Utc) }, new { role = "assistant", text = "done", at = (DateTime?)null } } };
        var msgs = ArchAgentService.TranscriptMessages(local);
        Assert.Equal(2, msgs.Count);
        Assert.Equal("assistant", msgs[1].Role);
        Assert.Equal(new DateTimeOffset(2026, 9, 16, 10, 0, 0, TimeSpan.Zero).ToUnixTimeMilliseconds(), msgs[0].At);
        Assert.Null(msgs[1].At);
        Assert.Empty(ArchAgentService.TranscriptMessages(Array.Empty<object>()));
        Assert.Empty(ArchAgentService.TranscriptMessages(null));
    }
}
