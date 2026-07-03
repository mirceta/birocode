using System.Text.Json;
using System.Text.Json.Serialization;
using ClaudeWeb.Services.StructuredAsk;

namespace ClaudeWeb.DiscoveryEval;

/// <summary>One ground-truth app in a fixture's expected.json (identity = folder+port).</summary>
public sealed class ExpectedApp
{
    [JsonPropertyName("folder")] public string Folder { get; set; } = "";
    [JsonPropertyName("port")] public int Port { get; set; }
    [JsonPropertyName("note")] public string? Note { get; set; }

    public static List<ExpectedApp> LoadFile(string path)
    {
        var apps = JsonSerializer.Deserialize<List<ExpectedApp>>(
                File.ReadAllText(path),
                new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
            ?? throw new InvalidDataException($"{path}: deserialized to null");
        foreach (var a in apps)
        {
            if (string.IsNullOrWhiteSpace(a.Folder))
                throw new InvalidDataException($"{path}: expected app with empty folder");
            if (a.Port is < 1 or > 65535)
                throw new InvalidDataException($"{path}: '{a.Folder}' has out-of-range port {a.Port}");
        }
        return apps;
    }
}

/// <summary>Normalized folder+port identity used to match discovered ↔ expected.</summary>
public readonly record struct AppKey(string Folder, int Port)
{
    public static AppKey Of(string folder, int port) => new(NormalizeFolder(folder), port);

    /// <summary>Case-, slash- and dot-prefix-insensitive repo-relative folder.</summary>
    public static string NormalizeFolder(string folder)
    {
        var f = folder.Replace('\\', '/').Trim();
        while (f.StartsWith("./")) f = f[2..];
        return f.Trim('/').ToLowerInvariant();
    }

    public override string ToString() => $"{Folder}:{Port}";
}

/// <summary>Score of one discovery run against one fixture's ground truth.
/// Human-readable via <see cref="Render"/>, machine-comparable as plain data.</summary>
public sealed record ScoreResult(
    double Recall,
    double Precision,
    IReadOnlyList<string> Matched,
    IReadOnlyList<string> Missing,   // expected, not found
    IReadOnlyList<string> Extra)     // found, not expected
{
    public bool Perfect => Recall >= 1.0 && Precision >= 1.0;

    public string Render() =>
        $"recall {Recall:0.00}  precision {Precision:0.00}" +
        (Missing.Count > 0 ? $"  missing: [{string.Join(", ", Missing)}]" : "") +
        (Extra.Count > 0 ? $"  extra: [{string.Join(", ", Extra)}]" : "") +
        (Perfect ? "  ✓ perfect" : "");
}

public static class Scorer
{
    /// <summary>Compare discovered findings to the expected apps on folder+port.
    /// Empty expected → recall 1; empty found → precision 1 (nothing wrongly reported).</summary>
    public static ScoreResult Score(IEnumerable<LocalAppFinding> found, IEnumerable<ExpectedApp> expected)
    {
        var expectedKeys = expected.Select(e => AppKey.Of(e.Folder, e.Port)).ToHashSet();
        var foundKeys = found.Select(f => AppKey.Of(f.Folder, f.Port)).ToHashSet();

        var matched = expectedKeys.Intersect(foundKeys).OrderBy(k => k.ToString()).ToList();
        var missing = expectedKeys.Except(foundKeys).OrderBy(k => k.ToString()).ToList();
        var extra = foundKeys.Except(expectedKeys).OrderBy(k => k.ToString()).ToList();

        var recall = expectedKeys.Count == 0 ? 1.0 : (double)matched.Count / expectedKeys.Count;
        var precision = foundKeys.Count == 0 ? 1.0 : (double)matched.Count / foundKeys.Count;

        return new ScoreResult(
            recall, precision,
            matched.Select(k => k.ToString()).ToList(),
            missing.Select(k => k.ToString()).ToList(),
            extra.Select(k => k.ToString()).ToList());
    }
}
