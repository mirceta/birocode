using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ClaudeWeb.Services.StructuredAsk;

/// <summary>
/// Targeted build-command backfill ask (openspec local-app-lifecycle-controls, D6):
/// existing caches predate <c>buildCommand</c>, and upgrading them should not cost a
/// full re-discovery. This ask ENUMERATES the cached findings that lack a build
/// command (name, folder, port, start command) and asks the agent to inspect those
/// folders only — no rediscovery, so it is fast and structurally cannot invent new
/// apps: the validating parse rejects any port outside the enumerated set.
///
/// Same machinery as <see cref="LocalAppDiscoveryAsk"/>: typed report with
/// [JsonPropertyName]+[Description] driving both the rendered output schema and the
/// parse, sent through the reused ClaudeMonitor gateway under the read-only tool
/// policy, with the runner's extract → validate → bounded-retry loop.
/// </summary>
public class LocalAppBuildCommandAsk
{
    private readonly StructuredAskRunner _runner;

    public LocalAppBuildCommandAsk(StructuredAskRunner runner) => _runner = runner;

    /// <summary>
    /// Determine build commands for the given cached findings (the ones missing one).
    /// The parse only accepts ports from <paramref name="findings"/>.
    /// </summary>
    public Task<StructuredAskResult<BuildCommandReport>> BackfillAsync(
        string workingDirectory, IReadOnlyList<LocalAppFinding> findings, CancellationToken ct = default)
    {
        var allowed = findings.Select(f => f.Port).ToHashSet();
        return _runner.RunAsync(
            BuildPrompt(findings),
            json => BuildCommandReport.Parse(json, allowed),
            workingDirectory, ct);
    }

    public static string BuildPrompt(IReadOnlyList<LocalAppFinding> findings)
    {
        var rows = string.Join("\n", findings.Select(f =>
            $"  - name: {f.Name} | folder: {f.Folder} | port: {f.Port}" +
            (string.IsNullOrWhiteSpace(f.StartCommand) ? "" : $" | startCommand: {f.StartCommand}")));
        return Prompt
            .Replace("{{FINDINGS}}", rows)
            .Replace("{{OUTPUT_FORMAT}}", OutputFormatRenderer.Render(typeof(BuildCommandReport)));
    }

    private const string Prompt = @"
This repository contains the following already-discovered **local apps** (self-serving
HTTP servers the Claude Web harness runs). For each one we know where it lives and how
to START it, but not how to BUILD it:

{{FINDINGS}}

For EACH of these apps — and ONLY these apps, identified by their port — inspect its
folder and determine its buildCommand: the command that builds the app's servable
artifacts, meant to be run from the app's folder. Typical signals: a package.json
with a `build` script (-> `npm run build`), a bundler config, a documented build step
in a README. Many local apps are build-less static folders served as-is: for those,
report an empty string. Use an empty string too if you genuinely cannot determine a
build command. Do NOT guess, and do NOT invent apps or ports that are not listed above.

Report one entry per listed app (its port plus the build command you determined).

### Output format

Respond with ONLY valid JSON in this exact structure:

{{OUTPUT_FORMAT}}
";
}

/// <summary>
/// The backfill ask's typed output: one entry per enumerated app. Attributes drive
/// the rendered schema AND the deserialization — single source of truth, same as
/// <see cref="LocalAppExposureReport"/>.
/// </summary>
public class BuildCommandReport
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    /// <summary>
    /// Deserialize and validate against the enumerated set: every entry's port must
    /// be one of <paramref name="allowedPorts"/> (the ask cannot invent apps), and an
    /// empty <c>buildCommand</c> is valid ("build-less or undeterminable"). Throws
    /// <see cref="JsonException"/> so the runner's retry loop feeds the error back.
    /// </summary>
    public static BuildCommandReport Parse(string json, IReadOnlySet<int> allowedPorts)
    {
        var report = JsonSerializer.Deserialize<BuildCommandReport>(json, Options)
            ?? throw new JsonException("Deserialized to null");

        report.Apps ??= new List<BuildCommandFinding>();

        foreach (var app in report.Apps)
        {
            if (!allowedPorts.Contains(app.Port))
                throw new JsonException(
                    $"port {app.Port} was not in the requested set ({string.Join(", ", allowedPorts)}) — report only the listed apps");
        }

        return report;
    }

    [JsonPropertyName("apps")]
    [Description("One entry per listed app. Do not add apps that were not listed.")]
    public List<BuildCommandFinding> Apps { get; set; } = new();
}

public class BuildCommandFinding
{
    [JsonPropertyName("port")]
    [Description("The listed app's port — must be one of the ports given above.")]
    public int Port { get; set; }

    [JsonPropertyName("buildCommand")]
    [Description("Command that builds this app's servable artifacts, run from its folder, e.g. npm run build. Empty string if the app needs no build step or it cannot be determined.")]
    public string BuildCommand { get; set; } = "";
}
