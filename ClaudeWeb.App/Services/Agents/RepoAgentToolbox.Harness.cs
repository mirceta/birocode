using ClaudeWeb.Services.Arch;
using ClaudeWeb.Services.Autopilot;
using ClaudeWeb.Services.Dock;

namespace ClaudeWeb.Services.Agents;

/// <summary>What a repo agent's harness tools need to know about the agent's own repo.</summary>
public sealed record RepoFacts(string Id, string Name, string Path, string? Handle);

/// <summary>
/// The harness-side dependencies of the three self-service tools (openspec
/// repo-agent-harness-tools), handed to the toolbox by <see cref="RepoAgentToolsService"/> and
/// faked by the tests. Everything is optional: a missing piece makes its tool answer "not
/// available on this harness" instead of throwing.
/// </summary>
public sealed record RepoAgentEnvironment
{
    /// <summary>repoId → the repo's facts (null = unknown repo).</summary>
    public Func<string, RepoFacts?> Repo { get; init; } = _ => null;
    public HarnessKnowledge? Knowledge { get; init; }
    public DockRegistry? Dock { get; init; }
    /// <summary>repoId → the id of the builder session running for it right now, or null.</summary>
    public Func<string, string?> RunningSession { get; init; } = _ => null;
    /// <summary>repo path → the newest transcript session id on disk, or null.</summary>
    public Func<string, string?> NewestSession { get; init; } = _ => null;
    public LoopArmer? Armer { get; init; }
    public LoopConfigStore? Loops { get; init; }
    /// <summary>The Operator's autopilot gate: closed = no loop may be armed by anyone.</summary>
    public Func<bool> GateOpen { get; init; } = () => false;
    /// <summary>(tool, repoId, repoName, outcome) → the autopilot audit line.</summary>
    public Action<string, string, string, string>? Audit { get; init; }
    public string Machine { get; init; } = "";
    /// <summary>The hub file system of this harness (openspec hub-file-system).</summary>
    public HubFs.HubFileStore? HubFiles { get; init; }
}

public sealed partial class RepoAgentToolbox
{
    /// <summary>The harness-side environment; null until <see cref="RepoAgentToolsService"/> sets it (tests may leave it).</summary>
    public RepoAgentEnvironment? Environment { get; set; }

    private const string NoIdentity = "the harness did not name this agent's repo — tool identity is missing";

    // ---- harness_help --------------------------------------------------------------------

    /// <summary>What a harness feature is and how this repo uses it: the index (no arguments),
    /// a topic / section (<paramref name="topic"/>), or the best match for a question
    /// (<paramref name="query"/>). Read off the harness's own docs; prefixed with this repo's facts.</summary>
    public ToolOutcome HarnessHelp(string? repoId, string? topic, string? query)
    {
        var env = Environment;
        if (env?.Knowledge is null) return new ToolOutcome(false, "unavailable", "harness_help is not available on this harness (no knowledge source wired)");
        var index = env.Knowledge.Load();
        var repo = string.IsNullOrWhiteSpace(repoId) ? null : env.Repo(repoId);
        var forThisRepo = ForThisRepo(repo);
        if (string.IsNullOrWhiteSpace(topic) && string.IsNullOrWhiteSpace(query))
        {
            var topics = index.Topics.Select(t => new { id = t.Id, title = t.Title, summary = t.Summary, file = t.File, sections = t.Sections.Select(s => $"{t.Id}#{s.Slug}").ToList() }).ToList();
            return new ToolOutcome(true, "index",
                $"{topics.Count} harness topics ({index.Source}{(index.Folder is null ? "" : $", {index.Folder}")}): {string.Join(", ", topics.Select(t => t.id))}. Call harness_help with topic (an id, or id#section) for the text, or query for a question.",
                new { source = index.Source, folder = index.Folder, forThisRepo, topics });
        }
        HarnessKnowledge.Answer? a;
        if (!string.IsNullOrWhiteSpace(topic))
        {
            a = HarnessKnowledge.Lookup(index.Topics, topic);
            if (a is null) return new ToolOutcome(false, "not-found", $"no harness topic \"{topic.Trim()}\"; the topics are: {string.Join(", ", index.Topics.Select(t => t.Id))}", new { source = index.Source, topics = index.Topics.Select(t => t.Id).ToList() });
        }
        else
        {
            a = HarnessKnowledge.Search(index.Topics, query!);
            if (a is null) return new ToolOutcome(false, "not-found", $"no harness topic mentions \"{query!.Trim()}\"; the topics are: {string.Join(", ", index.Topics.Select(t => t.Id))}", new { source = index.Source, topics = index.Topics.Select(t => t.Id).ToList() });
        }
        var where = a.Section is null ? a.Topic.File : $"{a.Topic.File} § {a.Section.Heading}";
        var text = ForThisRepoText(repo, a.Topic.Id) + a.Text;
        return new ToolOutcome(true, "found",
            $"{a.Topic.Title}{(a.Section is null ? "" : " — " + a.Section.Heading)} ({index.Source}: {where}). The text follows in data.text, prefixed with what it means for {(repo?.Name ?? "this repo")}.",
            new
            {
                source = index.Source, folder = index.Folder, file = a.Topic.File,
                topic = new { id = a.Topic.Id, title = a.Topic.Title, sections = a.Topic.Sections.Select(s => s.Slug).ToList() },
                section = a.Section?.Slug, forThisRepo, text,
            });
    }

