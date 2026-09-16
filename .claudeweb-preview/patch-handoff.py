# One-shot patch for openspec policeman-handoff-detection (board task f6179626).
import re

def edit(path, pairs, regex=()):
    s = open(path, encoding='utf-8').read()
    for old, new in pairs:
        assert s.count(old) == 1, f"{path}: anchor not unique/found ({s.count(old)}):\n{old[:200]}"
        s = s.replace(old, new)
    for pat, fn in regex:
        m = list(re.finditer(pat, s, re.S))
        assert len(m) == 1, f"{path}: regex not unique/found: {pat[:80]} ({len(m)})"
        s = s[:m[0].start()] + fn(m[0]) + s[m[0].end():]
    open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print('patched', path)

# ---- the vocabulary -------------------------------------------------------------------------
edit('ClaudeWeb.App/Services/TaskGraph/CardObservations.cs', [
("""    public const string Errored = "errored";
""",
"""    public const string Errored = "errored";
    /// <summary>The conversation ENDED in a handoff (openspec policeman-handoff-detection): its
    /// last turns concluded that the next step is a NEW task for a DIFFERENT agent / repo, and no
    /// such task exists yet. Carries the target when the words name it; the sweep correlates a
    /// follow-up card and records it, after which the badge stops asking.</summary>
    public const string Handoff = "handoff";
"""),
("""        [Errored] = ("Errored", "the agent's last turn failed"),
    };""",
"""        [Errored] = ("Errored", "the agent's last turn failed"),
        [Handoff] = ("Handoff pending", "the conversation concluded that a NEW task must be done by ANOTHER agent or repo next (\\"I wrote a handoff for another agent\\", \\"this needs a prg agent to fix X\\", \\"once their fix is merged I'll pull it\\"), and no such task exists yet"),
    };"""),
("""    public static bool NeedsAttention(string? s) => s is AskedQuestion or Blocked or Errored;""",
 """    public static bool NeedsAttention(string? s) => s is AskedQuestion or Blocked or Errored or Handoff;"""),
])

edit('ClaudeWeb.App/Services/TaskGraph/TaskGraphService.cs', [
("""    public sealed record CardObservation(long At, string By, string State, string Summary, string? SessionId = null);""",
 """    public sealed record CardObservation(long At, string By, string State, string Summary, string? SessionId = null,
        // A handoff ending (openspec policeman-handoff-detection): whom the follow-up is for, as the
        // words named it, and the follow-up card once the sweep correlated one.
        string? Target = null, string? FollowUpId = null);"""),
])

# ---- the reader: the eighth state, the target field ---------------------------------------
edit('ClaudeWeb.App/Services/Policeman/ICardReader.cs', [
("""public sealed record CardReading(string? State, string? Summary, int Tokens, string? Error);""",
 """public sealed record CardReading(string? State, string? Summary, int Tokens, string? Error, string? Target = null);"""),
])

