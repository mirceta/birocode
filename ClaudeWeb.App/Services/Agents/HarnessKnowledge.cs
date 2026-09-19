using System.Reflection;
using System.Text;
using System.Text.RegularExpressions;

namespace ClaudeWeb.Services.Agents;

/// <summary>
/// What the harness knows about ITSELF, for the <c>harness_help</c> tool (openspec
/// repo-agent-harness-tools). The knowledge is never typed in here: it is the convention docs
/// of the harness's own checkout — <c>docs/*.md</c> of the repo the registry marks self — read
/// on every call, so a doc edited on main is the answer on the next call; the same files as
/// embedded in the build (csproj <c>EmbeddedResource ..\docs\*.md</c>) are the fallback when
/// that checkout is not on disk, and every answer says which one it read. The index is the
/// docs' structure: a topic per file (its <c>#</c> heading, its first paragraph), a sub-topic
/// per <c>##</c> section. Adding a doc adds a topic. Pure over a set of (name, text) pairs so
/// the tests feed it a folder of their own.
/// </summary>
public sealed class HarnessKnowledge
{
    public const string DocsFolder = "docs";
    public const string SourceLive = "live";
    public const string SourceEmbedded = "embedded";
    public const int MaxTextChars = 24_000;

    /// <summary>One <c>##</c> section of a doc: its slug, heading and text (heading included).</summary>
    public sealed record Section(string Slug, string Heading, string Text);

    /// <summary>One doc as a topic: id = file name without .md, title = its first heading.</summary>
    public sealed record Topic(string Id, string Title, string Summary, string File, string Text, IReadOnlyList<Section> Sections);

    public sealed record Index(string Source, string? Folder, IReadOnlyList<Topic> Topics);

    /// <summary>What a lookup or search returns: the topic, the section when one was meant, the text to show.</summary>
    public sealed record Answer(Topic Topic, Section? Section, string Text);

    private readonly Func<string?> _selfRepoPath;

    /// <param name="selfRepoPath">the harness's own checkout (the self repo's path), or null when unknown</param>
    public HarnessKnowledge(Func<string?> selfRepoPath)
    {
        _selfRepoPath = selfRepoPath;
    }

    /// <summary>The current index: the live docs folder when the self checkout is on disk and has
    /// docs, else the embedded copy.</summary>
    public Index Load()
    {
        var root = _selfRepoPath();
        if (!string.IsNullOrWhiteSpace(root))
        {
            var folder = Path.Combine(root, DocsFolder);
            if (Directory.Exists(folder))
            {
                var files = Directory.GetFiles(folder, "*.md").OrderBy(f => f, StringComparer.OrdinalIgnoreCase).ToList();
                if (files.Count > 0)
                {
                    var docs = new List<(string, string)>();
                    foreach (var f in files)
                    {
                        try { docs.Add((Path.GetFileName(f), File.ReadAllText(f))); }
                        catch { /* unreadable: skip that one */ }
                    }
                    if (docs.Count > 0) return new Index(SourceLive, folder, Build(docs));
                }
            }
        }
        return new Index(SourceEmbedded, null, Build(EmbeddedDocs()));
    }

    /// <summary>The docs embedded in the assembly (name → text).</summary>
    public static IReadOnlyList<(string Name, string Text)> EmbeddedDocs()
    {
        var asm = Assembly.GetExecutingAssembly();
        var list = new List<(string, string)>();
        foreach (var res in asm.GetManifestResourceNames().Where(n => n.EndsWith(".md", StringComparison.OrdinalIgnoreCase)).OrderBy(n => n, StringComparer.OrdinalIgnoreCase))
        {
            using var s = asm.GetManifestResourceStream(res);
            if (s is null) continue;
            using var r = new StreamReader(s, Encoding.UTF8);
            // LogicalName "docs.<file>.md" (csproj): the file name is the tail after the docs marker.
            var name = res;
            var i = name.IndexOf("docs.", StringComparison.OrdinalIgnoreCase);
            if (i >= 0) name = name[(i + "docs.".Length)..];
            list.Add((name, r.ReadToEnd()));
        }
        return list;
    }

    // ---- pure -------------------------------------------------------------------------------

    private static readonly Regex H1 = new(@"^#\s+(.+?)\s*$", RegexOptions.Multiline | RegexOptions.Compiled);
    private static readonly Regex H2 = new(@"^##\s+(.+?)\s*$", RegexOptions.Multiline | RegexOptions.Compiled);
    private static readonly Regex WordRx = new(@"[\p{L}\p{N}][\p{L}\p{N}\-]{1,}", RegexOptions.Compiled);

    /// <summary>Build the index from (file name, text) pairs.</summary>
    public static IReadOnlyList<Topic> Build(IEnumerable<(string Name, string Text)> docs)
    {
        var topics = new List<Topic>();
        foreach (var (name, raw) in docs)
        {
            var text = raw.Replace("\r\n", "\n");
            var id = Path.GetFileNameWithoutExtension(name);
            var title = H1.Match(text) is { Success: true } m ? m.Groups[1].Value.Trim() : id;
            topics.Add(new Topic(id, title, FirstParagraph(text), name, text, SplitSections(text)));
        }
        return topics;
    }

    /// <summary>The first paragraph after the title that is prose (not a heading, not a quote).</summary>
    public static string FirstParagraph(string text)
    {
        var paras = text.Replace("\r\n", "\n").Split("\n\n", StringSplitOptions.RemoveEmptyEntries);
        foreach (var p in paras)
        {
            var t = p.Trim();
            if (t.Length == 0 || t.StartsWith('#') || t.StartsWith('>') || t.StartsWith("```")) continue;
            var one = Regex.Replace(t, @"\s+", " ");
            return one.Length > 300 ? one[..300].TrimEnd() + "…" : one;
        }
        return "";
    }

