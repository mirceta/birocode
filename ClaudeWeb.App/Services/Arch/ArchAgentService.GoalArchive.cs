using System.Text;
using System.Text.Json;
using ClaudeWeb.Services.Chat;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// Archiving, export and purge for goal conversations (fix/remove-goal-conversation-cap).
///
/// The 24-conversation cap counted every arch conversation, finished goals included, so a day
/// of goals left the arch unable to start any new one. The cap is gone (the only limit is on
/// RUNNING goals); finished goals are kept but ARCHIVED — hidden from the Subagents tab's
/// default list while the record (goal, plan, evidence, outcome) and the transcript stay
/// readable. A real PURGE (dropping the record) stays an explicit Operator action and always
/// EXPORTS first: the record JSON + the transcript .jsonl go to the hub file system under
/// <c>arch/goals/&lt;goalId&gt;/</c>, so nothing is ever lost. The Arch-examples miner reads
/// <see cref="ArchStateStore.Goals"/>, which still contains archived goals, so archiving keeps
/// the catalogue intact with no miner change.
/// </summary>
public partial class ArchAgentService
{
    private const string GoalExportActor = "arch";

    /// <summary>The configured auto-archive sweep: file away finished goals older than the
    /// Operator's setting (0 = off). Cheap and idempotent; called on the conversations poll.
    /// Returns the goal ids archived this pass.</summary>
    public IReadOnlyList<string> AutoArchiveSweep()
    {
        var archived = _state.AutoArchiveFinished(Now());
        if (archived.Count > 0)
            _logger.Info($"[ARCH] auto-archived {archived.Count} finished goal(s) older than {_state.GoalAutoArchiveDays} d: {string.Join(", ", archived)}");
        return archived;
    }

    /// <summary>Archive one finished goal (hide it; keep the record + transcript). Refuses a
    /// running or held goal — stop it first.</summary>
    public ToolOutcome ArchiveGoal(string? goalId)
    {
        var g = _state.FindGoal(goalId?.Trim());
        if (g is null) return new ToolOutcome(false, "not-found", $"no goal \"{goalId}\"");
        if (g.Running) return new ToolOutcome(false, "running", $"goal {g.Id} is still running — stop it first, then archive");
        var archived = _state.ArchiveGoal(g.Id, Now());
        return new ToolOutcome(true, "archived", $"goal {g.Id} archived — hidden from the default list; its record and transcript are kept", GoalView(archived!));
    }

    /// <summary>Unarchive one goal (bring it back into the default list).</summary>
    public ToolOutcome UnarchiveGoal(string? goalId)
    {
        var g = _state.UnarchiveGoal(goalId?.Trim());
        return g is null
            ? new ToolOutcome(false, "not-found", $"no goal \"{goalId}\"")
            : new ToolOutcome(true, "unarchived", $"goal {g.Id} is back in the default list", GoalView(g));
    }