edit('ClaudeWeb.App/Services/Policeman/CliCardReader.cs', [
("""        var (state, summary, tokens) = parsed.Value;
        if (!CardObservations.IsState(state)) return new CardReading(null, null, tokens, $"the model answered an unknown state \\"{state}\\"");
        return new CardReading(state, summary, tokens, null);""",
"""        var (state, summary, tokens, target) = parsed.Value;
        if (!CardObservations.IsState(state)) return new CardReading(null, null, tokens, $"the model answered an unknown state \\"{state}\\"");
        return new CardReading(state, summary, tokens, null, state == CardObservations.Handoff ? Handoffs.CleanTarget(target) : null);"""),
("""The summary is one plain sentence a busy person reads in two seconds, naming what the agent needs if it needs anything.");""",
 """The summary is one plain sentence a busy person reads in two seconds, naming what the agent needs if it needs anything. \\"handoff\\" is for a conversation whose LAST turns conclude that the next step is a NEW task for a DIFFERENT agent or repository — the agent wrote a handoff or task description for someone else, says another repo's agent must fix or do something, asks for a task to be created for someone, or will wait for their work to merge before pulling it; it is NOT a handoff when the agent merely mentions other repos while continuing its own work, nor when it asks the Operator a question (that is asked-question). For a handoff the summary says WHAT must be done, and target names WHICH repo or agent it is for exactly as the words name it (null when unnamed).");"""),
("""        sb.Append("Answer with ONLY one JSON object, no prose, no code fence: {\\"state\\": \\"<one of the state keys>\\", \\"summary\\": \\"<one sentence>\\"}");""",
 """        sb.Append("Answer with ONLY one JSON object, no prose, no code fence: {\\"state\\": \\"<one of the state keys>\\", \\"summary\\": \\"<one sentence>\\", \\"target\\": \\"<for handoff only: the repo or agent the follow-up is for, or null>\\"}");"""),
("""    public static (string State, string Summary, int Tokens)? Parse(string raw)""",
 """    public static (string State, string Summary, int Tokens, string? Target)? Parse(string raw)"""),
("""            if (state.Length == 0) return null;
            if (summary.Length > CardObservations.MaxSummary) summary = summary[..CardObservations.MaxSummary].TrimEnd() + "…";
            return (state, summary, tokens);""",
"""            if (state.Length == 0) return null;
            if (summary.Length > CardObservations.MaxSummary) summary = summary[..CardObservations.MaxSummary].TrimEnd() + "…";
            var target = a.TryGetProperty("target", out var tg) && tg.ValueKind == JsonValueKind.String ? Handoffs.CleanTarget(tg.GetString()) : null;
            return (state, summary, tokens, target);"""),
])

# ---- the sweep: stamp the target, correlate the follow-up every pass, flag only while none ----
edit('ClaudeWeb.App/Services/Policeman/PolicemanSweep.cs', [
("""            var cur = _graph.Find(n.Id) ?? n;
            var newer = best.At is { } at ? cur.Observation is null || at > cur.Observation.At : cur.Observation is null;""",
"""            var cur = _graph.Find(n.Id) ?? n;
            // A handoff already read (openspec policeman-handoff-detection): every pass looks for
            // the follow-up card it calls for, so the badge stops asking once someone created it —
            // no model call, pure correlation.
            if (cur.Observation is { By: Actor, State: CardObservations.Handoff, FollowUpId: null } pending
                && Handoffs.FollowUpFor(cur, pending, _graph.Get().Nodes, ResolveTargetRepo) is { } followUp)
            {
                _graph.SetObservation(n.Id, pending with { FollowUpId = followUp.Id }, now, onlyIfBy: Actor);
                notes.Add($"{TaskGraphService.CardRef(n.Id)}: handoff tracked — follow-up {TaskGraphService.CardRef(followUp.Id)} \\"{followUp.Title}\\"");
                cur = _graph.Find(n.Id) ?? cur;
            }
            var newer = best.At is { } at ? cur.Observation is null || at > cur.Observation.At : cur.Observation is null;"""),
("""            _graph.SetObservation(n.Id, new TaskGraphService.CardObservation(now, Actor, reading.State!, summary), now);
            questions.Add(new PolicemanJournal.Question(n.Id, n.Title, best.Agent, excerpt, reading.State, summary, reading.Tokens, null));""",
"""            var observation = new TaskGraphService.CardObservation(now, Actor, reading.State!, summary, null, reading.State == CardObservations.Handoff ? Handoffs.CleanTarget(reading.Target) : null);
            // A handoff whose follow-up already exists (the arch was faster) is tracked at once.
            if (observation.State == CardObservations.Handoff && Handoffs.FollowUpFor(cur, observation, _graph.Get().Nodes, ResolveTargetRepo) is { } existing)
                observation = observation with { FollowUpId = existing.Id };
            _graph.SetObservation(n.Id, observation, now);
            questions.Add(new PolicemanJournal.Question(n.Id, n.Title, best.Agent, excerpt, reading.State, summary, reading.Tokens, null));"""),
("""            reason = o.State switch
            {
                CardObservations.AskedQuestion => $"asked a question {since} ago and nobody answered: {o.Summary}",
                CardObservations.Blocked => $"says it is blocked, for {since}: {o.Summary}",
                _ => $"its last turn failed, {since} ago: {o.Summary}",
            };""",
"""            reason = o.State switch
            {
                CardObservations.AskedQuestion => $"asked a question {since} ago and nobody answered: {o.Summary}",
                CardObservations.Blocked => $"says it is blocked, for {since}: {o.Summary}",
                // A handoff is flagged only while no follow-up card exists (openspec policeman-handoff-detection).
                CardObservations.Handoff => o.FollowUpId is null
                    ? $"ended in a handoff {since} ago and no follow-up task exists yet{(o.Target is null ? "" : $" (for {o.Target})")}: {o.Summary}"
                    : null,
                _ => $"its last turn failed, {since} ago: {o.Summary}",
            };"""),
("""    private static string Word(string? status) => status switch
    {
        "todo" => "To do", "doing" => "Doing", "committed" => "Committed", "pr-opened" => "PR open", "pr-merged" => "Merged", "done" => "Done", _ => "To do",
    };
""",
"""    private static string Word(string? status) => status switch
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
"""),
])

