using ClaudeWeb.Services.Chat;
using ClaudeWeb.Services.Git;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Snapshot/restore endpoints (M3). Auto-discovered by AddControllers().
///   POST /api/save             -- git add -A + commit
///   GET  /api/history          -- git log (last 50)
///   POST /api/history/restore  -- git checkout &lt;hash&gt; -- .
///   GET  /api/git/status       -- read-only working-tree status (plans/git-tab.md)
/// </summary>
[ApiController]
[Route("api")]
public class GitController : ControllerBase
{
    private readonly GitService _git;
    private readonly RepositoryResolver _repos;
    private readonly RunSessionService _runs;
    private readonly Logger _logger;

    public GitController(GitService git, RepositoryResolver repos, RunSessionService runs, Logger logger)
    {
        _git = git;
        _repos = repos;
        _runs = runs;
        _logger = logger;
    }

    public sealed record SaveRequest(string? Message);
    public sealed record RestoreRequest(string? Hash);

    /// <summary>POST /api/save -- stage everything and commit.</summary>
    [HttpPost("save")]
    public IActionResult Save([FromBody] SaveRequest? body)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        try
        {
            var result = _git.Save(repo.Path, body?.Message);
            if (result.NoChanges)
                return Ok(new { noChanges = true });

            return Ok(new { hash = result.Hash, message = result.Message });
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] Save failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>GET /api/branch -- current git branch name.</summary>
    [HttpGet("branch")]
    public IActionResult Branch()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        try
        {
            var branch = _git.CurrentBranch(repo.Path);
            return Ok(new { branch });
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] Branch failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>GET /api/git/status?fetch=true -- read-only branch + working-tree state,
    /// optionally fetching origin first (plans/git-origin-sync.md).</summary>
    [HttpGet("git/status")]
    public IActionResult Status([FromQuery] bool fetch = false)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        try
        {
            var s = _git.Status(repo.Path, fetch);
            return Ok(new
            {
                branch = s.Branch,
                upstream = s.Upstream,
                ahead = s.Ahead,
                behind = s.Behind,
                fetched = s.Fetched,
                fetchError = s.FetchError,
                baseBranch = s.BaseBranch,
                baseAhead = s.BaseAhead,
                baseBehind = s.BaseBehind,
                localBaseBranch = s.LocalBaseBranch,
                originBaseBranch = s.OriginBaseBranch,
                originBaseAhead = s.OriginBaseAhead,
                originBaseBehind = s.OriginBaseBehind,
                baseDriftAhead = s.BaseDriftAhead,
                baseDriftBehind = s.BaseDriftBehind,
                fetchedAt = s.FetchedAt,
                // A chat run mutating this repo right now: git actions are
                // rejected (and greyed out) while true (plans/git-actions.md).
                busy = _runs.IsBusy(repo.Id),
                files = s.Files.Select(f => new
                {
                    path = f.Path,
                    index = f.Index,
                    worktree = f.Worktree,
                    untracked = f.Untracked,
                    conflicted = f.Conflicted,
                }),
            });
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] Status failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>POST /api/git/pull-base -- fast-forward local main/master from
    /// origin (plans/agents-git-sync.md; the one UI-triggered git mutation).</summary>
    [HttpPost("git/pull-base")]
    public IActionResult PullBase()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        try
        {
            var r = _git.PullBase(repo.Path);
            return Ok(new { baseBranch = r.BaseBranch, ok = r.Ok, updated = r.Updated, error = r.Error });
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] PullBase failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>GET /api/git/branches -- read-only overview of the OTHER local
    /// branches (plans/git-branches.md), newest commit first.</summary>
    [HttpGet("git/branches")]
    public IActionResult Branches()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        try
        {
            var branches = _git.ListBranches(repo.Path).Select(b => new
            {
                name = b.Name,
                subject = b.Subject,
                committedAt = b.CommittedAt,
                baseAhead = b.BaseAhead,
                baseBehind = b.BaseBehind,
                originBaseAhead = b.OriginBaseAhead,
                originBaseBehind = b.OriginBaseBehind,
                hasUpstream = b.HasUpstream,
                upstreamAhead = b.UpstreamAhead,
                upstreamBehind = b.UpstreamBehind,
            });
            return Ok(branches);
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] Branches failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>POST /api/git/merge-base -- merge LOCAL main/master into the
    /// current branch (plans/git-actions.md). Clean tree required; conflicts
    /// auto-abort server-side. 409 while a chat run is active in the repo.</summary>
    [HttpPost("git/merge-base")]
    public IActionResult MergeBase()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        if (_runs.IsBusy(repo.Id))
            return Conflict(new { error = "Claude is working in this project — try again when the run finishes." });
        try
        {
            var r = _git.MergeBase(repo.Path);
            return r.Ok ? Ok(new { updated = r.Updated }) : UnprocessableEntity(new { error = r.Error });
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] MergeBase failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>POST /api/git/pull-current -- `git pull --ff-only` on the
    /// current branch (plans/git-actions.md). 409 while a chat run is active.</summary>
    [HttpPost("git/pull-current")]
    public IActionResult PullCurrent()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        if (_runs.IsBusy(repo.Id))
            return Conflict(new { error = "Claude is working in this project — try again when the run finishes." });
        try
        {
            var r = _git.PullCurrent(repo.Path);
            return r.Ok ? Ok(new { updated = r.Updated }) : UnprocessableEntity(new { error = r.Error });
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] PullCurrent failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>GET /api/git/graph -- recent structured history for the
    /// mermaid graph (plans/git-graph.md). Read-only.</summary>
    [HttpGet("git/graph")]
    public IActionResult Graph()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        try
        {
            var commits = _git.GraphLog(repo.Path).Select(c => new
            {
                hash = c.Hash,
                @short = c.Short,
                parents = c.Parents,
                refs = c.Refs,
                subject = c.Subject,
            });
            var s = _git.Status(repo.Path);
            return Ok(new { branch = s.Branch, baseBranch = s.LocalBaseBranch ?? "main", commits });
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] Graph failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>POST /api/git/push-current -- push the current branch to
    /// origin, publishing with -u when needed (plans/git-branches.md). Plain
    /// push only. 409 while a chat run is active.</summary>
    [HttpPost("git/push-current")]
    public IActionResult PushCurrent()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        if (_runs.IsBusy(repo.Id))
            return Conflict(new { error = "Claude is working in this project — try again when the run finishes." });
        try
        {
            var r = _git.PushCurrent(repo.Path);
            return r.Ok ? Ok(new { updated = r.Updated }) : UnprocessableEntity(new { error = r.Error });
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] PushCurrent failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>GET /api/git/review -- read-only "PR preview" for the current
    /// feature branch (plans/git-pr-preview.md): base, merge-base, the commits
    /// unique to the branch, and the cumulative changed-file list with counts.
    /// On the base branch returns isFeatureBranch:false. No busy guard.</summary>
    [HttpGet("git/review")]
    public IActionResult Review([FromQuery(Name = "base")] string? baseOverride)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        try
        {
            var r = _git.Review(repo.Path, baseOverride);
            return Ok(new
            {
                isFeatureBranch = r.IsFeatureBranch,
                @base = r.Base,
                baseRef = r.BaseRef,
                mergeBase = r.MergeBase,
                truncated = r.Truncated,
                commits = r.Commits.Select(c => new
                {
                    @short = c.Short,
                    author = c.Author,
                    date = c.Date,
                    subject = c.Subject,
                }),
                files = r.Files.Select(f => new
                {
                    path = f.Path,
                    oldPath = f.OldPath,
                    added = f.Added,
                    deleted = f.Deleted,
                    binary = f.Binary,
                    status = f.Status,
                }),
            });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] Review failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>GET /api/git/review/bases -- candidate base branches for the
    /// review picker (local heads + origin/*) with the auto-detected default
    /// flagged. Read-only.</summary>
    [HttpGet("git/review/bases")]
    public IActionResult ReviewBases()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        try
        {
            var r = _git.ListReviewBases(repo.Path);
            return Ok(new
            {
                @default = r.Default,
                bases = r.Bases.Select(b => new { @ref = b.Ref, kind = b.Kind }),
            });
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] ReviewBases failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>GET /api/git/review/file?path=... -- the unified patch for ONE
    /// file of the branch review (plans/git-pr-preview.md), fetched lazily on
    /// expand. Bounded; truncated:true marks a cut. Read-only.</summary>
    [HttpGet("git/review/file")]
    public IActionResult ReviewFile([FromQuery] string? path, [FromQuery(Name = "base")] string? baseOverride)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        if (string.IsNullOrWhiteSpace(path)) return BadRequest(new { error = "path is required" });
        try
        {
            var r = _git.ReviewFileDiff(repo.Path, path, baseOverride);
            return Ok(new { path = r.Path, patch = r.Patch, truncated = r.Truncated });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] ReviewFile failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>GET /api/history -- recent commits, newest first.</summary>
    [HttpGet("history")]
    public IActionResult History()
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        try
        {
            var entries = _git.History(repo.Path)
                .Select(e => new { hash = e.Hash, date = e.Date, message = e.Message });
            return Ok(entries);
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] History failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }

    /// <summary>POST /api/history/restore -- restore files to a commit (HEAD unchanged).</summary>
    [HttpPost("history/restore")]
    public IActionResult Restore([FromBody] RestoreRequest? body)
    {
        _logger.CountRequest();
        var repo = _repos.Current();
        if (repo is null) return BadRequest(new { error = "No repository selected or configured." });
        try
        {
            var hash = _git.Restore(repo.Path, body?.Hash);
            return Ok(new { restored = true, hash });
        }
        catch (ArgumentException ex)
        {
            _logger.Error($"[GIT] Restore rejected: {ex.Message}");
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception ex)
        {
            _logger.Error($"[GIT] Restore failed: {ex.Message}");
            return StatusCode(500, new { error = ex.Message });
        }
    }
}