    /// <summary>
    /// Export a goal's record JSON + transcript .jsonl to the hub file system under
    /// <c>arch/goals/&lt;goalId&gt;/</c>. Returns the written hub paths, or an error (no hub store,
    /// or a bad goal id). The transcript is streamed straight from disk; it is optional (a goal
    /// that never ran a turn has none) and its absence is not an error.
    /// </summary>
    public (bool Ok, IReadOnlyList<string> Paths, string? Error) ExportGoal(string? goalId)
    {
        if (_hubFiles is null) return (false, Array.Empty<string>(), "this harness has no hub file store, so a goal cannot be exported");
        var g = _state.FindGoal(goalId?.Trim());
        if (g is null) return (false, Array.Empty<string>(), $"no goal \"{goalId}\"");

        var paths = new List<string>();
        var conv = _state.GetConversation(g.ConversationId);
        var record = JsonSerializer.SerializeToUtf8Bytes(new
        {
            exportedAt = Now(),
            goalId = g.Id,
            conversation = new { id = g.ConversationId, name = conv?.Name },
            goal = g.Text,
            state = g.State,
            archived = g.Archived,
            startedAt = g.StartedAt,
            endedAt = g.EndedAt,
            startedBy = g.StartedBy,
            outcome = g.Outcome,
            repos = g.Repos,
            tasks = g.Tasks,
            continuesGoalId = g.ContinuesGoalId,
            planDerived = g.PlanDerived,
            plan = g.Steps,   // steps carry their evidence
        }, new JsonSerializerOptions { WriteIndented = true });

        var recordPath = $"arch/goals/{g.Id}/record.json";
        var (rec, recErr) = _hubFiles.Put(recordPath, record, GoalExportActor, SelfLabel, note: $"goal {g.Id} record");
        if (rec is null) return (false, paths, recErr ?? "failed to export the goal record");
        paths.Add(recordPath);

        // The transcript (optional): stream it straight from the CLI project folder.
        var sessionId = conv?.SessionId;
        if (!string.IsNullOrWhiteSpace(sessionId) && SessionService.TranscriptPath(HomePath, sessionId!) is { } tx && File.Exists(tx))
        {
            try
            {
                using var fs = File.OpenRead(tx);
                var txPath = $"arch/goals/{g.Id}/transcript.jsonl";
                var (txEntry, txErr) = _hubFiles.PutStream(txPath, fs, fs.Length, GoalExportActor, SelfLabel, note: $"goal {g.Id} transcript");
                if (txEntry is not null) paths.Add(txPath);
                else _logger.Error($"[ARCH] goal {g.Id} transcript export failed: {txErr}");
            }
            catch (Exception ex) { _logger.Error($"[ARCH] goal {g.Id} transcript export threw: {ex.Message}"); }
        }
        return (true, paths, null);
    }

    /// <summary>Purge a goal's record (an explicit Operator action): EXPORT it first, then drop
    /// the conversation record (the transcript file on disk stays). Refuses a running goal and
    /// refuses to purge without a successful export, so nothing is ever lost.</summary>
    public ToolOutcome PurgeGoal(string? goalId)
    {
        var g = _state.FindGoal(goalId?.Trim());
        if (g is null) return new ToolOutcome(false, "not-found", $"no goal \"{goalId}\"");
        if (g.Running) return new ToolOutcome(false, "running", $"goal {g.Id} is still running — stop it before purging");
        var (ok, paths, err) = ExportGoal(g.Id);
        if (!ok) return new ToolOutcome(false, "export-failed", $"goal {g.Id} was NOT purged — export failed ({err}); the record is kept");
        if (!_state.RemoveConversation(g.ConversationId)) return new ToolOutcome(false, "error", $"goal {g.Id} was exported to {string.Join(", ", paths)} but its conversation could not be removed");
        _logger.Info($"[ARCH] purged goal {g.Id} (exported to {string.Join(", ", paths)})");
        return new ToolOutcome(true, "purged", $"goal {g.Id} exported to {string.Join(", ", paths)} and its record dropped", new { exported = paths });
    }

    // ---- the two compact tools (fix/remove-goal-conversation-cap, task 5) -------------------

    private static readonly string[] ConvFilters = { "running", "held", "finished", "archived", "all" };

    /// <summary>list_conversations: ONE compact line per conversation (the full goal list is too
    /// large for the arch to read). Filter: running | held | finished | archived | all.</summary>
    public ToolOutcome ToolListConversations(string? filter)
    {
        var f = (filter ?? "all").Trim().ToLowerInvariant();
        if (!ConvFilters.Contains(f)) f = "all";
        var lines = new List<string>();
        var counts = new Dictionary<string, int> { ["running"] = 0, ["held"] = 0, ["finished"] = 0, ["archived"] = 0 };
        foreach (var conv in _state.Conversations)
        {
            var g = _state.GoalOf(conv.Id);
            var cat = Category(g, conv.Id, conv.IsDefault);
            if (counts.ContainsKey(cat)) counts[cat]++;
            if (!FilterMatch(cat, f)) continue;
            lines.Add(ConversationLine(conv, g, cat));
        }
        var header = $"{counts["running"]} running, {counts["held"]} held, {counts["finished"]} finished, {counts["archived"]} archived";
        AuditTool("list_conversations", null, $"filter {f}: {lines.Count} line(s)");
        return new ToolOutcome(true, "ok", $"{header} — {lines.Count} shown ({f}):\n" + string.Join("\n", lines), new { filter = f, counts, conversations = lines });
    }