# ---- the arch sees it: list_tasks, the repo agent's my_effort, the role prompt --------------
edit('ClaudeWeb.App/Services/Arch/ArchAgentService.cs', [
("""                    observation = n.Observation is null ? null : new { at = n.Observation.At, by = n.Observation.By, state = n.Observation.State, summary = n.Observation.Summary, sessionId = n.Observation.SessionId },""",
 """                    observation = n.Observation is null ? null : new { at = n.Observation.At, by = n.Observation.By, state = n.Observation.State, summary = n.Observation.Summary, sessionId = n.Observation.SessionId, target = n.Observation.Target, followUpId = n.Observation.FollowUpId },"""),
("""        stamp. Report every `needsHuman` card to the Operator each wake (who raised it and
        why) — do not re-ping a stuck assignee. A card marked `manual: true` is the""",
"""        stamp. Report every `needsHuman` card to the Operator each wake (who raised it and
        why) — do not re-ping a stuck assignee. A card whose `observation.state` is
        `handoff` ENDED IN A HANDOFF: the agent's last turns call for a NEW task on
        ANOTHER agent or repo (`observation.summary` says what, `observation.target` whom)
        and none exists yet — that is YOUR cue: create that follow-up task (`create_task`,
        assigned to the named agent, its note quoting the handoff and the source card's
        #ref) so it does not fall through the cracks; once it exists the policeman links it
        (`observation.followUpId`) and stops asking. A card marked `manual: true` is the"""),
("""    public const string RoleVersionMarker = "<!-- arch-role v12 -->";""",
 """    public const string RoleVersionMarker = "<!-- arch-role v13 -->";"""),
])

edit('ClaudeWeb.App/Services/Agents/RepoAgentToolbox.cs', [
("""                observation = n.Observation is null ? null : new { state = n.Observation.State, summary = n.Observation.Summary, at = n.Observation.At },""",
 """                observation = n.Observation is null ? null : new { state = n.Observation.State, summary = n.Observation.Summary, at = n.Observation.At, target = n.Observation.Target, followUpId = n.Observation.FollowUpId },"""),
])

for path in ['tests/ClaudeWeb.Tests/ArchAgentTests.cs', 'tests/ClaudeWeb.Tests/ArchGoalConversationsTests.cs']:
    edit(path, [
    ('Assert.Equal("<!-- arch-role v12 -->", ArchAgentService.RoleVersionMarker); // v12: cross-repo efforts',
     'Assert.Equal("<!-- arch-role v13 -->", ArchAgentService.RoleVersionMarker); // v13: handoff endings are the arch\'s cue to create the follow-up task (openspec policeman-handoff-detection); v12: cross-repo efforts'),
    ])

