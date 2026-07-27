using System;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Routing;

namespace ClaudeWeb.Services.Traffic;

/// <summary>
/// Counts every request the harness serves (openspec change traffic-monitor).
/// Registered as the OUTERMOST middleware — before even the IP filter — so the
/// numbers are true wire volume: static assets, rejected requests, and the
/// localview proxy legs all count, not just controller responses.
///
/// Attribution: after the pipeline runs, the matched endpoint's route template
/// is the bucket key (so /api/repos/A/events and /api/repos/B/events share one
/// bucket). Traffic that never matches an endpoint (static files, proxy,
/// SPA fallback) falls back to a normalized path prefix — see BucketKey.
/// Never throws past the traffic recording: measurement must not break serving.
/// </summary>
public class TrafficMiddleware
{
    private readonly RequestDelegate _next;

    public TrafficMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context, TrafficStats stats)
    {
        var original = context.Response.Body;
        var counter = new CountingStream(original);
        context.Response.Body = counter;
        try
        {
            await _next(context);
        }
        finally
        {
            context.Response.Body = original;
            try
            {
                stats.Record(
                    BucketKey(context),
                    context.Request.ContentLength ?? 0,
                    counter.BytesWritten);
            }
            catch
            {
                // Monitoring must never take down the response path.
            }
        }
    }

    private static string BucketKey(HttpContext context)
    {
        var method = context.Request.Method;

        // Controllers: the route template already collapses IDs.
        if (context.GetEndpoint() is RouteEndpoint re
            && !string.IsNullOrEmpty(re.RoutePattern.RawText)
            && re.RoutePattern.RawText != "{*path:regex(^(?!api/).*$)}")
            return $"{method} {re.RoutePattern.RawText}";

        var path = context.Request.Path.Value ?? "/";
        var segs = path.Split('/', StringSplitOptions.RemoveEmptyEntries);
        if (segs.Length == 0) return $"{method} /";

        // Known fat prefixes first, so the whole proxy/asset family is one bucket.
        if (segs.Length >= 2 && segs[0] == "api" && segs[1] == "localview")
            return $"{method} api/localview/*";
        if (segs[0] == "assets")
            return $"{method} assets/*";

        // Generic fallback: first two segments, ID-looking parts collapsed.
        var one = Normalize(segs[0]);
        if (segs.Length == 1) return $"{method} {one}";
        return $"{method} {one}/{(segs.Length > 2 ? Normalize(segs[1]) + "/*" : Normalize(segs[1]))}";
    }

    // Collapse path segments that look like identifiers (digits, GUIDs, hashes)
    // so per-resource URLs can't multiply buckets.
    private static string Normalize(string seg)
    {
        if (seg.Length > 24) return "*"; // GUIDs and hashes exceed this
        if (seg.All(char.IsDigit)) return "*";
        return seg;
    }
}
