using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The pure half of goal STEP PLANS (openspec goal-step-plan, fleet task 94c722e7). A goal
/// conversation is an orchestration: an ordered list of steps (send brief A → wait for A's
/// closing line → transfer → send brief B → …), each gated on an agent reply, a transfer job
/// or the Operator's answer; the goal loop is only the engine that advances through them.
/// The plan is declared at start (<c>start_arch_goal(steps)</c>) or DERIVED from the goal
/// text (numbered / "STEP n —" lines), marked by the arch as it runs (<c>mark_step</c>),
/// editable mid-flight (<c>edit_goal_plan</c>), carried over when a goal is continued, and
/// rendered live in the Subagents tab. Everything here is framework-free and unit-tested;
/// the state lives in <see cref="ArchStateStore"/>, the binding in
/// <c>ArchAgentService.Goals.cs</c>.
/// </summary>
public static class ArchGoalPlans
{
    // ---- states --------------------------------------------------------------------------------
    public const string Pending = "pending";
    public const string Active = "active";
    public const string Done = "done";
    public const string Blocked = "blocked";
    public const string Skipped = "skipped";
    public static readonly string[] States = { Pending, Active, Done, Blocked, Skipped };

    // ---- kinds ---------------------------------------------------------------------------------
    public const string KindSend = "send";
    public const string KindWait = "wait";
    public const string KindTransfer = "transfer";
    public const string KindVerify = "verify";
    public const string KindRelayLoop = "relay-loop";
    public const string KindHuman = "human";
    public const string KindOther = "other";
    public static readonly string[] Kinds = { KindSend, KindWait, KindTransfer, KindVerify, KindRelayLoop, KindHuman, KindOther };

    public const int MaxSteps = 40;
    public const int MaxTitle = 160;
    public const int MaxText = 600;

    /// <summary>What proves a step: free text and/or a few typed fields (a hub path + size, a
    /// transfer job id, the agent's closing line, a commit / PR URL). Any field may be null.</summary>
    public sealed record Evidence(string? Text = null, string? Url = null, string? HubPath = null, long? Size = null,
        string? JobId = null, string? ClosingLine = null, string? Commit = null)
    {
        public bool IsEmpty => Text is null && Url is null && HubPath is null && Size is null && JobId is null && ClosingLine is null && Commit is null;

        /// <summary>One line for prompts and summaries.</summary>
        public string Line()
        {
            var parts = new List<string>();
            if (!string.IsNullOrWhiteSpace(Text)) parts.Add(Text.Trim());
            if (!string.IsNullOrWhiteSpace(ClosingLine)) parts.Add($"closing line: \"{ClosingLine.Trim()}\"");
            if (!string.IsNullOrWhiteSpace(HubPath)) parts.Add($"hub {HubPath.Trim()}{(Size is { } s ? $" ({s} bytes)" : "")}");
            if (!string.IsNullOrWhiteSpace(JobId)) parts.Add($"job {JobId.Trim()}");
            if (!string.IsNullOrWhiteSpace(Commit)) parts.Add($"commit {Commit.Trim()}");
            if (!string.IsNullOrWhiteSpace(Url)) parts.Add(Url.Trim());
            return string.Join(" · ", parts);
        }
    }

    /// <summary>One step of the plan. <c>Done</c> is the one-line "what proves it". <c>Counter</c>
    /// counts the questions a relay-loop step relayed. <c>AwaitsHuman</c> marks a blocked step
    /// the harness set from a NEEDS_HUMAN ending (cleared when the Operator answers).</summary>
    public sealed record Step(string Title, string? Done, string Kind, string State, string? Note, Evidence? Evidence,
        int Counter, long UpdatedAt, bool AwaitsHuman)
    {
        public static Step New(string title, string? done = null, string? kind = null, long now = 0) =>
            new(Clip(title, MaxTitle), ClipOrNull(done, MaxText), NormalizeKind(kind), Pending, null, null, 0, now, false);
    }

    public static string NormalizeState(string? state)
    {
        var s = (state ?? "").Trim().ToLowerInvariant();
        return States.Contains(s) ? s : s is "complete" or "completed" or "finished" ? Done : s is "running" or "current" or "in-progress" ? Active : s is "skip" ? Skipped : s is "human" or "needs-human" ? Blocked : "";
    }

