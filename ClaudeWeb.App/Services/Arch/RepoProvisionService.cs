using System.Diagnostics;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;
using ClaudeWeb.Services.Dock;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The receiving side of repo-agent provisioning (openspec provision-repo-agent): on ONE
/// request — from this harness's operator, or from a fleet arch through the peer API —
/// bring a brand-new repo agent up on THIS machine: clone the repository as a sibling of
/// the checkouts already registered here, register it as a project, open its dock (the
/// repo agent), and put it in this machine's arch scope. The GitHub repository itself
/// stays the human's step; everything after it is this one call.
///
/// Idempotent: a checkout that already exists for the same remote, a registration, a
/// dock or a scope entry that is already there is REUSED and reported as such, never
/// duplicated. Refusals are named: <c>bad-url</c> (incl. credentials embedded in the URL
/// — never cloned, the machine's own git credential setup is the only way in),
/// <c>folder-conflict</c> (the folder holds a different repo, or files), <c>disk-full</c>,
/// <c>auth-missing</c>, <c>url-unreachable</c>, <c>not-found</c>, <c>clone-failed</c>.
/// </summary>
public sealed class RepoProvisionService
{
    public const string StatusProvisioned = "provisioned";
    public const string StatusExists = "exists";
    public const string StatusBadUrl = "bad-url";
    public const string StatusFolderConflict = "folder-conflict";
    public const string StatusDiskFull = "disk-full";
    public const string StatusAuthMissing = "auth-missing";
    public const string StatusUnreachable = "url-unreachable";
    public const string StatusNotFound = "not-found";
    public const string StatusCloneFailed = "clone-failed";

    /// <summary>Free space below this on the target drive is refused before cloning.</summary>
    public const long MinFreeBytes = 200L * 1024 * 1024;
    private static readonly TimeSpan CloneTimeout = TimeSpan.FromMinutes(10);

    public sealed record Step(
        [property: JsonPropertyName("step")] string Name,
        [property: JsonPropertyName("status")] string Status,   // done | reused
        [property: JsonPropertyName("detail")] string Detail);

    /// <summary>What the call did, for the caller's report and for the hub's scope add.</summary>
    public sealed record Result(
        [property: JsonPropertyName("repoId")] string RepoId,
        [property: JsonPropertyName("handle")] string Handle,
        [property: JsonPropertyName("name")] string Name,
        [property: JsonPropertyName("path")] string Path,
        [property: JsonPropertyName("remoteUrl")] string RemoteUrl,
        [property: JsonPropertyName("branch")] string Branch,
        [property: JsonPropertyName("provider")] string Provider,
        [property: JsonPropertyName("tabId")] string TabId,
        [property: JsonPropertyName("requestedBy")] string RequestedBy,
        [property: JsonPropertyName("steps")] IReadOnlyList<Step> Steps)
    {
        /// <summary>True when nothing had to be created — every step was reused.</summary>
        public bool AllReused => Steps.All(s => s.Status == "reused");
    }

    private readonly RepositoryRegistry _repos;
    private readonly DockRegistry _dock;
    private readonly ArchStateStore _state;
    private readonly Logger _logger;
    private readonly object _gate = new();

    public RepoProvisionService(RepositoryRegistry repos, DockRegistry dock, ArchStateStore state, Logger logger)
    {
        _repos = repos;
        _dock = dock;
        _state = state;
        _logger = logger;
    }

