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
        [".md"] = "text/markdown; charset=utf-8",
    };

    /// <summary>
    /// Serves <paramref name="rest"/> from <paramref name="appDir"/> no-store.
    /// Missing index.html → <paramref name="emptyStateHtml"/>; any other missing
    /// asset → an explicit 404. <paramref name="logTag"/> names the app in logs.
    /// </summary>
    public static async Task Serve(HttpContext ctx, string appDir, string? rest,
        Logger logger, string emptyStateHtml, string logTag, bool immutableHashedAssets = false)
    {
        appDir = Path.GetFullPath(appDir);
        var relRaw = (rest ?? string.Empty).Trim('/');
        if (relRaw is "") relRaw = "index.html";
        // A sub-folder request (e.g. "manage/") serves that folder's index.html — the
        // Management App (openspec management-app) lives at <app>/manage/.
        else if (Directory.Exists(Path.Combine(appDir, relRaw))) relRaw = relRaw.TrimEnd('/') + "/index.html";

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
            // A content-hashed bundle file (assets/name-<hash>.js) never changes under its name,
            // so the browser may keep it (openspec board-load-live): the Management App's 1.7 MB
            // of JS + CSS was re-downloaded and re-compiled on EVERY load. index.html stays
            // no-store, so a rebuilt app is picked up on the next load. `private`: the response
            // sits behind the login, so a shared proxy must not keep it.
            if (immutableHashedAssets && IsHashedAsset(relRaw))
            {
                ctx.Response.Headers["Cache-Control"] = "private, max-age=31536000, immutable";
                ctx.Response.Headers.Remove("Pragma");
                ctx.Response.Headers.Remove("Expires");
            }
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

    /// <summary>A bundler's content-hashed file under an <c>assets/</c> folder:
    /// <c>manage/assets/manage-CbgGp26m.js</c>. Hand-written files (app.js, data.js) never match.</summary>
    internal static bool IsHashedAsset(string relativePath)
    {
        var p = relativePath.Replace('\\', '/');
        if (!(p.StartsWith("assets/", StringComparison.OrdinalIgnoreCase) || p.Contains("/assets/", StringComparison.OrdinalIgnoreCase))) return false;
        return System.Text.RegularExpressions.Regex.IsMatch(Path.GetFileName(p), @"-[A-Za-z0-9_-]{8,}\.(js|mjs|css|woff2?|ttf|png|svg|jpg|jpeg|gif|webp|map)$");
    }

    private static void NoStore(HttpContext ctx)
    {
        ctx.Response.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
        ctx.Response.Headers["Pragma"] = "no-cache";
        ctx.Response.Headers["Expires"] = "0";
    }
}
