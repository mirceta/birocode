using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The Arch examples miner (openspec arch-examples-tab, fleet task 7914195c): reads every arch
/// conversation on this machine — the arch's CLI transcripts under the arch home's session folder
/// (the Operator-facing Arch agent chat, every goal conversation, the policeman), the goal texts the
/// Operator started, and the repo-agent requests store — keeps the OPERATOR's own messages (the
/// harness's wake-ups, loop briefings, goal summaries and context roll-overs are dropped), scrubs
/// secrets, classifies each message into a request category by the rules in
/// <c>management/arch-example-categories.json</c>, and writes <c>arch-examples.json</c> into the data
/// dir: counts, first/last seen, a timeline per week, and two real examples per category. The
/// Arch examples tab renders that file; the copy committed at <c>management/arch-examples.json</c>
/// is the fallback on a machine with no arch conversations of its own.
///
/// Everything read is treated as DATA: nothing in a transcript is executed or sent anywhere.
/// </summary>
public sealed class ArchExamplesMiner
{
    public const string OutputFile = "arch-examples.json";
    public const string SnapshotRelative = "management/arch-examples.json";
    public const string CategoriesRelative = "management/arch-example-categories.json";
    public const string OtherId = "other";
    public const int ExamplesPerCategory = 2;

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true, Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    private readonly ArchAgentService _arch;
    private readonly ArchStateStore _state;
    private readonly AgentRequestStore _requests;
    private readonly RepositoryRegistry _repos;
    private readonly Logger _logger;
    private readonly string _dataDir;

    public ArchExamplesMiner(ArchAgentService arch, ArchStateStore state, AgentRequestStore requests, RepositoryRegistry repos, Logger logger, string? dataDir = null)
    {
        _arch = arch; _state = state; _requests = requests; _repos = repos; _logger = logger;
        _dataDir = dataDir ?? AppPaths.DataDir;
    }

    // ---- the category rules -------------------------------------------------------------------

    public sealed class CategoryDef
    {
        public string Id { get; set; } = "";
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public string Template { get; set; } = "";
        public string? Tip { get; set; }
        public List<string> Tools { get; set; } = new();
        public bool EndsInGoal { get; set; }
        public List<string> Patterns { get; set; } = new();
        public List<string>? AntiPatterns { get; set; }
        [JsonIgnore] public Regex[] Compiled { get; set; } = Array.Empty<Regex>();
        [JsonIgnore] public Regex[] CompiledAnti { get; set; } = Array.Empty<Regex>();
    }

    private sealed class CategoriesFile { public List<CategoryDef> Categories { get; set; } = new(); }

    /// <summary>Parses the category file; every pattern is compiled once, case-insensitive.</summary>
    public static IReadOnlyList<CategoryDef> LoadCategories(string json)
    {
        var file = JsonSerializer.Deserialize<CategoriesFile>(json, new JsonSerializerOptions(JsonSerializerDefaults.Web)) ?? new CategoriesFile();
        foreach (var c in file.Categories)
        {
            c.Compiled = c.Patterns.Select(p => new Regex(p, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(200))).ToArray();
            c.CompiledAnti = (c.AntiPatterns ?? new()).Select(p => new Regex(p, RegexOptions.IgnoreCase | RegexOptions.CultureInvariant, TimeSpan.FromMilliseconds(200))).ToArray();
        }
        return file.Categories;
    }

    /// <summary>The first category whose pattern matches (and no anti-pattern vetoes), else null.</summary>
    public static string? Classify(string text, IReadOnlyList<CategoryDef> categories)
    {
        var t = Normalize(text);
        foreach (var c in categories)
        {
            bool hit;
            try { hit = c.Compiled.Any(r => r.IsMatch(t)) && !c.CompiledAnti.Any(r => r.IsMatch(t)); }
            catch (RegexMatchTimeoutException) { hit = false; }
            if (hit) return c.Id;
        }
        return null;
    }