    /// <summary>The whole provisioning, one call. One at a time per harness (a second
    /// concurrent call waits — clones are serialized, not duplicated).</summary>
    public ArchAgentService.ToolOutcome Provision(string requestedBy, string? url, string? name, string? parentFolder, string? defaultBranch)
    {
        var cleanUrl = (url ?? "").Trim();
        if (ValidateUrl(cleanUrl) is { } bad)
            return new ArchAgentService.ToolOutcome(false, StatusBadUrl, bad + "; nothing was done");
        var folderName = SafeFolderName(string.IsNullOrWhiteSpace(name) ? NameFromUrl(cleanUrl) : name!);
        if (folderName.Length == 0)
            return new ArchAgentService.ToolOutcome(false, StatusBadUrl, "could not derive a folder name from the URL; pass name");
        var branch = string.IsNullOrWhiteSpace(defaultBranch) ? null : defaultBranch.Trim();

        lock (_gate)
        {
            var repos = _repos.GetAll();
            string parent;
            if (!string.IsNullOrWhiteSpace(parentFolder))
            {
                parent = System.IO.Path.TrimEndingDirectorySeparator(System.IO.Path.GetFullPath(parentFolder.Trim()));
                if (!Directory.Exists(parent))
                    return new ArchAgentService.ToolOutcome(false, "error", $"parentFolder does not exist: {parent}; nothing was done");
            }
            else
            {
                var sibling = SiblingParent(repos.Select(r => r.Path), repos.FirstOrDefault(r => r.IsSelf)?.Path);
                if (sibling is null)
                    return new ArchAgentService.ToolOutcome(false, "error", "no registered checkout to be a sibling of (no self repo); pass parentFolder");
                parent = sibling;
            }
            var path = System.IO.Path.Combine(parent, folderName);
            var steps = new List<Step>();

            // 1. the checkout --------------------------------------------------------------
            var kind = ClassifyFolder(path, cleanUrl, out var originThere);
            switch (kind)
            {
                case FolderKind.SameRepo:
                    steps.Add(new Step("clone", "reused", $"{path} is already a checkout of {Display(cleanUrl)}"));
                    break;
                case FolderKind.DifferentRepo:
                    return new ArchAgentService.ToolOutcome(false, StatusFolderConflict,
                        $"{path} exists and is a checkout of {Display(originThere ?? "an unknown remote")}, not {Display(cleanUrl)}; pick another name or parentFolder (nothing was changed)");
                case FolderKind.NotARepo:
                    return new ArchAgentService.ToolOutcome(false, StatusFolderConflict,
                        $"{path} exists, is not a git checkout and is not empty; pick another name or parentFolder (nothing was changed)");
                case FolderKind.Missing:
                case FolderKind.Empty:
                    if (FreeBytes(parent) is { } free && free < MinFreeBytes)
                        return new ArchAgentService.ToolOutcome(false, StatusDiskFull,
                            $"only {free / (1024 * 1024)} MB free on the drive of {parent}; not cloning (nothing was changed)");
                    var clone = Clone(cleanUrl, path, branch);
                    if (clone is { } failed)
                    {
                        if (kind == FolderKind.Missing) TryRemoveEmptyDir(path);
                        return failed;
                    }
                    steps.Add(new Step("clone", "done", $"cloned {Display(cleanUrl)} into {path}{(branch is null ? "" : $" on {branch}")}"));
                    break;
            }
            var branchNow = CurrentBranch(path) ?? branch ?? "unknown";

            // 2. the project ----------------------------------------------------------------
            var knownIds = repos.Select(r => r.Id).ToHashSet(StringComparer.Ordinal);
            var info = _repos.Add(path, folderName);
            var newRepo = !knownIds.Contains(info.Id);
            var provider = info.Provider;
            if (newRepo)
            {
                // The same engine the other agents on this machine run on (openspec codex-real-run).
                var common = MostCommonProvider(repos.Select(r => r.Provider));
                if (!string.Equals(common, info.Provider, StringComparison.Ordinal) && _repos.SetProvider(info.Id, common))
                    provider = common;
                steps.Add(new Step("project", "done", $"registered \"{info.Name}\" as project {info.Id} (handle {info.Handle}, provider {provider})"));
            }
            else
                steps.Add(new Step("project", "reused", $"\"{info.Name}\" was already registered as {info.Id} (handle {info.Handle})"));

            // 3. the agent (its dock) ----------------------------------------------------------
            var tab = _dock.GetAll().FirstOrDefault(t => string.Equals(t.RepoId, info.Id, StringComparison.Ordinal));
            if (tab is null)
            {
                tab = _dock.Add(info.Id, info.Name);
                steps.Add(new Step("agent", "done", $"opened its dock ({tab.Id}); the agent is unstarted until its first prompt"));
            }
            else
                steps.Add(new Step("agent", "reused", $"its dock already exists ({tab.Id})"));

            // 4. this machine's arch scope ----------------------------------------------------
            var managed = _state.ManagedRepoIds;
            if (!managed.Contains(info.Id, StringComparer.Ordinal))
            {
                _state.SetManaged(managed.Append(info.Id));
                steps.Add(new Step("scope", "done", "added to this machine's arch scope"));
            }
            else
                steps.Add(new Step("scope", "reused", "already in this machine's arch scope"));

            var result = new Result(info.Id, info.Handle, info.Name, info.Path, cleanUrl, branchNow, provider, tab.Id, requestedBy, steps);
            var status = result.AllReused ? StatusExists : StatusProvisioned;
            var done = steps.Where(s => s.Status == "done").Select(s => s.Name).ToList();
            var detail = result.AllReused
                ? $"{info.Name} ({info.Handle}) already existed here: checkout, project, agent and scope were all in place — reused, nothing duplicated"
                : $"{info.Name} ({info.Handle}) is provisioned on this machine — {string.Join(", ", done)} done{(done.Count < steps.Count ? $", {string.Join(", ", steps.Where(s => s.Status == "reused").Select(s => s.Name))} reused" : "")}; on {branchNow}";
            _logger.Info($"[PROVISION] {requestedBy}: {status} {info.Name} ({info.Id}) at {path} — {string.Join("; ", steps.Select(s => $"{s.Name} {s.Status}"))}");
            return new ArchAgentService.ToolOutcome(true, status, detail, result);
        }
    }

