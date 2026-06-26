using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using ClaudeWeb.Controllers;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Auth;
using ClaudeWeb.Services.Hosting;
using ClaudeWeb.Services.IpFilter;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Http;

namespace ClaudeWeb.Services.Audit;

/// <summary>
/// Action audit (openspec add-action-audit). Append-only, operator-only record of what every
/// gate-passed user does — the accountability counterweight to removing the per-project
/// permission system: we no longer *restrict* a trusted user, so we *record* them.
///
/// Three event kinds:
///   - "prompt": a chat turn (actor, repo, lane, the prompt text)
///   - "tool":   a mutating tool action the agent ran (Edit/Write/Bash/WebFetch…); reads are
///               skipped unless AuditLogReads
///   - "auth":   login, device mint, IP approval, device/guest revocation
///
/// Stored one JSON object per line in %APPDATA%\ClaudeWeb\audit\YYYY-MM-DD.jsonl (daily rotation),
/// pruned whole-file by age (AuditRetentionDays). NEVER mutated or read through any web endpoint —
/// the only reader is the desktop "Activity" tab. Thread-safe singleton, pre-built in Program.cs so
/// the WinForms GUI and the API share one instance (same pattern as IpAllowlistService).
/// </summary>
public class AuditService
{
    // Tools that only read — skipped by default so the log stays high-signal. Anything NOT in this
    // set (mutations + unknown/new tools) is logged, a safe default.
    private static readonly HashSet<string> ReadOnlyTools = new(StringComparer.OrdinalIgnoreCase)
    { "Read", "Glob", "Grep", "LS", "NotebookRead", "TodoWrite", "Task" };

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };

    private readonly Logger _logger;
    private readonly IpAllowlistService _ipAllowlist;
    private readonly DeviceTokenService _devices;
    private readonly string _dir;
    private readonly bool _logReads;
    private readonly bool _redactPrompts;
    private readonly int _retentionDays;
    private readonly object _gate = new();

    public AuditService(AppConfig config, Logger logger, IpAllowlistService ipAllowlist, DeviceTokenService devices)
    {
        _logger = logger;
        _ipAllowlist = ipAllowlist;
        _devices = devices;
        _logReads = config.AuditLogReads;
        _redactPrompts = config.AuditRedactPromptText;
        _retentionDays = config.AuditRetentionDays;
        _dir = Path.Combine(AppPaths.DataDir, "audit");
        try { Directory.CreateDirectory(_dir); } catch { }
        PruneOld();
    }

    // --- identity -------------------------------------------------------------

    /// <summary>Resolves the best-available actor for a request: trusted-device name, else
    /// approved-IP guest name, with the source IP and a short session correlator always set.</summary>
    public AuditActor ResolveActor(HttpContext ctx)
    {
        var ip = ClientIp.Get(ctx);
        var device = _devices.ValidateAndSlide(ctx.Request.Cookies[DeviceTokenService.CookieName], ip);
        var guest = _ipAllowlist.GuestName(ip);
        var sessionCookie = ctx.Request.Cookies[AuthController.CookieName];
        var session = string.IsNullOrEmpty(sessionCookie) ? null : ShortId(sessionCookie);
        return new AuditActor(device, guest, ip, session);
    }

    // --- logging --------------------------------------------------------------

    public void LogPrompt(AuditActor actor, string? repo, string? lane, string? text)
    {
        var entry = NewEntry("prompt", actor, repo);
        entry.Lane = lane;
        entry.Text = _redactPrompts ? "(redacted)" : text;
        Append(entry);
    }

    /// <summary>Records a tool action. Read-only tools are skipped unless AuditLogReads is on.</summary>
    public void LogTool(AuditContext audit, string tool, string? args)
    {
        if (!_logReads && ReadOnlyTools.Contains(tool)) return;
        var entry = NewEntry("tool", audit.Actor, audit.Repo);
        entry.Lane = audit.Lane;
        entry.Tool = tool;
        entry.Args = Trim(args, 600);
        Append(entry);
    }

    /// <summary>Auth event tied to a request (login, device mint).</summary>
    public void LogAuth(AuditActor actor, string evt, string? detail = null)
    {
        var entry = NewEntry("auth", actor, null);
        entry.Event = evt;
        entry.Args = detail;
        Append(entry);
    }

    /// <summary>Auth event with no request behind it — an Operator action at the desktop GUI
    /// (approve IP, revoke device/guest). Actor is recorded as the operator.</summary>
    public void LogOperatorAuth(string evt, string? detail = null)
    {
        var entry = NewEntry("auth", AuditActor.Operator, null);
        entry.Event = evt;
        entry.Args = detail;
        Append(entry);
    }

    private static AuditEntry NewEntry(string kind, AuditActor actor, string? repo) => new()
    {
        Ts = DateTime.UtcNow,
        Kind = kind,
        Actor = actor.Display,
        Device = actor.Device,
        Guest = actor.Guest,
        Ip = actor.Ip,
        Session = actor.Session,
        Repo = repo,
    };

    private void Append(AuditEntry entry)
    {
        var line = JsonSerializer.Serialize(entry, JsonOpts);
        var path = Path.Combine(_dir, $"{entry.Ts:yyyy-MM-dd}.jsonl");
        lock (_gate)
        {
            try { File.AppendAllText(path, line + "\n"); }
            catch (Exception ex) { _logger.Error($"[AUDIT] Failed to append {path}: {ex.Message}"); }
        }
    }

    // --- read-back (desktop Activity tab only) --------------------------------

    /// <summary>The dates (newest first) that have an audit file.</summary>
    public List<DateOnly> AvailableDates()
    {
        lock (_gate)
        {
            if (!Directory.Exists(_dir)) return new();
            return Directory.GetFiles(_dir, "*.jsonl")
                .Select(f => Path.GetFileNameWithoutExtension(f))
                .Select(n => DateOnly.TryParse(n, out var d) ? d : (DateOnly?)null)
                .Where(d => d.HasValue).Select(d => d!.Value)
                .OrderByDescending(d => d).ToList();
        }
    }

    /// <summary>All entries for a day, newest first. Bad lines are skipped, not fatal.</summary>
    public List<AuditEntry> ReadDay(DateOnly day)
    {
        var path = Path.Combine(_dir, $"{day:yyyy-MM-dd}.jsonl");
        var result = new List<AuditEntry>();
        lock (_gate)
        {
            if (!File.Exists(path)) return result;
            foreach (var line in File.ReadAllLines(path))
            {
                if (string.IsNullOrWhiteSpace(line)) continue;
                try
                {
                    var e = JsonSerializer.Deserialize<AuditEntry>(line, JsonOpts);
                    if (e != null) result.Add(e);
                }
                catch { /* skip a corrupt line */ }
            }
        }
        result.Reverse(); // file is append-order (oldest first) -> newest first
        return result;
    }

    // --- retention ------------------------------------------------------------

    private void PruneOld()
    {
        if (_retentionDays <= 0) return;
        var cutoff = DateOnly.FromDateTime(DateTime.UtcNow).AddDays(-_retentionDays);
        lock (_gate)
        {
            try
            {
                foreach (var f in Directory.GetFiles(_dir, "*.jsonl"))
                {
                    var name = Path.GetFileNameWithoutExtension(f);
                    if (DateOnly.TryParse(name, out var d) && d < cutoff)
                        File.Delete(f);
                }
            }
            catch (Exception ex) { _logger.Error($"[AUDIT] Prune failed: {ex.Message}"); }
        }
    }

    private static string ShortId(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant()[..8];

    private static string? Trim(string? s, int max) =>
        s is { Length: > 0 } && s.Length > max ? s[..max] + "…" : s;

    /// <summary>True for tools that should be logged (mutations + unknown), given the config.</summary>
    public bool ShouldLogTool(string tool) => _logReads || !ReadOnlyTools.Contains(tool);
}
