using ClaudeWeb.Models;

namespace ClaudeWeb.Services.Repositories;

/// <summary>
/// SSRF guard for the Local-tab proxy target (plans/serving-model-clarity.md,
/// slice 4). The Local proxy (<see cref="ClaudeWeb.Controllers.LocalProxyController"/>)
/// forwards arbitrary methods, headers and body to <c>127.0.0.1:&lt;LocalPort&gt;</c>
/// behind the login — so a port pointed at a sensitive loopback service (SSH,
/// SMB, a database, …) turns the authenticated proxy into an SSRF into the host,
/// and a port pointed back at the harness or preview port makes it proxy itself.
///
/// We don't hard-block (an operator may legitimately run a dev server on an
/// unusual port): <see cref="Reason"/> flags a guarded port with a human reason,
/// and the controller refuses it unless the caller explicitly confirms.
/// </summary>
public static class LocalPortGuard
{
    // Well-known sensitive services that should never be a web product behind the
    // proxy. Keyed by port -> service name (for the confirmation message).
    private static readonly IReadOnlyDictionary<int, string> Sensitive = new Dictionary<int, string>
    {
        [22] = "SSH", [23] = "Telnet", [25] = "SMTP", [110] = "POP3", [135] = "Windows RPC",
        [137] = "NetBIOS", [138] = "NetBIOS", [139] = "NetBIOS/SMB", [445] = "SMB",
        [1433] = "SQL Server", [1521] = "Oracle", [3306] = "MySQL", [3389] = "RDP",
        [5432] = "PostgreSQL", [5984] = "CouchDB", [6379] = "Redis", [9200] = "Elasticsearch",
        [11211] = "memcached", [27017] = "MongoDB",
    };

    /// <summary>
    /// A human-readable reason if <paramref name="port"/> is risky to proxy, else
    /// null. The harness/preview ports come from <paramref name="cfg"/> so the
    /// guard tracks the actual deployment, not a hardcoded 5099/5200.
    /// </summary>
    public static string? Reason(int port, AppConfig cfg)
    {
        if (port == cfg.Port) return $"the harness's own server port ({port}) — proxying it would loop the harness into itself";
        if (port == cfg.PreviewPort) return $"the App-tab preview port ({port})";
        if (Sensitive.TryGetValue(port, out var svc)) return $"a well-known {svc} port ({port}), not a web product";
        return null;
    }
}