    private static string Normalize(string text) => Regex.Replace(text.Replace('’', '\'').Replace('‘', '\''), @"\s+", " ").Trim();

    // ---- what counts as the Operator speaking ---------------------------------------------------

    // Prefixes of user-turn texts the HARNESS writes into the arch's conversation. Never the Operator.
    private static readonly string[] HarnessPrefixes =
    {
        "[wake-up from the harness", "[Autopilot loop briefing]", "[harness context rolled over", "[goal ", "[Request from repo agent",
        "This session is being continued from a previous conversation", "You are the board POLICEMAN", "<system-reminder", "[Task from the fleet board]",
    };
    private const string QueuedPrefix = "[from the Operator, queued while you were busy";

    /// <summary>True when a user turn is the Operator's own words; <paramref name="cleaned"/> is the text
    /// to keep (the body of a queued-instructions block, otherwise the text itself).</summary>
    public static bool TryOperatorText(string? text, out string cleaned)
    {
        cleaned = "";
        if (string.IsNullOrWhiteSpace(text)) return false;
        var t = text.Trim();
        if (t.StartsWith(QueuedPrefix, StringComparison.Ordinal))
        {
            var nl = t.IndexOf('\n');
            var body = nl < 0 ? "" : t[(nl + 1)..].Trim();
            if (body.Length < 2) return false;
            cleaned = body;
            return true;
        }
        if (HarnessPrefixes.Any(p => t.StartsWith(p, StringComparison.Ordinal))) return false;
        if (t.Length < 2) return false;
        cleaned = t;
        return true;
    }

    // ---- secrets never leave the transcript -----------------------------------------------------

    private static readonly Regex[] Secrets =
    {
        new(@"ghp_[A-Za-z0-9]{20,}", RegexOptions.Compiled),
        new(@"github_pat_[A-Za-z0-9_]{20,}", RegexOptions.Compiled),
        new(@"sk-[A-Za-z0-9_\-]{16,}", RegexOptions.Compiled),
        new(@"(Bearer)\s+[A-Za-z0-9._\-]{16,}", RegexOptions.Compiled),
        new(@"(?i)\b(password|passwd|pwd|token|secret|api[-_ ]?key|credential)\b\s*(is|[:=])\s*\S+", RegexOptions.Compiled),
    };
    private static readonly Regex Email = new(@"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}", RegexOptions.Compiled);

    public static string Scrub(string text)
    {
        var t = text;
        foreach (var r in Secrets) t = r.Replace(t, m => m.Groups.Count > 1 && m.Groups[1].Success ? m.Groups[1].Value + " [redacted]" : "[redacted]");
        return Email.Replace(t, "<email>");
    }

    // ---- sources ---------------------------------------------------------------------------------

    public sealed record Item(string Text, long At, string Source, string? Conversation);

