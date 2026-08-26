using System.Text.Json;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Tools;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// Coverage for the per-repo MCP tool registry (openspec add-dock-tools-lane):
/// the masking round-trip (null keeps the stored key, empty clears, new value
/// replaces — for the default key and per-company alike), the env assembly
/// mirroring the reference api-chatbot (single-key vs multi-company), and the
/// injection guards (disabled or missing server entry → no config).
/// </summary>
public sealed class ToolsConfigStoreTests : IDisposable
{
    private readonly string _dir;
    private readonly ToolsConfigStore _store;

    public ToolsConfigStoreTests()
    {
        _dir = Path.Combine(Path.GetTempPath(), "cwtest-tools-" + Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(_dir);
        _store = new ToolsConfigStore(new Logger(), _dir);
    }

    public void Dispose()
    {
        try { Directory.Delete(_dir, recursive: true); } catch { /* best-effort temp cleanup */ }
    }

    // --- masking round-trip --------------------------------------------------

    [Fact]
    public void Null_key_keeps_stored_empty_clears_value_replaces()
    {
        _store.SetBirokrat("r1", enabled: true, apiKey: "secret-1234", apiUrl: null, companies: null);
        Assert.Equal("secret-1234", _store.GetBirokrat("r1").ApiKey);

        // Null = the UI's untouched masked field: keep the stored key.
        _store.SetBirokrat("r1", enabled: false, apiKey: null, apiUrl: "https://x.example/api/", companies: null);
        Assert.Equal("secret-1234", _store.GetBirokrat("r1").ApiKey);

        _store.SetBirokrat("r1", enabled: true, apiKey: "other-9999", apiUrl: null, companies: null);
        Assert.Equal("other-9999", _store.GetBirokrat("r1").ApiKey);

        _store.SetBirokrat("r1", enabled: true, apiKey: "", apiUrl: null, companies: null);
        Assert.Equal("", _store.GetBirokrat("r1").ApiKey);
    }

    [Fact]
    public void Company_with_empty_key_keeps_same_named_stored_key()
    {
        _store.SetBirokrat("r1", true, "def", null, new()
        {
            new BirokratCompany { Name = "ACME", ApiKey = "acme-key-1" },
            new BirokratCompany { Name = "BETA", ApiKey = "beta-key-1", Url = "https://beta.example/" },
        });
        // Re-save with ACME's key untouched (empty), BETA replaced, GAMMA new.
        _store.SetBirokrat("r1", true, null, null, new()
        {
            new BirokratCompany { Name = "ACME", ApiKey = "" },
            new BirokratCompany { Name = "BETA", ApiKey = "beta-key-2" },
            new BirokratCompany { Name = "GAMMA", ApiKey = "gamma-key" },
        });
        var cfg = _store.GetBirokrat("r1");
        Assert.Equal("acme-key-1", cfg.Companies.Single(c => c.Name == "ACME").ApiKey);
        Assert.Equal("beta-key-2", cfg.Companies.Single(c => c.Name == "BETA").ApiKey);
        Assert.Equal("gamma-key", cfg.Companies.Single(c => c.Name == "GAMMA").ApiKey);
    }

    [Fact]
    public void Config_persists_across_store_instances()
    {
        _store.SetBirokrat("r1", true, "persisted-key", "https://custom.example/api/", null);
        var reloaded = new ToolsConfigStore(new Logger(), _dir);
        var cfg = reloaded.GetBirokrat("r1");
        Assert.True(cfg.Enabled);
        Assert.Equal("persisted-key", cfg.ApiKey);
        Assert.Equal("https://custom.example/api/", cfg.ApiUrl);
    }

    [Fact]
    public void Key_hint_reveals_at_most_last_four()
    {
        Assert.Equal("", ToolsConfigStore.KeyHint(""));
        Assert.Equal("····", ToolsConfigStore.KeyHint("ab"));
        Assert.Equal("····6789", ToolsConfigStore.KeyHint("123456789"));
    }

    // --- env assembly (mirrors api-chatbot server.js) ------------------------

    [Fact]
    public void Single_key_env_sets_key_and_url_only()
    {
        var env = ToolsConfigStore.BuildEnv(new BirokratToolConfig { ApiKey = "k1", ApiUrl = "https://u/" });
        Assert.Equal("k1", env["BIROKRAT_API_KEY"]);
        Assert.Equal("https://u/", env["BIROKRAT_API_URL"]);
        Assert.False(env.ContainsKey("BIROKRAT_API_KEYS"));
    }

    [Fact]
    public void Companies_env_adds_json_map_with_first_entry_as_default()
    {
        var env = ToolsConfigStore.BuildEnv(new BirokratToolConfig
        {
            ApiKey = "ignored",
            ApiUrl = "https://default/",
            Companies = new()
            {
                new BirokratCompany { Name = "ACME", ApiKey = "ka", Url = "https://acme/" },
                new BirokratCompany { Name = "BETA", ApiKey = "kb" },
            },
        });
        // First named entry doubles as the default key/URL (server.js:788-801).
        Assert.Equal("ka", env["BIROKRAT_API_KEY"]);
        Assert.Equal("https://acme/", env["BIROKRAT_API_URL"]);

        using var map = JsonDocument.Parse(env["BIROKRAT_API_KEYS"]);
        Assert.Equal("ka", map.RootElement.GetProperty("ACME").GetProperty("apiKey").GetString());
        Assert.Equal("https://acme/", map.RootElement.GetProperty("ACME").GetProperty("url").GetString());
        Assert.Equal("kb", map.RootElement.GetProperty("BETA").GetProperty("apiKey").GetString());
        // Url omitted when unset — the MCP server falls back to BIROKRAT_API_URL.
        Assert.False(map.RootElement.GetProperty("BETA").TryGetProperty("url", out _));
    }

    // --- machine-independent server resolution (sibling checkout) ------------

    private string MakeRepoWithSibling(string layout)
    {
        var repo = Path.Combine(_dir, "some-repo");
        Directory.CreateDirectory(repo);
        var entryDir = Path.Combine(_dir, layout, "mcp-server", "app", "dist");
        Directory.CreateDirectory(entryDir);
        File.WriteAllText(Path.Combine(entryDir, "index.js"), "// stub");
        return repo;
    }

    [Fact]
    public void Resolves_nested_sibling_checkout_relative_to_repo()
    {
        var repo = MakeRepoWithSibling(Path.Combine("birokrat-ai-platform", "birokrat-ai-platform"));
        var entry = _store.ResolveServerEntry(new[] { repo });
        Assert.Equal(Path.Combine(_dir, "birokrat-ai-platform", "birokrat-ai-platform",
            "mcp-server", "app", "dist", "index.js"), entry);
    }

    [Fact]
    public void Resolves_flat_sibling_checkout_relative_to_repo()
    {
        var repo = MakeRepoWithSibling("birokrat-ai-platform");
        var entry = _store.ResolveServerEntry(new[] { repo });
        Assert.Equal(Path.Combine(_dir, "birokrat-ai-platform",
            "mcp-server", "app", "dist", "index.js"), entry);
    }

    [Fact]
    public void No_sibling_resolves_to_empty_never_an_absolute_fallback()
    {
        var repo = Path.Combine(_dir, "lonely-repo");
        Directory.CreateDirectory(repo);
        Assert.Equal("", _store.ResolveServerEntry(new[] { repo }));
        Assert.Equal("", _store.ResolveServerEntry());
    }

    [Fact]
    public void Host_override_beats_the_sibling_probe()
    {
        var repo = MakeRepoWithSibling("birokrat-ai-platform");
        var overrideEntry = Path.Combine(_dir, "elsewhere", "index.js");
        _store.SetHost(overrideEntry);
        Assert.Equal(overrideEntry, _store.ResolveServerEntry(new[] { repo }));
    }

    // --- injection guards ----------------------------------------------------

    [Fact]
    public void Disabled_or_unconfigured_repo_builds_no_config()
    {
        Assert.Null(_store.BuildMcpConfigJson("unknown-repo"));
        _store.SetBirokrat("r1", enabled: false, apiKey: "k", apiUrl: null, companies: null);
        Assert.Null(_store.BuildMcpConfigJson("r1"));
    }

    [Fact]
    public void Enabled_with_missing_server_entry_builds_no_config()
    {
        _store.SetHost(Path.Combine(_dir, "nope", "index.js"));
        _store.SetBirokrat("r1", enabled: true, apiKey: "k", apiUrl: null, companies: null);
        Assert.Null(_store.BuildMcpConfigJson("r1"));
    }

    [Fact]
    public void Enabled_with_existing_entry_builds_mcp_servers_shape()
    {
        var entry = Path.Combine(_dir, "index.js");
        File.WriteAllText(entry, "// stub");
        _store.SetHost(entry);
        _store.SetBirokrat("r1", enabled: true, apiKey: "k1", apiUrl: null, companies: null);

        var json = _store.BuildMcpConfigJson("r1");
        Assert.NotNull(json);
        using var doc = JsonDocument.Parse(json!);
        var birokrat = doc.RootElement.GetProperty("mcpServers").GetProperty("birokrat");
        Assert.Equal("node", birokrat.GetProperty("command").GetString());
        Assert.Equal(entry.Replace('\\', '/'), birokrat.GetProperty("args")[0].GetString());
        Assert.Equal("k1", birokrat.GetProperty("env").GetProperty("BIROKRAT_API_KEY").GetString());
        Assert.Equal(ToolsConfigStore.DefaultApiUrl, birokrat.GetProperty("env").GetProperty("BIROKRAT_API_URL").GetString());
    }
}