    // ---- pure parts (unit-tested) ----------------------------------------------------------

    private static readonly Regex HttpUrl = new(@"^https?://[^/\s]+/\S+$", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex ScpUrl = new(@"^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+:\S+$", RegexOptions.Compiled);
    private static readonly Regex SshUrl = new(@"^ssh://\S+$", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>Null when the URL may be cloned; else why not. Credentials embedded in an
    /// http(s) URL (<c>https://user:token@host/…</c>) are refused outright: a token in a
    /// remote URL ends up in <c>.git/config</c> in clear text (the SPACEX4 web-flow-autodev
    /// remote did exactly that); the machine's git credential setup is the only way in.</summary>
    public static string? ValidateUrl(string? url)
    {
        var u = (url ?? "").Trim();
        if (u.Length == 0) return "url is required (the repository's clone URL)";
        if (u.Any(char.IsWhiteSpace)) return "url must not contain whitespace";
        if (HttpUrl.IsMatch(u))
        {
            var afterScheme = u[(u.IndexOf("://", StringComparison.Ordinal) + 3)..];
            var host = afterScheme[..afterScheme.IndexOf('/')];
            if (host.Contains('@'))
                return "the URL embeds credentials (user:token@host); refused — tokens must never live in a remote URL. Use the plain URL and the machine's git credential setup";
            return null;
        }
        if (ScpUrl.IsMatch(u) || SshUrl.IsMatch(u)) return null;
        if (u.StartsWith("file://", StringComparison.OrdinalIgnoreCase) || Path.IsPathRooted(u))
            return "local paths are not provisioned; give the repository's https or ssh clone URL";
        return "not a clone URL (expected https://host/org/repo(.git) or git@host:org/repo.git)";
    }

    /// <summary>The last path segment without <c>.git</c>: "https://github.com/o/My-Repo.git" → "My-Repo".</summary>
    public static string NameFromUrl(string? url)
    {
        var u = (url ?? "").Trim().TrimEnd('/');
        if (u.EndsWith(".git", StringComparison.OrdinalIgnoreCase)) u = u[..^4];
        var cut = Math.Max(u.LastIndexOf('/'), u.LastIndexOf(':'));
        return cut >= 0 ? u[(cut + 1)..] : u;
    }

    private static readonly Regex BadFolderChars = new(@"[<>:""/\\|?*\x00-\x1f]+", RegexOptions.Compiled);

    /// <summary>A folder name a Windows file system accepts; empty when nothing usable remains.</summary>
    public static string SafeFolderName(string? name) => BadFolderChars.Replace((name ?? "").Trim(), "-").Trim('.', ' ', '-');

    /// <summary>The folder the other checkouts live in: the parent most registered repos share;
    /// a tie goes to the self repo's parent; null when there is nothing to be a sibling of.</summary>
    public static string? SiblingParent(IEnumerable<string> repoPaths, string? selfPath)
    {
        var parents = repoPaths
            .Where(p => !string.IsNullOrWhiteSpace(p))
            .Select(p => System.IO.Path.GetDirectoryName(System.IO.Path.TrimEndingDirectorySeparator(p)))
            .Where(p => !string.IsNullOrEmpty(p))
            .Select(p => p!)
            .ToList();
        if (parents.Count == 0) return null;
        var selfParent = string.IsNullOrWhiteSpace(selfPath) ? null : System.IO.Path.GetDirectoryName(System.IO.Path.TrimEndingDirectorySeparator(selfPath));
        return parents
            .GroupBy(p => p, StringComparer.OrdinalIgnoreCase)
            .OrderByDescending(g => g.Count())
            .ThenByDescending(g => selfParent is not null && string.Equals(g.Key, selfParent, StringComparison.OrdinalIgnoreCase))
            .First().Key;
    }

    /// <summary>"github.com/org/repo" for any spelling of the same remote (https with or
    /// without .git or a trailing slash, scp-style ssh, ssh://, embedded userinfo).</summary>
    public static string NormalizeRemote(string? url)
    {
        var u = (url ?? "").Trim();
        if (u.Length == 0) return "";
        var scheme = u.IndexOf("://", StringComparison.Ordinal);
        if (scheme >= 0) u = u[(scheme + 3)..];
        else if (ScpUrl.IsMatch(u)) u = u[(u.IndexOf('@') + 1)..].Replace(':', '/');
        var at = u.IndexOf('@');
        var slash = u.IndexOf('/');
        if (at >= 0 && (slash < 0 || at < slash)) u = u[(at + 1)..];
        u = u.TrimEnd('/');
        if (u.EndsWith(".git", StringComparison.OrdinalIgnoreCase)) u = u[..^4];
        return u.ToLowerInvariant();
    }

    public static bool SameRemote(string? a, string? b)
    {
        var na = NormalizeRemote(a);
        return na.Length > 0 && na == NormalizeRemote(b);
    }

    public enum FolderKind { Missing, Empty, SameRepo, DifferentRepo, NotARepo }

    /// <summary>Pure classification of the target folder's state.</summary>
    public static FolderKind ClassifyFolder(bool exists, bool isEmpty, string? originUrl, string wantedUrl)
    {
        if (!exists) return FolderKind.Missing;
        if (originUrl is not null) return SameRemote(originUrl, wantedUrl) ? FolderKind.SameRepo : FolderKind.DifferentRepo;
        return isEmpty ? FolderKind.Empty : FolderKind.NotARepo;
    }

    /// <summary>Which named refusal a failed clone is, read off git's stderr.</summary>
    public static string ClassifyGitFailure(string? stderr)
    {
        var s = stderr ?? "";
        var oic = StringComparison.OrdinalIgnoreCase;
        if (s.Contains("No space left", oic) || s.Contains("not enough space", oic) || s.Contains("disk full", oic) || s.Contains("There is not enough space", oic))
            return StatusDiskFull;
        if (s.Contains("Authentication failed", oic) || s.Contains("could not read Username", oic) || s.Contains("could not read Password", oic)
            || s.Contains("terminal prompts disabled", oic) || s.Contains("Permission denied (publickey", oic) || s.Contains("HTTP 403", oic) || s.Contains("403 Forbidden", oic)
            || s.Contains("Invalid username or", oic))
            return StatusAuthMissing;
        if (s.Contains("Repository not found", oic) || s.Contains("HTTP 404", oic) || s.Contains("does not appear to be a git repository", oic) || s.Contains("remote branch", oic) && s.Contains("not found", oic))
            return StatusNotFound;
        if (s.Contains("Could not resolve host", oic) || s.Contains("unable to access", oic) || s.Contains("Connection refused", oic)
            || s.Contains("timed out", oic) || s.Contains("Connection reset", oic) || s.Contains("Network is unreachable", oic) || s.Contains("ssh: connect to host", oic))
            return StatusUnreachable;
        return StatusCloneFailed;
    }

    /// <summary>The engine most of this machine's agents run on (ties → claude).</summary>
    public static string MostCommonProvider(IEnumerable<string?> providers)
    {
        var groups = providers.Select(Chat.AgentProviders.Normalize).GroupBy(p => p, StringComparer.Ordinal)
            .OrderByDescending(g => g.Count()).ThenBy(g => g.Key == Chat.AgentProviders.Claude ? 0 : 1).ToList();
        return groups.Count == 0 ? Chat.AgentProviders.Claude : groups[0].Key;
    }

    // ---- disk + git ---------------------------------------------------------------------------

    private FolderKind ClassifyFolder(string path, string wantedUrl, out string? origin)
    {
        origin = null;
        if (!Directory.Exists(path)) return FolderKind.Missing;
        var isGit = Directory.Exists(System.IO.Path.Combine(path, ".git")) || File.Exists(System.IO.Path.Combine(path, ".git"));
        if (isGit)
        {
            var r = Git(path, "config", "--get", "remote.origin.url");
            origin = r.Code == 0 ? r.Out.Trim() : "";
        }
        bool empty;
        try { empty = !Directory.EnumerateFileSystemEntries(path).Any(); } catch { empty = false; }
        return ClassifyFolder(true, empty, isGit ? origin : null, wantedUrl);
    }

    private static long? FreeBytes(string folder)
    {
        try { return new DriveInfo(System.IO.Path.GetPathRoot(System.IO.Path.GetFullPath(folder))!).AvailableFreeSpace; }
        catch { return null; }
    }

    private ArchAgentService.ToolOutcome? Clone(string url, string path, string? branch)
    {
        var args = new List<string> { "clone", "--no-tags" };
        if (branch is not null) { args.Add("--branch"); args.Add(branch); }
        args.Add("--");
        args.Add(url);
        args.Add(path);
        var r = Git(null, args.ToArray(), CloneTimeout);
        if (r.Code == 0 && !r.TimedOut) return null;
        var status = r.TimedOut ? StatusUnreachable : ClassifyGitFailure(r.Err);
        var why = r.TimedOut ? $"git clone did not finish within {CloneTimeout.TotalMinutes:0} min" : FirstLine(r.Err);
        var hint = status switch
        {
            StatusAuthMissing => " — this machine's git has no credential for that host (set one up with the git credential manager, or make the repository public); tokens in the URL are refused",
            StatusUnreachable => " — the host did not answer from this machine",
            StatusNotFound => " — no such repository (or no access to it) from this machine",
            StatusDiskFull => " — the drive is full",
            _ => "",
        };
        _logger.Error($"[PROVISION] clone of {Display(url)} into {path} failed ({status}): {why}");
        return new ArchAgentService.ToolOutcome(false, status, $"clone failed: {why}{hint}; nothing was registered");
    }

    private static string? CurrentBranch(string path)
    {
        var r = Git(path, "rev-parse", "--abbrev-ref", "HEAD");
        return r.Code == 0 ? r.Out.Trim() : null;
    }

    private static void TryRemoveEmptyDir(string path)
    {
        try { if (Directory.Exists(path) && !Directory.EnumerateFileSystemEntries(path).Any()) Directory.Delete(path); } catch { /* best effort */ }
    }

    /// <summary>A URL as shown in replies and logs: any userinfo stripped, so a token can
    /// never be echoed even if one slipped past validation.</summary>
    public static string Display(string url) => Regex.Replace(url, @"^(\w+://)[^/@]+@", "$1");

    private static string FirstLine(string s) => (s ?? "").Split('\n').Select(l => l.Trim()).FirstOrDefault(l => l.Length > 0 && !l.StartsWith("Cloning into", StringComparison.Ordinal)) ?? "";

    private sealed record Run(int Code, string Out, string Err, bool TimedOut);

    private static Run Git(string? cwd, params string[] args) => Git(cwd, args, TimeSpan.FromSeconds(30));

    private static Run Git(string? cwd, string[] args, TimeSpan timeout)
    {
        var psi = new ProcessStartInfo("git")
        {
            RedirectStandardOutput = true, RedirectStandardError = true, UseShellExecute = false, CreateNoWindow = true,
        };
        // Never block on a credential prompt: a missing credential is an answer (auth-missing), not a hang.
        psi.Environment["GIT_TERMINAL_PROMPT"] = "0";
        psi.Environment["GCM_INTERACTIVE"] = "never";
        if (cwd is not null) { psi.ArgumentList.Add("-C"); psi.ArgumentList.Add(cwd); }
        foreach (var a in args) psi.ArgumentList.Add(a);
        using var p = Process.Start(psi)!;
        var outTask = p.StandardOutput.ReadToEndAsync();
        var errTask = p.StandardError.ReadToEndAsync();
        if (!p.WaitForExit((int)timeout.TotalMilliseconds))
        {
            try { p.Kill(entireProcessTree: true); } catch { /* best effort */ }
            return new Run(-1, "", "timed out", true);
        }
        return new Run(p.ExitCode, outTask.GetAwaiter().GetResult(), errTask.GetAwaiter().GetResult(), false);
    }
}
