using System.Text.Json;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec registry-store-resilience: the repo registry must never seed over, or persist
/// over, a store it could not read — the way 14 repos were lost on 2026-10-21 — and every save must
/// leave the previous store beside it as .bak.</summary>
public class RepositoryRegistryStoreTests : IDisposable
{
    private readonly string _dir = Path.Combine(Path.GetTempPath(), "cw-regstore-" + Guid.NewGuid().ToString("N")[..8]);
    private readonly string _work;
    private readonly string _repoA;
    private readonly Logger _logger = new();

    public RepositoryRegistryStoreTests()
    {
        Directory.CreateDirectory(_dir);
        _work = Directory.CreateDirectory(Path.Combine(_dir, "workspace")).FullName;
        _repoA = Directory.CreateDirectory(Path.Combine(_dir, "repo-a")).FullName;
    }

    public void Dispose() { try { Directory.Delete(_dir, true); } catch { /* best effort */ } }

    private string Store => Path.Combine(_dir, "repositories.json");
    private RepositoryRegistry New() => new(new AppConfig { WorkingDirectory = _work }, _logger, _dir);
    private static string Good(params (string id, string name, string path)[] repos) =>
        JsonSerializer.Serialize(repos.Select(r => new RepositoryConfig { Id = r.id, Name = r.name, Path = r.path }).ToList());

    [Fact]
    public void No_store_at_all_seeds_from_the_working_directory_as_before()
    {
        var reg = New();
        Assert.False(reg.ReadOnly);
        Assert.Single(reg.GetAll());
        Assert.Equal("workspace", reg.GetAll()[0].Name);
        Assert.True(File.Exists(Store));
    }

    [Fact]
    public void A_store_that_exists_but_cannot_be_parsed_is_never_seeded_over_and_never_persisted_over()
    {
        File.WriteAllText(Store, "{ this is not a list");
        var before = File.ReadAllText(Store);
        var reg = New();
        Assert.True(reg.ReadOnly);
        Assert.Empty(reg.GetAll());                         // nothing seeded
        Assert.Equal(before, File.ReadAllText(Store));      // nothing written at load
        reg.EnsureSelfRepo(_repoA, "Self");                 // the boot-time save that clobbered the real store
        reg.Add(_repoA, "a");
        Assert.Equal(before, File.ReadAllText(Store));      // still untouched: read-only until restart
        Assert.False(File.Exists(reg.BackupPath));
    }

    [Fact]
    public void A_blank_store_is_a_truncated_write_not_an_empty_roster()
    {
        File.WriteAllText(Store, "   ");
        var reg = New();
        Assert.True(reg.ReadOnly);
        Assert.Empty(reg.GetAll());
        Assert.Equal("   ", File.ReadAllText(Store));
    }

    [Fact]
    public void An_unreadable_store_with_a_good_backup_loads_the_backup_and_the_next_save_restores_the_store()
    {
        var reg0 = New();
        File.WriteAllText(reg0.BackupPath, Good(("id-a", "a", _repoA), ("id-b", "b", _work)));
        File.WriteAllText(Store, "garbage");
        var reg = New();
        Assert.False(reg.ReadOnly);
        Assert.Equal(new[] { "a", "b" }, reg.GetAll().Select(r => r.Name).ToArray());
        reg.Rename("id-a", "a2");                            // any save
        var restored = JsonSerializer.Deserialize<List<RepositoryConfig>>(File.ReadAllText(Store))!;
        Assert.Equal(new[] { "a2", "b" }, restored.Select(r => r.Name).ToArray());
    }

    [Fact]
    public void Every_save_keeps_the_previous_store_as_bak()
    {
        File.WriteAllText(Store, Good(("id-a", "a", _repoA)));
        var reg = New();
        var before = File.ReadAllText(Store);               // after the handle backfill's save
        reg.Rename("id-a", "renamed");
        Assert.True(File.Exists(reg.BackupPath));
        Assert.Equal(before, File.ReadAllText(reg.BackupPath));
        Assert.Contains("renamed", File.ReadAllText(Store));
        Assert.False(File.Exists(Store + ".tmp"));
    }

    [Fact]
    public void A_good_store_loads_as_before()
    {
        File.WriteAllText(Store, Good(("id-a", "a", _repoA), ("id-b", "b", _work)));
        var reg = New();
        Assert.False(reg.ReadOnly);
        Assert.Equal(2, reg.GetAll().Count);
    }
}
