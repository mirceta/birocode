using System.Text;
using System.Text.RegularExpressions;

namespace ClaudeWeb.Services;

/// <summary>
/// Short, stable, human-readable handles (openspec stable-handles): the words an
/// operator and the arch agent use for a repo agent or an idea in chat, instead of
/// a 32-char id or a name that repeats.
///
/// - A repo's handle is a slug of its name, with <c>#2</c>, <c>#3</c>… when the slug
///   already exists on that machine ("prg", "prg#2"). Assigned once (persisted in the
///   registry) and never changed afterwards, so a rename or a removal cannot shift it.
///   Presented as <c>&lt;machine&gt;/&lt;handle&gt;</c> ("spacex/prg#2").
/// - An idea's handle is its running number, <c>#12</c>, allocated on creation.
///
/// Everything here is pure; the stores call in with their lists.
/// </summary>
public static class Handles
{
    private static readonly Regex NonSlug = new("[^a-z0-9]+", RegexOptions.Compiled);

    /// <summary>"Claude Web (this app)" → "claude-web-this-app"; empty → "repo".</summary>
    public static string Slug(string? name)
    {
        var s = NonSlug.Replace((name ?? "").Trim().ToLowerInvariant(), "-").Trim('-');
        if (s.Length > 40) s = s[..40].TrimEnd('-');
        return s.Length == 0 ? "repo" : s;
    }

    /// <summary>Assign handles to the entries that lack one, keeping every existing
    /// handle untouched: the first bearer of a slug gets the bare slug, later ones
    /// <c>slug#2</c>, <c>slug#3</c>… (the first free suffix). Deterministic in list
    /// order, so a backfill on two boxes with the same list agrees.</summary>
    public static Dictionary<string, string> AssignRepoHandles(IEnumerable<(string Id, string Name, string? Existing)> entries)
    {
        var list = entries.ToList();
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var e in list.Where(e => !string.IsNullOrWhiteSpace(e.Existing)))
        {
            result[e.Id] = e.Existing!;
            used.Add(e.Existing!);
        }
        foreach (var e in list.Where(e => string.IsNullOrWhiteSpace(e.Existing)))
        {
            var slug = Slug(e.Name);
            var handle = slug;
            for (var k = 2; used.Contains(handle); k++) handle = $"{slug}#{k}";
            result[e.Id] = handle;
            used.Add(handle);
        }
        return result;
    }

    /// <summary>The label shown everywhere: "&lt;machine&gt;/&lt;handle&gt;".</summary>
    public static string AgentLabel(string machine, string handle) => $"{machine}/{handle}";

    /// <summary>Split an agent reference typed by a person or an agent: "spacex/prg#2"
    /// → (spacex, prg#2); "prg#2" → (null, prg#2); a raw id → (null, id).</summary>
    public static (string? Machine, string Repo) ParseAgentRef(string reference)
    {
        var r = reference.Trim();
        var slash = r.IndexOf('/');
        if (slash <= 0 || slash == r.Length - 1) return (null, r);
        return (r[..slash].Trim(), r[(slash + 1)..].Trim());
    }

    /// <summary>Resolve a repo reference against candidates (id + handle): an exact id
    /// wins, else a case-insensitive handle match, else the name when unique. Returns
    /// the id, or null with a reason.</summary>
    public static (string? Id, string? Error) ResolveRepoRef(string reference, IReadOnlyList<(string Id, string Handle, string Name)> candidates, string machineLabel)
    {
        var r = reference.Trim();
        var byId = candidates.FirstOrDefault(c => string.Equals(c.Id, r, StringComparison.Ordinal));
        if (byId.Id is not null) return (byId.Id, null);
        var byHandle = candidates.Where(c => string.Equals(c.Handle, r, StringComparison.OrdinalIgnoreCase)).ToList();
        if (byHandle.Count == 1) return (byHandle[0].Id, null);
        var byName = candidates.Where(c => string.Equals(c.Name, r, StringComparison.OrdinalIgnoreCase)).ToList();
        if (byName.Count == 1) return (byName[0].Id, null);
        if (byName.Count > 1)
            return (null, $"\"{r}\" names {byName.Count} repos on {machineLabel}; use a handle: {string.Join(", ", byName.Select(c => AgentLabel(machineLabel, c.Handle)))}");
        var known = candidates.Select(c => AgentLabel(machineLabel, c.Handle)).Take(12).ToList();
        return (null, $"no repo \"{r}\" on {machineLabel}{(known.Count > 0 ? $"; known: {string.Join(", ", known)}{(candidates.Count > 12 ? ", …" : "")}" : "")}");
    }

    /// <summary>"#12" or "12" → 12; anything else → null (treat as an id).</summary>
    public static int? ParseIdeaRef(string? reference)
    {
        if (string.IsNullOrWhiteSpace(reference)) return null;
        var r = reference.Trim().TrimStart('#');
        return int.TryParse(r, out var n) && n > 0 && r.Length <= 9 ? n : null;
    }

    public static string IdeaHandle(int number) => number > 0 ? $"#{number}" : "";

    /// <summary>Human-readable summary of an idea for tool output and logs.</summary>
    public static string Brief(string text, int max = 60)
    {
        var t = (text ?? "").Replace('\n', ' ').Trim();
        if (t.Length <= max) return t;
        var sb = new StringBuilder(t[..max].TrimEnd());
        return sb.Append('…').ToString();
    }
}
