using ClaudeWeb.Models;
using Microsoft.AspNetCore.Http;

namespace ClaudeWeb.Services.Repositories;

/// <summary>
/// Resolves which repository the current request targets. Per-client selection:
/// the frontend sends the chosen repo id in the <c>X-Repo-Id</c> header (with a
/// <c>?repo=</c> query fallback), so two devices can work in different repos at
/// once. An unknown/missing id falls back to the registry default so older
/// clients (and probes) still resolve to something sensible.
///
/// Scoped (one per request) because it reads the current HttpContext.
/// </summary>
public class RepositoryResolver
{
    public const string HeaderName = "X-Repo-Id";
    public const string QueryName = "repo";

    private readonly IHttpContextAccessor _http;
    private readonly RepositoryRegistry _registry;

    public RepositoryResolver(IHttpContextAccessor http, RepositoryRegistry registry)
    {
        _http = http;
        _registry = registry;
    }

    /// <summary>The repo id supplied by the client this request (may be null).</summary>
    public string? RequestedId()
    {
        var ctx = _http.HttpContext;
        if (ctx is null) return null;

        if (ctx.Request.Headers.TryGetValue(HeaderName, out var header))
        {
            var value = header.ToString();
            if (!string.IsNullOrWhiteSpace(value)) return value;
        }

        if (ctx.Request.Query.TryGetValue(QueryName, out var q))
        {
            var value = q.ToString();
            if (!string.IsNullOrWhiteSpace(value)) return value;
        }

        return null;
    }

    /// <summary>
    /// The repository this request targets: the client's id if it maps to a
    /// known repo, otherwise the registry default. Null only when no repository
    /// has been configured at all.
    /// </summary>
    public RepositoryConfig? Current()
    {
        var requested = RequestedId();
        return _registry.TryGet(requested) ?? _registry.Default();
    }
}