    /// <summary>archive_goals: archive the named goals, or every finished goal older than N days
    /// (<c>"finished older than 7 days"</c> / <c>"older than 7"</c>). Never touches running or
    /// held goals; exports each one first. Does not touch the Operator chat or the policeman.</summary>
    public ToolOutcome ToolArchiveGoals(string? idsOrSpec)
    {
        var arg = (idsOrSpec ?? "").Trim();
        if (arg.Length == 0) return new ToolOutcome(false, "error", "give goal ids (comma-separated) or \"finished older than N days\"");

        var m = System.Text.RegularExpressions.Regex.Match(arg, @"older than\s+(\d+)", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        List<string> targets;
        if (m.Success)
        {
            var days = int.Parse(m.Groups[1].Value);
            // Collect the finished-not-archived goals older than N (don't archive yet — export each first).
            var cutoff = Now() - (long)days * 24 * 3600 * 1000;
            targets = _state.Goals().Where(g => !g.Running && !g.Archived && g.EndedAt is { } e && e <= cutoff).Select(g => g.Id).ToList();
            if (targets.Count == 0) return new ToolOutcome(true, "ok", $"no finished goals older than {days} day(s) to archive");
        }
        else
        {
            targets = SplitList(arg);
        }

        var archived = new List<string>();
        var skipped = new List<string>();
        var exported = new List<string>();
        foreach (var id in targets)
        {
            var g = _state.FindGoal(id);
            if (g is null) { skipped.Add($"{id} (unknown)"); continue; }
            if (g.Running) { skipped.Add($"{g.Id} (running — stop it first)"); continue; }
            if (g.Archived) { skipped.Add($"{g.Id} (already archived)"); continue; }
            var (ok, paths, err) = ExportGoal(g.Id);
            if (!ok) { skipped.Add($"{g.Id} (export failed: {err})"); continue; }
            exported.AddRange(paths);
            _state.ArchiveGoal(g.Id, Now());
            archived.Add(g.Id);
        }
        AuditTool("archive_goals", null, $"{archived.Count} archived, {skipped.Count} skipped");
        var detail = $"archived {archived.Count} goal(s)" + (archived.Count > 0 ? $": {string.Join(", ", archived)}" : "")
            + (skipped.Count > 0 ? $"; skipped {skipped.Count}: {string.Join("; ", skipped)}" : "")
            + (exported.Count > 0 ? $"; exported to the hub ({exported.Count} file(s))" : "");
        return new ToolOutcome(true, archived.Count > 0 ? "archived" : "ok", detail, new { archived, skipped, exported });
    }

    // Which bucket a conversation falls in. A running goal is never archived (archive refuses one),
    // so archived implies finished.
    private string Category(ArchStateStore.ArchGoal? g, string convId, bool isDefault)
    {
        if (g is null) return isDefault ? "operator" : "chat";
        if (g.Running) return IsHeld(convId) ? "held" : "running";
        return g.Archived ? "archived" : "finished";
    }

    private static bool FilterMatch(string cat, string filter) => filter switch
    {
        "running" => cat == "running",
        "held" => cat == "held",
        "finished" => cat == "finished",
        "archived" => cat == "archived",
        _ => true,
    };

    private string ConversationLine(ArchStateStore.Conversation conv, ArchStateStore.ArchGoal? g, string cat)
    {
        var name = conv.Name.Length > 42 ? conv.Name[..41].TrimEnd() + "…" : conv.Name;
        if (g is null)
            return $"{conv.Id} · \"{name}\" · {cat} · created {Ago(conv.CreatedAt)}";
        var (done, total) = ArchGoalPlans.Progress(g.Steps);
        var when = g.EndedAt is { } e ? $"ended {Ago(e)}" : $"started {Ago(g.StartedAt)}";
        var state = cat == "held" ? "held" : cat == "archived" ? $"archived ({g.State})" : g.State;
        return $"{conv.Id} · \"{name}\" · goal {g.Id} · {state} · {done}/{total} steps · {when}";
    }

    private static string Ago(long unixMs)
    {
        if (unixMs <= 0) return "—";
        var s = Math.Max(0, (Now() - unixMs) / 1000);
        if (s < 60) return $"{s} s ago";
        var mnt = s / 60;
        if (mnt < 60) return $"{mnt} min ago";
        var h = mnt / 60;
        return h < 48 ? $"{h} h ago" : $"{h / 24} d ago";
    }
}