    /// <summary>The <c>##</c> sections of a doc, each with its heading line and body up to the next <c>##</c>.</summary>
    public static IReadOnlyList<Section> SplitSections(string text)
    {
        var list = new List<Section>();
        var ms = H2.Matches(text);
        for (var i = 0; i < ms.Count; i++)
        {
            var start = ms[i].Index;
            var end = i + 1 < ms.Count ? ms[i + 1].Index : text.Length;
            var heading = ms[i].Groups[1].Value.Trim();
            list.Add(new Section(Slug(heading), heading, text[start..end].TrimEnd() + "\n"));
        }
        return list;
    }

    /// <summary>"The four-line contract" → "the-four-line-contract".</summary>
    public static string Slug(string heading)
    {
        var s = Regex.Replace(heading.ToLowerInvariant(), @"[`*_]", "");
        s = Regex.Replace(s, @"[^\p{L}\p{N}]+", "-").Trim('-');
        return s.Length > 60 ? s[..60].TrimEnd('-') : s;
    }

    /// <summary>A topic by id ("understanding-app-convention"), optionally a section
    /// ("understanding-app-convention#the-four-line-contract"). Ids are matched loosely: exact,
    /// then a unique prefix / contains, then the "-convention" suffix dropped.</summary>
    public static Answer? Lookup(IReadOnlyList<Topic> topics, string topic)
    {
        var q = topic.Trim();
        if (q.Length == 0) return null;
        string? sectionQ = null;
        var hash = q.IndexOf('#');
        if (hash >= 0) { sectionQ = q[(hash + 1)..].Trim(); q = q[..hash].Trim(); }
        var key = Slug(q);
        var t = topics.FirstOrDefault(x => x.Id.Equals(key, StringComparison.OrdinalIgnoreCase))
            ?? topics.FirstOrDefault(x => x.Id.Equals(key + "-convention", StringComparison.OrdinalIgnoreCase))
            ?? Unique(topics.Where(x => x.Id.StartsWith(key, StringComparison.OrdinalIgnoreCase)))
            ?? Unique(topics.Where(x => x.Id.Contains(key, StringComparison.OrdinalIgnoreCase) || Slug(x.Title).Contains(key, StringComparison.OrdinalIgnoreCase)));
        if (t is null) return null;
        if (string.IsNullOrWhiteSpace(sectionQ)) return new Answer(t, null, Cap(t.Text));
        var sk = Slug(sectionQ);
        var s = t.Sections.FirstOrDefault(x => x.Slug.Equals(sk, StringComparison.OrdinalIgnoreCase))
            ?? Unique(t.Sections.Where(x => x.Slug.Contains(sk, StringComparison.OrdinalIgnoreCase)));
        return s is null ? new Answer(t, null, Cap(t.Text)) : new Answer(t, s, s.Text);
    }

    private static T? Unique<T>(IEnumerable<T> xs) where T : class { var l = xs.Take(2).ToList(); return l.Count == 1 ? l[0] : null; }

    /// <summary>The best topic or section for a question, by word overlap: id and title words
    /// weigh most, section headings next, body text least. Null when no word matches.</summary>
    public static Answer? Search(IReadOnlyList<Topic> topics, string query)
    {
        var words = Words(query);
        if (words.Count == 0) return null;
        Answer? best = null;
        var bestScore = 0.0;
        foreach (var t in topics)
        {
            var idWords = Words(t.Id + " " + t.Title);
            var bodyWords = Words(t.Text);
            var topicScore = words.Sum(w => (idWords.Contains(w) ? 5.0 : 0) + (bodyWords.Contains(w) ? 1.0 : 0));
            if (topicScore > bestScore) { bestScore = topicScore; best = new Answer(t, null, Cap(t.Text)); }
            foreach (var s in t.Sections)
            {
                var hw = Words(s.Heading);
                var sw = Words(s.Text);
                var score = words.Sum(w => (idWords.Contains(w) ? 5.0 : 0) + (hw.Contains(w) ? 3.0 : 0) + (sw.Contains(w) ? 1.0 : 0));
                // A section wins over its doc only when the question names the section itself.
                if (score > bestScore && words.Any(hw.Contains)) { bestScore = score; best = new Answer(t, s, s.Text); }
            }
        }
        return best;
    }

    private static readonly HashSet<string> Stop = new(StringComparer.OrdinalIgnoreCase)
    { "how", "do", "i", "the", "a", "an", "to", "in", "on", "of", "and", "or", "is", "it", "my", "this", "that", "what", "with", "for", "can", "does", "use", "using", "app", "harness", "does", "should", "want" };

    private static HashSet<string> Words(string text)
    {
        var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (Match m in WordRx.Matches(text))
        {
            var w = m.Value.ToLowerInvariant();
            if (Stop.Contains(w)) continue;
            set.Add(w);
            // "understanding-app" also matches "understanding" and "app" in a question.
            foreach (var part in w.Split('-', StringSplitOptions.RemoveEmptyEntries)) if (!Stop.Contains(part) && part.Length > 2) set.Add(part);
            if (w.EndsWith('s') && w.Length > 3) set.Add(w[..^1]);
        }
        return set;
    }

    private static string Cap(string text) => text.Length <= MaxTextChars ? text : text[..MaxTextChars] + "\n… (truncated; ask for a section)";
}
