using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Http;

namespace ClaudeWeb.Services.IpFilter;

/// <summary>
/// Tracks every in-flight request per client IP so removing an IP from the
/// allowlist terminates its live connections IMMEDIATELY
/// (plans/auth-ip-filter.md req. 5). SSE chat streams already iterate on
/// HttpContext.RequestAborted, so aborting the context kills them with no
/// changes to any SSE code. Subscribes to IpAllowlistService.GuestRemoved.
/// </summary>
public class IpConnectionRegistry
{
    private readonly Logger _logger;
    private readonly object _gate = new();
    private readonly Dictionary<string, HashSet<HttpContext>> _live = new();

    public IpConnectionRegistry(IpAllowlistService allowlist, Logger logger)
    {
        _logger = logger;
        allowlist.GuestRemoved += KillAll;
    }

    public IDisposable Track(string ip, HttpContext context)
    {
        lock (_gate)
        {
            if (!_live.TryGetValue(ip, out var set))
                _live[ip] = set = new HashSet<HttpContext>();
            set.Add(context);
        }
        return new Tracking(this, ip, context);
    }

    private void Untrack(string ip, HttpContext context)
    {
        lock (_gate)
        {
            if (_live.TryGetValue(ip, out var set))
            {
                set.Remove(context);
                if (set.Count == 0) _live.Remove(ip);
            }
        }
    }

    private void KillAll(string ip)
    {
        List<HttpContext> victims;
        lock (_gate)
        {
            if (!_live.TryGetValue(ip, out var set)) return;
            victims = set.ToList();
        }
        _logger.Info($"[IPFILTER] Aborting {victims.Count} live connection(s) from {ip}");
        foreach (var ctx in victims)
        {
            try { ctx.Abort(); } catch { /* connection may already be gone */ }
        }
    }

    private sealed class Tracking : IDisposable
    {
        private readonly IpConnectionRegistry _registry;
        private readonly string _ip;
        private readonly HttpContext _context;
        public Tracking(IpConnectionRegistry registry, string ip, HttpContext context)
        { _registry = registry; _ip = ip; _context = context; }
        public void Dispose() => _registry.Untrack(_ip, _context);
    }
}