    public static string NormalizeKind(string? kind)
    {
        var k = (kind ?? "").Trim().ToLowerInvariant().Replace('_', '-');
        return k.Length == 0 ? KindOther : Kinds.Contains(k) ? k : k is "relay" or "loop" ? KindRelayLoop : k is "operator" or "decision" ? KindHuman : k is "check" ? KindVerify : KindOther;
    }

    private static string Clip(string? s, int max)
    {
        var t = (s ?? "").Replace("\r\n", "\n").Trim();
        return t.Length > max ? t[..max].TrimEnd() + "…" : t;
    }

    private static string? ClipOrNull(string? s, int max) => string.IsNullOrWhiteSpace(s) ? null : Clip(s, max);

    // ---- derive a plan from the goal text ------------------------------------------------------

    // "STEP 1 — title", "STEP 2: title", "Step 3) title", "1. title", "2) title", "- 3. title".
    private static readonly Regex StepLine = new(@"^\s*(?:[-*•]\s*)?(?:step\s*)?(\d{1,2})\s*[\.\):—–-]\s+(.+?)\s*$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    // "… — done: what proves it" / "… (done: …)" / "… done when …" at the end of a step line.
    private static readonly Regex DoneTail = new(@"^(.*?)(?:\s*[—–-]\s*|\s*\(\s*|\s+)done\s*(?:when|:)\s*(.+?)\)?\s*$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>A best-effort plan from the goal text: its numbered / "STEP n —" lines in
    /// order (duplicate numbers keep the first). Empty when the text has fewer than two.</summary>
    public static List<Step> Derive(string? goalText, long now = 0)
    {
        var steps = new List<Step>();
        var seen = new HashSet<int>();
        foreach (var raw in (goalText ?? "").Replace("\r\n", "\n").Split('\n'))
        {
            var m = StepLine.Match(raw);
            if (!m.Success) continue;
            var n = int.Parse(m.Groups[1].Value);
            if (!seen.Add(n)) continue;
            var body = m.Groups[2].Value.Trim();
            string? done = null;
            var d = DoneTail.Match(body);
            if (d.Success && d.Groups[1].Value.Trim().Length > 0) { body = d.Groups[1].Value.Trim(); done = d.Groups[2].Value.Trim(); }
            steps.Add(Step.New(body, done, GuessKind(body), now));
            if (steps.Count >= MaxSteps) break;
        }
        return steps.Count >= 2 ? steps : new List<Step>();
    }

    /// <summary>A kind from the words of a derived step; <c>other</c> when nothing fits.</summary>
    public static string GuessKind(string title)
    {
        var t = title.ToLowerInvariant();
        if (t.Contains("relay") || t.Contains("relay-loop") || t.Contains("relay loop")) return KindRelayLoop;
        if (t.Contains("operator") && (t.Contains("decide") || t.Contains("answer") || t.Contains("confirm") || t.Contains("ask"))) return KindHuman;
        if (t.Contains("hub_transfer") || t.Contains("transfer")) return KindTransfer;
        if (t.StartsWith("wait") || t.Contains("wait for")) return KindWait;   // "wait for A, verify with hub_files" is a wait
        if (t.StartsWith("verify") || t.Contains("verify ") || t.Contains("check ") || t.Contains("hub_files")) return KindVerify;
        if (t.Contains("closing line") || t.Contains("reply")) return KindWait;
        if (t.StartsWith("send") || t.Contains("send ") || t.Contains("brief") || t.Contains("dispatch")) return KindSend;
        return KindOther;
    }

    // ---- parse the steps parameter (tool call or API) --------------------------------------

    /// <summary>The <c>steps</c> argument of a tool call or request: a JSON array of
    /// <c>{ title, done, kind }</c> objects (or plain strings), or a string holding that JSON,
    /// or a string of lines (one step per line, numbered or not, "— done: …" optional).
    /// Null / empty → an empty list.</summary>
    public static List<Step> ParseSteps(JsonNode? node, long now = 0)
    {
        var steps = new List<Step>();
        if (node is null) return steps;
        if (node is JsonValue v && v.TryGetValue<string>(out var text))
        {
            var trimmed = (text ?? "").Trim();
            if (trimmed.Length == 0) return steps;
            if (trimmed.StartsWith('['))
            {
                try { return ParseSteps(JsonNode.Parse(trimmed), now); } catch { /* fall through to lines */ }
            }
            foreach (var raw in trimmed.Replace("\r\n", "\n").Split('\n'))
            {
                var line = raw.Trim();
                if (line.Length == 0) continue;
                var m = StepLine.Match(line);
                var body = m.Success ? m.Groups[2].Value.Trim() : line.TrimStart('-', '*', '•', ' ');
                string? done = null;
                var d = DoneTail.Match(body);
                if (d.Success && d.Groups[1].Value.Trim().Length > 0) { body = d.Groups[1].Value.Trim(); done = d.Groups[2].Value.Trim(); }
                if (body.Length > 0) steps.Add(Step.New(body, done, GuessKind(body), now));
                if (steps.Count >= MaxSteps) break;
            }
            return steps;
        }
        if (node is JsonArray arr)
        {
            foreach (var item in arr)
            {
                if (item is JsonObject o)
                {
                    var title = o["title"]?.ToString() ?? o["step"]?.ToString() ?? "";
                    if (string.IsNullOrWhiteSpace(title)) continue;
                    var kind = o["kind"]?.ToString();
                    steps.Add(Step.New(title, o["done"]?.ToString(), string.IsNullOrWhiteSpace(kind) ? GuessKind(title) : kind, now));
                }
                else if (item is JsonValue sv && sv.TryGetValue<string>(out var s) && !string.IsNullOrWhiteSpace(s))
                    steps.Add(Step.New(s, null, GuessKind(s), now));
                if (steps.Count >= MaxSteps) break;
            }
        }
        return steps;
    }

    /// <summary>The <c>evidence</c> argument: a string (free text — a URL alone becomes
    /// <c>Url</c>) or an object with any of text, url, hubPath, size, jobId, closingLine,
    /// commit (unknown keys fold into the text). Null when nothing was given.</summary>
    public static Evidence? ParseEvidence(JsonNode? node)
    {
        if (node is null) return null;
        if (node is JsonValue v && v.TryGetValue<string>(out var text))
        {
            var t = (text ?? "").Trim();
            if (t.Length == 0) return null;
            if (t.StartsWith('{'))
            {
                try { return ParseEvidence(JsonNode.Parse(t)); } catch { /* plain text */ }
            }
            return Uri.TryCreate(t, UriKind.Absolute, out var u) && (u.Scheme == "http" || u.Scheme == "https") && !t.Contains(' ')
                ? new Evidence(Url: t) : new Evidence(Text: Clip(t, MaxText));
        }
        if (node is JsonObject o)
        {
            string? S(params string[] keys)
            {
                foreach (var k in keys)
                    if (o[k] is { } n && !string.IsNullOrWhiteSpace(n.ToString())) return Clip(n.ToString(), MaxText);
                return null;
            }
            long? size = null;
            if (o["size"] is { } sz) { try { size = sz.GetValue<long>(); } catch { if (long.TryParse(sz.ToString(), out var l)) size = l; } }
            var known = new HashSet<string>(StringComparer.OrdinalIgnoreCase) { "text", "note", "url", "pr", "link", "hubPath", "path", "size", "jobId", "job", "closingLine", "closing", "commit", "sha" };
            var extra = string.Join("; ", o.Where(kv => !known.Contains(kv.Key) && kv.Value is not null).Select(kv => $"{kv.Key}: {kv.Value}"));
            var text2 = S("text", "note");
            if (extra.Length > 0) text2 = string.IsNullOrEmpty(text2) ? Clip(extra, MaxText) : Clip(text2 + "; " + extra, MaxText);
            var ev = new Evidence(text2, S("url", "pr", "link"), S("hubPath", "path"), size, S("jobId", "job"), S("closingLine", "closing"), S("commit", "sha"));
            return ev.IsEmpty ? null : ev;
        }
        return null;
    }

    // ---- find / mark / edit --------------------------------------------------------------------

    /// <summary>The 0-based index of the step <paramref name="stepRef"/> names: a 1-based
    /// number, or a title (exact first, then a unique case-insensitive prefix / contains).
    /// -1 when nothing matches, -2 when a title matches more than one step.</summary>
    public static int FindIndex(IReadOnlyList<Step> steps, string? stepRef)
    {
        var r = (stepRef ?? "").Trim();
        if (r.Length == 0) return -1;
        if (int.TryParse(r.TrimStart('#'), out var n)) return n >= 1 && n <= steps.Count ? n - 1 : -1;
        for (var i = 0; i < steps.Count; i++) if (string.Equals(steps[i].Title, r, StringComparison.OrdinalIgnoreCase)) return i;
        var hits = new List<int>();
        for (var i = 0; i < steps.Count; i++) if (steps[i].Title.StartsWith(r, StringComparison.OrdinalIgnoreCase)) hits.Add(i);
        if (hits.Count == 0) for (var i = 0; i < steps.Count; i++) if (steps[i].Title.Contains(r, StringComparison.OrdinalIgnoreCase)) hits.Add(i);
        return hits.Count == 1 ? hits[0] : hits.Count == 0 ? -1 : -2;
    }

    /// <summary>The index of the step the goal is on: the first active step, else -1.</summary>
    public static int ActiveIndex(IReadOnlyList<Step> steps)
    {
        for (var i = 0; i < steps.Count; i++) if (steps[i].State == Active) return i;
        return -1;
    }

    /// <summary>Marks one step. Rules: exactly one step is active at a time unless a
    /// relay-loop step is running (marking a step active demotes every other active
    /// non-relay-loop step to pending); a relay-loop step marked active again counts one more
    /// question relayed (<paramref name="counter"/> sets the count outright); a note or
    /// evidence given with any state replaces the step's; marking a step anything but blocked
    /// clears its awaits-human flag.</summary>
    public static List<Step> Mark(IReadOnlyList<Step> steps, int index, string state, string? note, Evidence? evidence, int? counter, long now)
    {
        var list = steps.ToList();
        var cur = list[index];
        var count = counter ?? (cur.Kind == KindRelayLoop && state == Active && cur.State == Active ? cur.Counter + 1 : cur.Counter);
        list[index] = cur with
        {
            State = state,
            Note = note is null ? (state == Blocked ? cur.Note : null) : ClipOrNull(note, MaxText),
            Evidence = evidence ?? cur.Evidence,
            Counter = Math.Max(0, count),
            UpdatedAt = now,
            AwaitsHuman = state == Blocked && cur.AwaitsHuman,
        };
        if (state == Active && cur.Kind != KindRelayLoop)
            for (var i = 0; i < list.Count; i++)
                if (i != index && list[i].State == Active && list[i].Kind != KindRelayLoop)
                    list[i] = list[i] with { State = Pending, UpdatedAt = now };
        return list;
    }

    /// <summary>The goal conversation ended a turn with NEEDS_HUMAN: the active step (else the
    /// first pending one, else a new "Operator decision" step) becomes blocked, awaiting the
    /// human, with the question as its note.</summary>
    public static List<Step> BlockOnHuman(IReadOnlyList<Step> steps, string? question, long now)
    {
        var list = steps.ToList();
        var idx = ActiveIndex(list);
        if (idx < 0) idx = list.FindIndex(s => s.State == Pending);
        if (idx < 0)
        {
            list.Add(Step.New("Operator decision", "the Operator answered", KindHuman, now));
            idx = list.Count - 1;
        }
        list[idx] = list[idx] with { State = Blocked, Note = ClipOrNull(question, MaxText) ?? "waiting on the Operator", UpdatedAt = now, AwaitsHuman = true };
        return list;
    }

    /// <summary>The Operator answered: every step blocked on them is active again (the first
    /// one; any other goes back to pending), the question cleared. Unchanged list when
    /// nothing awaited them.</summary>
    public static List<Step> ClearHumanBlock(IReadOnlyList<Step> steps, long now)
    {
        var list = steps.ToList();
        var first = true;
        for (var i = 0; i < list.Count; i++)
        {
            if (!(list[i].State == Blocked && list[i].AwaitsHuman)) continue;
            list[i] = list[i] with { State = first ? Active : Pending, Note = null, AwaitsHuman = false, UpdatedAt = now };
            first = false;
        }
        return list;
    }

    public static bool AwaitsHuman(IReadOnlyList<Step> steps) => steps.Any(s => s.State == Blocked && s.AwaitsHuman);

    /// <summary>A continued goal's starting plan: done and skipped steps are kept with their
    /// evidence; active and blocked ones go back to pending; counters stay.</summary>
    public static List<Step> CarryOver(IReadOnlyList<Step> steps, long now) =>
        steps.Select(s => s.State is Done or Skipped ? s : s with { State = Pending, Note = null, AwaitsHuman = false, UpdatedAt = now }).ToList();

    public static (int Done, int Total) Progress(IReadOnlyList<Step> steps) => (steps.Count(s => s.State is Done or Skipped), steps.Count);
    public static int BlockedCount(IReadOnlyList<Step> steps) => steps.Count(s => s.State == Blocked);

    public const string ActionSet = "set";
    public const string ActionAdd = "add";
    public const string ActionRename = "rename";
    public const string ActionRemove = "remove";
    public const string ActionMove = "move";

    /// <summary>Edits the plan: <c>set</c> replaces it (steps whose title matches keep their
    /// state and evidence), <c>add</c> appends (or inserts at <paramref name="to"/>, 1-based),
    /// <c>rename</c> changes title / done / kind, <c>remove</c> drops one, <c>move</c> moves one
    /// to position <paramref name="to"/>. Returns the error text, or null with the new list.</summary>
    public static (List<Step>? Steps, string? Error) Edit(IReadOnlyList<Step> steps, string? action, string? stepRef, string? title, string? done, string? kind, int? to, IReadOnlyList<Step>? newSteps, long now)
    {
        var list = steps.ToList();
        switch ((action ?? "").Trim().ToLowerInvariant())
        {
            case ActionSet:
            {
                if (newSteps is null || newSteps.Count == 0) return (null, "set needs steps: an ordered list of { title, done, kind }");
                var merged = newSteps.Take(MaxSteps).Select(n =>
                {
                    var old = list.FirstOrDefault(o => string.Equals(o.Title, n.Title, StringComparison.OrdinalIgnoreCase));
                    return old is null ? n with { UpdatedAt = now } : n with { State = old.State, Note = old.Note, Evidence = old.Evidence, Counter = old.Counter, AwaitsHuman = old.AwaitsHuman, UpdatedAt = old.UpdatedAt };
                }).ToList();
                return (merged, null);
            }
            case ActionAdd:
            {
                if (string.IsNullOrWhiteSpace(title)) return (null, "add needs a title");
                if (list.Count >= MaxSteps) return (null, $"a plan holds at most {MaxSteps} steps");
                var step = Step.New(title, done, string.IsNullOrWhiteSpace(kind) ? GuessKind(title) : kind, now);
                var at = to is { } t ? Math.Clamp(t - 1, 0, list.Count) : list.Count;
                list.Insert(at, step);
                return (list, null);
            }
            case ActionRename:
            {
                var i = FindIndex(list, stepRef);
                if (i < 0) return (null, i == -2 ? $"\"{stepRef}\" names more than one step; use its number" : $"no step \"{stepRef}\"");
                if (string.IsNullOrWhiteSpace(title) && done is null && string.IsNullOrWhiteSpace(kind)) return (null, "rename needs a new title, done or kind");
                list[i] = list[i] with
                {
                    Title = string.IsNullOrWhiteSpace(title) ? list[i].Title : Clip(title, MaxTitle),
                    Done = done is null ? list[i].Done : ClipOrNull(done, MaxText),
                    Kind = string.IsNullOrWhiteSpace(kind) ? list[i].Kind : NormalizeKind(kind),
                    UpdatedAt = now,
                };
                return (list, null);
            }
            case ActionRemove:
            {
                var i = FindIndex(list, stepRef);
                if (i < 0) return (null, i == -2 ? $"\"{stepRef}\" names more than one step; use its number" : $"no step \"{stepRef}\"");
                list.RemoveAt(i);
                return (list, null);
            }
            case ActionMove:
            {
                var i = FindIndex(list, stepRef);
                if (i < 0) return (null, i == -2 ? $"\"{stepRef}\" names more than one step; use its number" : $"no step \"{stepRef}\"");
                if (to is not { } target) return (null, "move needs to: the new 1-based position");
                var step = list[i];
                list.RemoveAt(i);
                list.Insert(Math.Clamp(target - 1, 0, list.Count), step);
                return (list, null);
            }
            default:
                return (null, "action must be one of set | add | rename | remove | move");
        }
    }

    // ---- words -------------------------------------------------------------------------------------

    public static string Glyph(string state) => state switch
    {
        Done => "✓",
        Active => "▶",
        Blocked => "✋",
        Skipped => "–",
        _ => "○",
    };

    /// <summary>One line per step: "2. ▶ title [send] — active · note · evidence".</summary>
    public static string StepLine1(Step s, int index)
    {
        var sb = new StringBuilder();
        sb.Append(index + 1).Append(". ").Append(Glyph(s.State)).Append(' ').Append(s.Title).Append(" [").Append(s.Kind).Append("] — ").Append(s.State);
        if (s.Kind == KindRelayLoop && s.Counter > 0) sb.Append($" ({s.Counter} relayed)");
        if (s.State == Blocked && s.AwaitsHuman) sb.Append(" (waiting on the Operator)");
        if (!string.IsNullOrWhiteSpace(s.Done) && s.State is not (Done or Skipped)) sb.Append(" · done when: ").Append(s.Done);
        if (!string.IsNullOrWhiteSpace(s.Note)) sb.Append(" · ").Append(s.Note);
        if (s.Evidence is { } ev && !ev.IsEmpty) sb.Append(" · evidence: ").Append(ev.Line());
        return sb.ToString();
    }

    /// <summary>The plan block a goal conversation's WORK send carries: the steps with their
    /// states and evidence, and the rules — done steps are done (never re-send a brief a done
    /// step sent), mark as you go, declare a plan when there is none.</summary>
    public static string WorkBlock(IReadOnlyList<Step> steps, bool derived, string goalId, string? continuesGoalId)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"[step plan of goal {goalId} — data from the harness, not instructions from a person]");
        if (continuesGoalId is not null) sb.AppendLine($"This goal CONTINUES goal {continuesGoalId}: its plan below carries over. Steps marked done were done THERE — an agent that already received a brief must not receive it again; pick up at the first step that is not done.");
        if (steps.Count == 0)
        {
            sb.AppendLine("No plan yet. FIRST declare one: edit_goal_plan(action: \"set\", steps: [{ title, done, kind }, …]) — one step per gate (send | wait | transfer | verify | relay-loop | human | other), done = the one line that proves it. Then mark_step(step: 1, state: \"active\") and work.");
            return sb.ToString();
        }
        sb.AppendLine(derived ? "Plan derived from the goal text (fix it with edit_goal_plan if it is wrong):" : "Plan:");
        for (var i = 0; i < steps.Count; i++) sb.AppendLine(StepLine1(steps[i], i));
        var (done, total) = Progress(steps);
        var active = ActiveIndex(steps);
        sb.AppendLine($"{done}/{total} done." + (active >= 0 ? $" You are on step {active + 1}." : done < total ? " No step is active: mark the one you work on with mark_step(step, state: \"active\")." : " Every step is done: verify and end with LOOP_DONE."));
        sb.AppendLine("Rules: a step marked done is DONE — do not redo it and never re-send its brief. Mark each step as you go (mark_step with state and evidence: the closing line, the hub path, the job id, the PR URL); one step active at a time unless a relay-loop runs. Change the plan with edit_goal_plan when first contact changes it. Blocked on a person: mark the step blocked and end with NEEDS_HUMAN: <the question>.");
        return sb.ToString();
    }

