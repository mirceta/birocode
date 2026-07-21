using System.Diagnostics;
using ClaudeWeb.Services.Git;
using ClaudeWeb.Services.Logging;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>
/// Coverage for the commit-identity writer (openspec add-commit-identity-write):
/// <see cref="GitService.SetCommitIdentity"/> against a throwaway <c>git init</c> repo.
/// These are the first automated tests in the repo. Each test owns an isolated temp
/// repo; the global-scope test also isolates <c>GIT_CONFIG_GLOBAL</c> so the developer's
/// real <c>~/.gitconfig</c> is never touched. Tests in one class run sequentially, so the
/// process-wide env swap in the global test cannot race the others.
/// </summary>
public sealed class CommitIdentityWriteTests
{
    private static GitService NewService() => new(new Logger());

    // A temp directory with `git init` run in it; deleted on Dispose.
    private sealed class TempRepo : IDisposable
    {
        public string Path { get; }

        public TempRepo()
        {
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "cwtest-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Path);
            Run("init");
            // A committer identity read walks up to the global config; the local-scope
            // tests assert scope flips to "local", which holds regardless of the global.
        }

        public string Config(string args)
        {
            var (_, stdout, _) = RunRaw("config " + args);
            return stdout.Trim();
        }

        public void Run(string args)
        {
            var (code, _, stderr) = RunRaw(args);
            if (code != 0) throw new InvalidOperationException($"git {args} failed: {stderr}");
        }

        private (int, string, string) RunRaw(string args)
        {
            var psi = new ProcessStartInfo
            {
                FileName = "git",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                WorkingDirectory = Path,
            };
            foreach (var t in args.Split(' ', StringSplitOptions.RemoveEmptyEntries))
                psi.ArgumentList.Add(t);
            using var p = Process.Start(psi)!;
            var o = p.StandardOutput.ReadToEnd();
            var e = p.StandardError.ReadToEnd();
            p.WaitForExit();
            return (p.ExitCode, o, e);
        }

        public void Dispose()
        {
            try
            {
                foreach (var f in Directory.EnumerateFiles(Path, "*", SearchOption.AllDirectories))
                    File.SetAttributes(f, FileAttributes.Normal);
                Directory.Delete(Path, recursive: true);
            }
            catch { /* best-effort temp cleanup */ }
        }
    }

    [Fact]
    public void Write_local_sets_repo_config_and_reports_local_scope()
    {
        using var repo = new TempRepo();
        var svc = NewService();

        var r = svc.SetCommitIdentity(repo.Path, "Ada Lovelace", "ada@example.com", "local");

        Assert.True(r.Ok, r.Error);
        Assert.Equal("Ada Lovelace", r.Name);
        Assert.Equal("ada@example.com", r.Email);
        Assert.Equal("local", r.Scope);
        // And it really landed in the repo's own config.
        Assert.Equal("Ada Lovelace", repo.Config("--local --get user.name"));
        Assert.Equal("ada@example.com", repo.Config("--local --get user.email"));
    }

    [Fact]
    public void Write_name_only_leaves_previous_email()
    {
        using var repo = new TempRepo();
        repo.Run("config --local user.email keep@example.com");
        var svc = NewService();

        var r = svc.SetCommitIdentity(repo.Path, "Grace Hopper", null, "local");

        Assert.True(r.Ok, r.Error);
        Assert.Equal("Grace Hopper", r.Name);
        Assert.Equal("local", r.Scope);
        Assert.Equal("keep@example.com", repo.Config("--local --get user.email"));
    }

    [Fact]
    public void Write_email_only_sets_just_email()
    {
        using var repo = new TempRepo();
        var svc = NewService();

        var r = svc.SetCommitIdentity(repo.Path, null, "only@example.com", "local");

        Assert.True(r.Ok, r.Error);
        Assert.Equal("only@example.com", repo.Config("--local --get user.email"));
        Assert.Equal("", repo.Config("--local --get user.name"));
    }

    [Fact]
    public void Empty_write_is_rejected_and_mutates_nothing()
    {
        using var repo = new TempRepo();
        var svc = NewService();

        var r = svc.SetCommitIdentity(repo.Path, "  ", "", "local");

        Assert.False(r.Ok);
        Assert.NotNull(r.Error);
        Assert.Equal("", repo.Config("--local --get user.name"));
        Assert.Equal("", repo.Config("--local --get user.email"));
    }

    [Fact]
    public void Values_are_trimmed_before_writing()
    {
        using var repo = new TempRepo();
        var svc = NewService();

        var r = svc.SetCommitIdentity(repo.Path, "  Alan Turing  ", "  alan@example.com  ", "local");

        Assert.True(r.Ok, r.Error);
        Assert.Equal("Alan Turing", repo.Config("--local --get user.name"));
        Assert.Equal("alan@example.com", repo.Config("--local --get user.email"));
    }

    [Fact]
    public void Write_global_targets_isolated_global_config()
    {
        using var repo = new TempRepo();
        var globalFile = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "cwtest-global-" + Guid.NewGuid().ToString("N") + ".gitconfig");
        var prev = Environment.GetEnvironmentVariable("GIT_CONFIG_GLOBAL");
        try
        {
            // Redirect git's "global" config to a throwaway file so the real one is safe.
            Environment.SetEnvironmentVariable("GIT_CONFIG_GLOBAL", globalFile);
            var svc = NewService();

            var r = svc.SetCommitIdentity(repo.Path, "Global User", "global@example.com", "global");

            Assert.True(r.Ok, r.Error);
            Assert.Equal("global", r.Scope); // no local override in this fresh repo
            Assert.Contains("Global User", File.ReadAllText(globalFile));
        }
        finally
        {
            Environment.SetEnvironmentVariable("GIT_CONFIG_GLOBAL", prev);
            try { File.Delete(globalFile); } catch { /* best-effort */ }
        }
    }
}