    /// <summary>The caller's concrete facts a generic convention lands on.</summary>
    private static object? ForThisRepo(RepoFacts? repo) => repo is null ? null : new
    {
        repo = repo.Name, repoId = repo.Id, handle = repo.Handle, path = repo.Path,
        understandingApp = new { entry = Path.Combine(repo.Path, "understanding-app", "index.html"), servedAt = $"/api/localview/{repo.Id}/app/understanding/" },
        goalApp = new { record = Path.Combine(repo.Path, "goal-app", "goal.json"), servedAt = $"/api/localview/{repo.Id}/app/goal/" },
        localApps = $"/api/localview/{repo.Id}/app/<appId>/",
    };

    private static string ForThisRepoText(RepoFacts? repo, string topicId)
    {
        if (repo is null) return "";
        var lines = new List<string> { $"[for this repo — {repo.Name} at {repo.Path}]" };
        if (topicId.Contains("understanding", StringComparison.OrdinalIgnoreCase))
        {
            lines.Add($"- your entry point: {Path.Combine(repo.Path, "understanding-app", "index.html")} (overwrite it; assets beside it, relative URLs)");
            lines.Add($"- the harness serves it at /api/localview/{repo.Id}/app/understanding/ (no-store: reload shows the new one)");
            lines.Add($"- the Goal app record: {Path.Combine(repo.Path, "goal-app", "goal.json")}, served at /api/localview/{repo.Id}/app/goal/");
        }
        else if (topicId.Contains("exposure", StringComparison.OrdinalIgnoreCase))
            lines.Add($"- your products are proxied at /api/localview/{repo.Id}/app/<appId>/ — serve at root, bind dual-stack, relative URLs");
        return string.Join("\n", lines) + "\n\n";
    }

    // ---- stash_prompt --------------------------------------------------------------------

    /// <summary>The agent's own dock tab: the one showing its running session, else the repo's
    /// dashboard tab, else its newest.</summary>
    public DockTab? OwnTab(string repoId)
    {
        var env = Environment;
        if (env?.Dock is null) return null;
        var tabs = env.Dock.GetAll().Where(t => t.RepoId == repoId).ToList();
        if (tabs.Count == 0) return null;
        var running = env.RunningSession(repoId);
        if (!string.IsNullOrWhiteSpace(running) && tabs.FirstOrDefault(t => string.Equals(t.SessionId, running, StringComparison.Ordinal)) is { } mine) return mine;
        return tabs.OrderByDescending(t => t.Dashboard).ThenByDescending(t => t.CreatedAt).First();
    }