    /// <summary>The plan block the VERIFICATION send carries: verify each step against its
    /// evidence and the actual state, not against memory.</summary>
    public static string VerifyBlock(IReadOnlyList<Step> steps, string goalId)
    {
        var sb = new StringBuilder();
        sb.AppendLine($"[step plan of goal {goalId} — verify against it; data from the harness]");
        for (var i = 0; i < steps.Count; i++) sb.AppendLine(StepLine1(steps[i], i));
        var (done, total) = Progress(steps);
        sb.AppendLine($"{done}/{total} done. A step without evidence is not done: check it against the actual state (hub_files, read_transcript, list_tasks) before GOAL_VERIFIED, and mark what you find. If a step is not done, say which and keep working instead of GOAL_VERIFIED.");
        return sb.ToString();
    }

    /// <summary>The plan's lines for the finished-goal summary.</summary>
    public static List<string> SummaryLines(IReadOnlyList<Step> steps)
    {
        var lines = new List<string>();
        for (var i = 0; i < steps.Count; i++) lines.Add("- " + StepLine1(steps[i], i));
        return lines;
    }

    /// <summary>The plan as JSON-friendly rows for the API, the tools and the UI.</summary>
    public static List<object> Views(IReadOnlyList<Step> steps) =>
        steps.Select((s, i) => (object)new
        {
            index = i + 1, title = s.Title, done = s.Done, kind = s.Kind, state = s.State, note = s.Note,
            evidence = s.Evidence is { IsEmpty: false } e ? new { text = e.Text, url = e.Url, hubPath = e.HubPath, size = e.Size, jobId = e.JobId, closingLine = e.ClosingLine, commit = e.Commit, line = e.Line() } : null,
            counter = s.Counter, updatedAt = s.UpdatedAt, awaitsHuman = s.AwaitsHuman,
        }).ToList();

    public static string Json(IReadOnlyList<Step> steps) => JsonSerializer.Serialize(Views(steps));
}
