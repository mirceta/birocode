using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Http;

namespace ClaudeWeb.Services.Understanding;

/// <summary>
/// Shared no-store static-file serving for the harness-provided, always-on local
/// apps (synthetic <c>kind:harness</c> apps in plans/multiple-local-apps.md) — the
/// Understanding app and the Autopilot dev app. Each app is just a build-less
/// folder of static assets at a repo root; this serves it under relative URLs,
/// contained to the folder (no traversal), with an explicit empty/404 state so a
/// broken/absent app is visibly broken rather than masked.
/// </summary>
public static class HarnessStaticApp
{
    private static readonly Dictionary<string, string> Mime = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"] = "text/html; charset=utf-8",
        [".htm"] = "text/html; charset=utf-8",
        [".js"] = "text/javascript; charset=utf-8",
        [".mjs"] = "text/javascript; charset=utf-8",
        [".css"] = "text/css; charset=utf-8",
        [".json"] = "application/json; charset=utf-8",
        [".svg"] = "image/svg+xml",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".gif"] = "image/gif",
        [".webp"] = "image/webp",
        [".ico"] = "image/x-icon",
        [".woff"] = "font/woff",
        [".woff2"] = "font/woff2",
        [".ttf"] = "font/ttf",
        [".wasm"] = "application/wasm",
        [".map"] = "application/json; charset=utf-8",
        [".txt"] = "text/plain; charset=utf-8",
    };

    /// <summary>
    /// Serves <paramref name="rest"/> from <paramref name="appDir"/> no-store.
    /// Missing index.html → <paramref name="emptyStateHtml"/>; any other missing
    /// asset → an explicit 404. <paramref name="logTag"/> names the app in logs.
    /// </summary>
    public static async Task Serve(HttpContext ctx, string appDir, string? rest,
        Logger logger, string emptyStateHtml, string logTag)
    {
        appDir = Path.GetFullPath(appDir);
        var relRaw = (rest ?? string.Empty).Trim('/');
        if (relRaw is "") relRaw = "index.html";

        // Contain the request to appDir (no traversal).
        var target = Path.GetFullPath(Path.Combine(appDir, relRaw));
        var prefix = appDir.EndsWith(Path.DirectorySeparatorChar) ? appDir : appDir + Path.DirectorySeparatorChar;
        if (!target.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && !target.Equals(appDir, StringComparison.OrdinalIgnoreCase))
        {
            ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
            return;
        }

        NoStore(ctx);

        if (File.Exists(target))
        {
            var ext = Path.GetExtension(target);
            ctx.Response.ContentType = Mime.TryGetValue(ext, out var m) ? m : "application/octet-stream";
            try { await ctx.Response.SendFileAsync(target); }
            catch (Exception ex) { logger.Error($"[{logTag}] send {target} failed: {ex.Message}"); ctx.Response.StatusCode = StatusCodes.Status500InternalServerError; }
            return;
        }

        // Missing index.html → honest empty state (NOT a fallback to other content).
        if (relRaw.Equals("index.html", StringComparison.OrdinalIgnoreCase))
        {
            ctx.Response.ContentType = "text/html; charset=utf-8";
            await ctx.Response.WriteAsync(emptyStateHtml);
            return;
        }

        // Any other missing asset → an explicit 404 (so a broken app is visibly broken).
        ctx.Response.StatusCode = StatusCodes.Status404NotFound;
    }

    private static void NoStore(HttpContext ctx)
    {
        ctx.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
        ctx.Response.Headers["Pragma"] = "no-cache";
        ctx.Response.Headers["Expires"] = "0";
    }
}