    /// <summary>Add a prompt to the agent's own stash — the queue a queue loop drains, head
    /// first. Add only; the Operator curates. <paramref name="first"/> puts it at the head.</summary>
    public ToolOutcome StashPrompt(string? repoId, string? text, bool first = false)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", NoIdentity);
        var env = Environment;
        if (env?.Dock is null) return new ToolOutcome(false, "unavailable", "stash_prompt is not available on this harness (no dock wired)");
        if (string.IsNullOrWhiteSpace(text)) return new ToolOutcome(false, "error", "text is required: the prompt to queue");
        var tab = OwnTab(repoId);
        if (tab is null) return new ToolOutcome(false, "no-tab", $"{env.Repo(repoId)?.Name ?? repoId} has no dock tab — open this agent in the dock first; the stash lives on the tab");
        var item = env.Dock.AddStash(tab.Id, text.Trim());
        if (item is null) return new ToolOutcome(false, "error", $"the dock refused the prompt on tab {tab.Id}");
        var queue = env.Dock.GetStash(tab.Id) ?? new List<StashItem>();
        if (first && queue.Count > 1)
        {
            var order = new List<string> { item.Id };
            order.AddRange(queue.Where(s => s.Id != item.Id).Select(s => s.Id));
            queue = env.Dock.ReorderStash(tab.Id, order) ?? queue;
        }
        var position = queue.ToList().FindIndex(s => s.Id == item.Id) + 1;
        var view = queue.Select(s => new { id = s.Id, text = s.Text.Length > 200 ? s.Text[..200] + "…" : s.Text, createdAt = s.CreatedAt }).ToList();
        return new ToolOutcome(true, "stashed",
            $"queued as #{position} of {queue.Count} on your dock tab \"{tab.RepoName}\"; a queue loop drains the head first (arm_my_loop kind queue)",
            new { tabId = tab.Id, itemId = item.Id, position, count = queue.Count, queue = view });
    }

    // ---- arm_my_loop ---------------------------------------------------------------------

    /// <summary>Arm / update / stop / read the agent's OWN loop with the Loop panel's parameters,
    /// through the same armer the arch uses; armed by <see cref="LoopConfigStore.ArmedByAgent"/>.</summary>
    public ToolOutcome ArmMyLoop(string? repoId, string? action, ArchLoopTools.LoopParams p, bool rearm = false)
    {
        if (string.IsNullOrWhiteSpace(repoId)) return new ToolOutcome(false, "error", NoIdentity);
        var env = Environment;
        if (env?.Armer is null || env.Loops is null) return new ToolOutcome(false, "unavailable", "arm_my_loop is not available on this harness (no loop engine wired)");
        var repo = env.Repo(repoId);
        if (repo is null) return new ToolOutcome(false, "error", $"unknown repo {repoId}");
        var act = (action ?? "start").Trim().ToLowerInvariant();
        var now = _now();
        object? View(LoopConfigStore.LoopState? s) => s is null ? null : ArchLoopTools.View(s, repo.Id, repo.Name, env.Machine, repo.Handle, QueueRemaining(env, s), now);
        if (act == "status")
        {
            var cur = env.Loops.Get(repo.Id);
            return cur is null
                ? new ToolOutcome(true, "no-loop", $"{repo.Name} has no loop; arm_my_loop start arms one (kind suggestion | recipe | goal | queue)", new { loopId = repo.Id, state = "none", gateOpen = env.GateOpen() })
                : new ToolOutcome(true, ArchLoopTools.StateWord(cur), $"{repo.Name}'s {cur.Kind} loop is {ArchLoopTools.StateWord(cur)} ({cur.Mode}{(cur.MaxIterations > 0 ? $", cap {cur.MaxIterations}" : "")}, {cur.IterationsDone} iteration(s), armed by {cur.ArmedBy})", View(cur));
        }
        if (act is not ("start" or "update" or "stop")) return new ToolOutcome(false, "error", $"unknown action \"{action}\": start | update | stop | status");
        if (!env.GateOpen())
        {
            env.Audit?.Invoke("arm_my_loop", repo.Id, repo.Name, "gate-closed");
            return new ToolOutcome(false, "not-accepting", $"the autopilot gate on {env.Machine} is closed by the Operator (host GUI); the Loop panel is gated the same way — nothing was changed");
        }
        var by = LoopConfigStore.ArmedByAgent;
        string? Pin() => env.RunningSession(repo.Id) ?? OwnTab(repo.Id)?.SessionId ?? env.NewestSession(repo.Path);
        LoopArmer.Outcome o = act switch
        {
            "start" => env.Armer.Start(repo.Id, repo.Name, p, by, Pin(), listTool: "arm_my_loop status"),
            "update" => env.Armer.Update(repo.Id, repo.Name, null, p, rearm, by, Pin, startTool: "arm_my_loop start"),
            _ => env.Armer.Stop(repo.Id, repo.Name, null, by),
        };
        env.Audit?.Invoke("arm_my_loop", repo.Id, repo.Name, o.Audit);
        var detail = o.Detail;
        if (o.Ok && act == "start") detail += $"; a drive loop fires when you are idle after this turn — end your turns with the loop's markers (harness_help topic loop-driven-agent-convention)";
        return new ToolOutcome(o.Ok, o.Status, detail, View(o.State));
    }

    private static int? QueueRemaining(RepoAgentEnvironment env, LoopConfigStore.LoopState s) =>
        s.Kind == LoopConfigStore.KindQueue && s.QueueTabId is not null ? env.Dock?.GetStash(s.QueueTabId)?.Count : null;
}
