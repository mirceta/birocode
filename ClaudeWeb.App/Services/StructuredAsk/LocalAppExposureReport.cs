using System.ComponentModel;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace ClaudeWeb.Services.StructuredAsk;

/// <summary>
/// One repository's discovered local-app exposures. The same
/// [JsonPropertyName] + [Description] attributes drive BOTH deserialization and the
/// JSON skeleton rendered into the prompt (via OutputFormatRenderer) -- single source
/// of truth. See openspec/changes/discover-local-apps/design.md (D5).
/// </summary>
public class LocalAppExposureReport
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
    };

    /// <summary>
    /// Deserialize and validate. An empty <c>apps</c> list is valid ("none found").
    /// Each finding must have a non-empty name and folder and a port in 1..65535;
    /// anything else throws <see cref="JsonException"/> so the runner's retry loop
    /// can feed the error back to the agent.
    /// </summary>
    public static LocalAppExposureReport Parse(string json)
    {
        var report = JsonSerializer.Deserialize<LocalAppExposureReport>(json, Options)
            ?? throw new JsonException("Deserialized to null");

        report.Apps ??= new List<LocalAppFinding>();

        foreach (var app in report.Apps)
        {
            if (string.IsNullOrWhiteSpace(app.Name))
                throw new JsonException("each app must have a non-empty name");
            if (string.IsNullOrWhiteSpace(app.Folder))
                throw new JsonException($"app '{app.Name}' must have a non-empty folder");
            if (app.Port < 1 || app.Port > 65535)
                throw new JsonException($"app '{app.Name}' has an out-of-range port: {app.Port} (must be 1..65535)");
        }

        return report;
    }

    [JsonPropertyName("apps")]
    [Description("Every directory in this repository that exposes itself as a local app. Empty array if none.")]
    public List<LocalAppFinding> Apps { get; set; } = new();
}

public class LocalAppFinding
{
    [JsonPropertyName("name")]
    [Description("Name of the app; its directory name is a good default.")]
    public string Name { get; set; } = "";

    [JsonPropertyName("port")]
    [Description("The fixed loopback port this app listens on.")]
    public int Port { get; set; }

    [JsonPropertyName("folder")]
    [Description("Repo-relative folder the app lives in, e.g. homepage")]
    public string Folder { get; set; } = "";

    [JsonPropertyName("evidence")]
    [Description("file:line where the port is bound, e.g. homepage/serve.mjs:22")]
    public string Evidence { get; set; } = "";

    [JsonPropertyName("startCommand")]
    [Description("Command that launches this app, run from its folder, e.g. node serve.mjs or powershell -File serve.ps1. Empty string if it cannot be determined.")]
    public string StartCommand { get; set; } = "";
}
