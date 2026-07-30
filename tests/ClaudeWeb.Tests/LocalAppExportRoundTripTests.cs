using ClaudeWeb.Services.StructuredAsk;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// Pins the export/import contract (openspec local-apps-cache-export-import):
/// the panel's Export builds { "apps": [ { name, port, folder, evidence,
/// startCommand } ] } client-side from an explicit field whitelist, and that
/// exact shape must keep parsing via <see cref="LocalAppExposureReport.ParseImport"/>
/// so JSON copied on one machine imports on another without editing.
/// </summary>
public sealed class LocalAppExportRoundTripTests
{
    [Fact]
    public void Client_shaped_export_parses_via_ParseImport()
    {
        // Pretty-printed exactly as the panel emits it (JSON.stringify(..., null, 2));
        // the second finding has no startCommand — the export omits the key when
        // the value is absent, and import must treat that as "".
        var payload = """
        {
          "apps": [
            {
              "name": "homepage",
              "port": 5210,
              "folder": "homepage",
              "evidence": "homepage/serve.mjs:22",
              "startCommand": "node serve.mjs"
            },
            {
              "name": "docs",
              "port": 5300,
              "folder": "docs-site",
              "evidence": "docs-site/server.js:10"
            }
          ]
        }
        """;

        var report = LocalAppExposureReport.ParseImport(payload);

        Assert.Equal(new[] { 5210, 5300 }, report.Apps.Select(a => a.Port).ToArray());
        Assert.Equal("node serve.mjs", report.Apps[0].StartCommand);
        Assert.Equal("", report.Apps[1].StartCommand);
    }

    [Fact]
    public void Empty_export_is_a_valid_import()
    {
        // Export with an empty cache produces { "apps": [] } — a legal no-op import.
        var report = LocalAppExposureReport.ParseImport("{\n  \"apps\": []\n}");
        Assert.Empty(report.Apps);
    }
}