edit('tests/ClaudeWeb.Tests/PolicemanSweepTests.cs', [
("""        Assert.Equal(("asked-question", "asks which key", 930), parsed!.Value);
        Assert.Equal(("working", "fine", 0), CliCardReader.Parse("{\\"state\\":\\"working\\",\\"summary\\":\\"fine\\"}")!.Value);""",
 """        Assert.Equal(("asked-question", "asks which key", 930, (string?)null), parsed!.Value);
        Assert.Equal(("working", "fine", 0, (string?)null), CliCardReader.Parse("{\\"state\\":\\"working\\",\\"summary\\":\\"fine\\"}")!.Value);"""),
("public void The_readers_prompt_shows_the_card_the_words_as_data_and_the_seven_states_and_its_parser_unwraps_the_cli_envelope()",
 "public void The_readers_prompt_shows_the_card_the_words_as_data_and_the_eight_states_and_its_parser_unwraps_the_cli_envelope()"),
])

# ---- the client: the vocabulary, the Agent section's words, attention only while untracked ----
edit('client/src/components/taskgraph/cardSections.js', [
("""  errored: ['💥', 'Errored', "the agent's last turn failed"],
};""",
"""  errored: ['💥', 'Errored', "the agent's last turn failed"],
  // openspec policeman-handoff-detection: the conversation ended by calling for a NEW task on
  // ANOTHER agent; "Handoff tracked" once the sweep found the follow-up card.
  handoff: ['🤝', 'Handoff pending', 'the conversation concluded that a NEW task must be done by another agent or repo next, and none exists yet'],
};"""),
("""  const [icon, word, meaning] = OBSERVATIONS[o.state] || ['👁', o.state || 'Observed', ''];
  const by = o.by || 'policeman';
  return {
    key: OBSERVATIONS[o.state] ? o.state : 'other', icon, word, meaning,
    text: o.summary ? String(o.summary) : meaning,
    source: by, sourceLabel: by === 'policeman' ? 'seen by the policeman' : `seen by ${by}`,
    at: o.at || null, session: o.sessionId ? String(o.sessionId).slice(0, 8) : null,
    attention: o.state === 'asked-question' || o.state === 'blocked' || o.state === 'errored',""",
"""  const [icon, baseWord, meaning] = OBSERVATIONS[o.state] || ['👁', o.state || 'Observed', ''];
  const by = o.by || 'policeman';
  const handoff = o.state === 'handoff';
  const target = handoff && o.target ? String(o.target) : null;
  const followUp = handoff && o.followUpId ? String(o.followUpId).slice(0, 8) : null;
  const base = o.summary ? String(o.summary) : meaning;
  const word = handoff && followUp ? 'Handoff tracked' : baseWord;
  const text = handoff
    ? `${base}${target ? ` — for ${target}` : ''}${followUp ? ` · follow-up card #${followUp} exists` : ' · no follow-up task on the board yet — the arch or you should create it'}`
    : base;
  return {
    key: OBSERVATIONS[o.state] ? o.state : 'other', icon, word, meaning, text, target, followUp,
    source: by, sourceLabel: by === 'policeman' ? 'seen by the policeman' : `seen by ${by}`,
    at: o.at || null, session: o.sessionId ? String(o.sessionId).slice(0, 8) : null,
    attention: o.state === 'asked-question' || o.state === 'blocked' || o.state === 'errored' || (handoff && !followUp),"""),
])

edit('client/src/components/taskgraph/cardSections.observation.test.mjs', [
("  assert.equal(Object.keys(OBSERVATIONS).length, 7);", "  assert.equal(Object.keys(OBSERVATIONS).length, 8);"),
])

edit('client/src/components/taskgraph/KanbanBoard.jsx', [
("""                            <div className={`kb__sec kb__agent kb__agent--${obs.key}${obs.attention ? ' kb__agent--attention' : ''}`} data-agent-observation={obs.key} data-observation-source={obs.source} title={`${obs.word}: ${obs.meaning}`}>""",
 """                            <div className={`kb__sec kb__agent kb__agent--${obs.key}${obs.attention ? ' kb__agent--attention' : ''}`} data-agent-observation={obs.key} data-observation-source={obs.source} data-observation-target={obs.target || undefined} data-observation-followup={obs.followUp || undefined} title={`${obs.word}: ${obs.meaning}`}>"""),
])
print('all patches applied')