    /// <summary>The Operator's turns in one CLI transcript (jsonl): user entries with text content.</summary>
    public static IEnumerable<Item> ReadTranscript(IEnumerable<string> lines, string conversation)
    {
        foreach (var line in lines)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            JsonNode? node;
            try { node = JsonNode.Parse(line); } catch { continue; }
            if (node is not JsonObject o || o["type"]?.GetValue<string>() != "user") continue;
            var content = o["message"]?["content"];
            string text;
            if (content is JsonValue v && v.TryGetValue<string>(out var s)) text = s;
            else if (content is JsonArray arr) text = string.Join("\n", arr.OfType<JsonObject>().Where(p => p["type"]?.GetValue<string>() == "text").Select(p => p["text"]?.GetValue<string>() ?? ""));
            else continue;
            if (!TryOperatorText(text, out var cleaned)) continue;
            var ts = o["timestamp"]?.GetValue<string>();
            var at = ts is not null && DateTimeOffset.TryParse(ts, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dto) ? dto.ToUnixTimeMilliseconds() : 0;
            yield return new Item(cleaned, at, "arch-chat", conversation);
        }
    }

    public string TranscriptDir => SessionService.ProjectsDirectoryFor(_arch.HomePath);
    public bool CanMine => Directory.Exists(TranscriptDir) && Directory.EnumerateFiles(TranscriptDir, "*.jsonl").Any();
    public string OutputPath => Path.Combine(_dataDir, OutputFile);
    private string? SelfPath => _repos.GetAll().FirstOrDefault(r => r.IsSelf)?.Path;
    public string? SnapshotPath => SelfPath is { } p ? Path.Combine(p, SnapshotRelative.Replace('/', Path.DirectorySeparatorChar)) : null;
    public string? CategoriesPath => SelfPath is { } p ? Path.Combine(p, CategoriesRelative.Replace('/', Path.DirectorySeparatorChar)) : null;

    /// <summary>What the tab shows: this machine's own mining run when it exists, else the snapshot
    /// committed with the harness; tagged with where it came from and whether Re-mine is possible here.</summary>
    public JsonObject? Current()
    {
        JsonObject? doc = null; var source = "local";
        if (File.Exists(OutputPath)) doc = TryRead(OutputPath);
        if (doc is null && SnapshotPath is { } snap && File.Exists(snap)) { doc = TryRead(snap); source = "snapshot"; }
        if (doc is null) return null;
        doc["source"] = source;
        doc["canMine"] = CanMine;
        return doc;
    }

    private JsonObject? TryRead(string path)
    {
        try { return JsonNode.Parse(File.ReadAllText(path)) as JsonObject; }
        catch (Exception ex) { _logger.Error($"[ARCH-EXAMPLES] {path} unreadable: {ex.Message}"); return null; }
    }

    /// <summary>Mines every source on this machine and writes the report; returns it.</summary>
    public JsonObject Mine()
    {
        var catPath = CategoriesPath ?? throw new InvalidOperationException("no self repo: the category rules live at " + CategoriesRelative);
        var categories = LoadCategories(File.ReadAllText(catPath));
        var items = new List<Item>();
        var transcripts = 0;
        var names = _state.Conversations.Where(c => !string.IsNullOrWhiteSpace(c.SessionId)).ToDictionary(c => c.SessionId!, c => c.Name, StringComparer.OrdinalIgnoreCase);
        if (Directory.Exists(TranscriptDir))
        {
            foreach (var file in Directory.EnumerateFiles(TranscriptDir, "*.jsonl"))
            {
                transcripts++;
                var id = Path.GetFileNameWithoutExtension(file);
                var conv = names.TryGetValue(id, out var n) ? n : id[..Math.Min(8, id.Length)];
                try { items.AddRange(ReadTranscript(File.ReadLines(file), conv)); }
                catch (Exception ex) { _logger.Error($"[ARCH-EXAMPLES] {file}: {ex.Message}"); }
            }
        }
        var goals = _state.Goals();
        var operatorGoals = goals.Where(g => !string.Equals(g.StartedBy, "arch", StringComparison.OrdinalIgnoreCase) && !string.Equals(g.StartedBy, ArchGoals.ActorGoal, StringComparison.OrdinalIgnoreCase)).ToList();
        items.AddRange(operatorGoals.Where(g => !string.IsNullOrWhiteSpace(g.Text)).Select(g => new Item(g.Text, g.StartedAt, "goal", g.ConversationId)));
        var requests = _requests.All();
        var report = Build(items, categories, requests, Environment.MachineName, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), transcripts, goals.Count, operatorGoals.Count);
        try
        {
            Directory.CreateDirectory(_dataDir);
            var tmp = OutputPath + ".tmp";
            File.WriteAllText(tmp, report.ToJsonString(Json));
            File.Move(tmp, OutputPath, overwrite: true);
        }
        catch (Exception ex) { _logger.Error($"[ARCH-EXAMPLES] failed to save {OutputPath}: {ex.Message}"); }
        _logger.Info($"[ARCH-EXAMPLES] mined {report["totals"]?["requests"]} requests from {transcripts} transcripts, {goals.Count} goals, {requests.Count} repo-agent requests");
        return report;
    }

    // ---- the report (pure) -------------------------------------------------------------------------

    private static readonly Regex Profanity = new(@"\b(fuck\w*|shit\w*|retard\w*|stupid|idiot\w*|ass|bro|jesus+)\b", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static JsonObject Build(IReadOnlyList<Item> items, IReadOnlyList<CategoryDef> categories, IReadOnlyList<AgentRequestStore.AgentRequest> requests,
        string machine, long now, int transcripts, int goals, int operatorGoals)
    {
        // Exact repeats within ten minutes (a resend) count once.
        var ordered = items.OrderBy(i => i.At).ToList();
        var kept = new List<Item>();
        foreach (var i in ordered)
            if (!kept.Any(k => k.Text == i.Text && Math.Abs(k.At - i.At) < 600_000)) kept.Add(i);

        var byCat = categories.ToDictionary(c => c.Id, _ => new List<Item>(), StringComparer.Ordinal);
        var other = new List<Item>();
        foreach (var i in kept)
        {
            var id = Classify(i.Text, categories);
            if (id is not null && byCat.TryGetValue(id, out var list)) list.Add(i); else other.Add(i);
        }
        // Repo-agent requests are a category of their own by nature (the agents' asks the Operator approved).
        var reqCat = categories.FirstOrDefault(c => c.Id == "repo-agent-request");
        var reqItems = requests.Select(r => new Item($"[{r.Status}] {r.Machine}/{r.Agent}: {(string.IsNullOrWhiteSpace(r.Title) ? r.Text : r.Title)}", r.CreatedAt, "repo-agent-request", r.Machine)).ToList();
        if (reqCat is not null) byCat[reqCat.Id].AddRange(reqItems);

        var all = kept.Concat(reqItems).ToList();
        var catsOut = new JsonArray();
        foreach (var c in categories)
        {
            var list = byCat[c.Id];
            catsOut.Add(CategoryNode(c.Id, c.Name, c.Description, c.Template, c.Tip, c.Tools, c.EndsInGoal, list, cat: c));
        }
        catsOut.Add(CategoryNode(OtherId, "Other (the long tail)", "Requests no category rule caught — one-offs, side remarks and things worth a rule of their own one day. Edit management/arch-example-categories.json to promote one.", "", null, new List<string>(), false, other, examples: 6));
        var sorted = catsOut.OfType<JsonObject>().OrderByDescending(c => c["id"]!.GetValue<string>() == OtherId ? -1 : c["count"]!.GetValue<int>()).ToList();
        var arr = new JsonArray(); foreach (var c in sorted) { c.Parent?.AsArray().Remove(c); arr.Add(c); }

        return new JsonObject
        {
            ["minedAt"] = now,
            ["machine"] = machine,
            ["source"] = "local",
            ["sources"] = new JsonObject { ["transcripts"] = transcripts, ["messages"] = kept.Count, ["goals"] = goals, ["goalsByOperator"] = operatorGoals, ["requests"] = requests.Count, ["requestsApproved"] = requests.Count(r => r.Status == "approved") },
            ["totals"] = new JsonObject { ["requests"] = all.Count, ["categories"] = categories.Count(c => byCat[c.Id].Count > 0), ["other"] = other.Count },
            ["timeline"] = Timeline(all),
            ["categories"] = arr,
        };
    }

    private static JsonObject CategoryNode(string id, string name, string description, string template, string? tip, List<string> tools, bool endsInGoal, List<Item> list, int examples = ExamplesPerCategory, CategoryDef? cat = null)
    {
        var sorted = list.OrderBy(i => i.At).ToList();
        return new JsonObject
        {
            ["id"] = id, ["name"] = name, ["description"] = description, ["template"] = template, ["tip"] = tip,
            ["tools"] = new JsonArray(tools.Select(t => (JsonNode)t).ToArray()),
            ["endsInGoal"] = endsInGoal, ["count"] = sorted.Count,
            ["firstSeen"] = sorted.Count > 0 ? sorted.First(i => i.At > 0 || true).At : null,
            ["lastSeen"] = sorted.Count > 0 ? sorted[^1].At : null,
            ["examples"] = new JsonArray(PickExamples(sorted, examples, cat).Select(e => (JsonNode)new JsonObject { ["text"] = e.Text, ["at"] = e.At, ["source"] = e.Source }).ToArray()),
            ["byWeek"] = WeekCounts(sorted),
        };
    }

    /// <summary>Real examples a newcomer can learn from: the most TYPICAL phrasings of the category (the
    /// ones that match the most of its rules), medium length, no profanity, distinct, scrubbed, in time order.</summary>
    public static IReadOnlyList<Item> PickExamples(IReadOnlyList<Item> sorted, int take = ExamplesPerCategory, CategoryDef? cat = null)
    {
        static string Clip(string s) => s.Length <= 360 ? s : s[..357].TrimEnd() + "…";
        int Score(Item i)
        {
            var t = Normalize(i.Text);
            var hits = cat is null ? 0 : cat.Compiled.Count(r => { try { return r.IsMatch(t); } catch (RegexMatchTimeoutException) { return false; } });
            var len = t.Length;
            return hits * 10 + (len >= 60 && len <= 300 ? 5 : len >= 25 ? 2 : 0) - (Profanity.IsMatch(t) ? 100 : 0) - (len < 25 ? 50 : 0);
        }
        var seen = new HashSet<string>(StringComparer.Ordinal);
        var picked = new List<Item>();
        foreach (var cand in sorted.Select((i, idx) => (i, idx)).OrderByDescending(x => Score(x.i)).ThenBy(x => x.idx).Select(x => x.i))
        {
            var key = Normalize(cand.Text);
            if (!seen.Add(key)) continue;
            picked.Add(cand with { Text = Clip(Scrub(key)) });
            if (picked.Count == take) break;
        }
        return picked.OrderBy(i => i.At).ToList();
    }

    public static string WeekKey(long atMs)
    {
        var d = DateTimeOffset.FromUnixTimeMilliseconds(atMs).UtcDateTime;
        return $"{ISOWeek.GetYear(d)}-W{ISOWeek.GetWeekOfYear(d):00}";
    }

    private static JsonObject WeekCounts(IEnumerable<Item> items)
    {
        var o = new JsonObject();
        foreach (var g in items.Where(i => i.At > 0).GroupBy(i => WeekKey(i.At)).OrderBy(g => g.Key)) o[g.Key] = g.Count();
        return o;
    }

    /// <summary>Requests per ISO week from the first to the last, empty weeks included.</summary>
    public static JsonArray Timeline(IReadOnlyList<Item> items)
    {
        var dated = items.Where(i => i.At > 0).ToList();
        var arr = new JsonArray();
        if (dated.Count == 0) return arr;
        var counts = dated.GroupBy(i => WeekKey(i.At)).ToDictionary(g => g.Key, g => g.Count());
        var first = DateTimeOffset.FromUnixTimeMilliseconds(dated.Min(i => i.At)).UtcDateTime.Date;
        var last = DateTimeOffset.FromUnixTimeMilliseconds(dated.Max(i => i.At)).UtcDateTime.Date;
        var cursor = ISOWeek.ToDateTime(ISOWeek.GetYear(first), ISOWeek.GetWeekOfYear(first), DayOfWeek.Monday);
        while (cursor <= last)
        {
            var key = $"{ISOWeek.GetYear(cursor)}-W{ISOWeek.GetWeekOfYear(cursor):00}";
            arr.Add(new JsonObject { ["week"] = key, ["count"] = counts.GetValueOrDefault(key) });
            cursor = cursor.AddDays(7);
        }
        return arr;
    }
}
