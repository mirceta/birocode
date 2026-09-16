using System.Text;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileProviders;

namespace ClaudeWeb.Services.Hosting;

/// <summary>
/// Serves the React shell (<c>client/dist/index.html</c>) with the connected machine
/// stamped in (board task c97579f3): the <c>&lt;title&gt;</c> becomes this box's LAN
/// IPv4 (falling back to the request's host) so several harness tabs are telling apart
/// at a glance, and two meta tags carry the same facts for the SPA
/// (<c>claudeweb-host</c>, <c>claudeweb-machine</c>) so React can keep the title
/// correct without a round trip. The title is therefore right on the very first
/// paint, before any script runs or any login happens. Same no-store headers as the
/// static shell so a stale tab never pins old asset hashes.
/// </summary>
public static class SpaShell
{
    private static readonly Regex TitleTag = new("<title>.*?</title>", RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);
    private static readonly Regex HeadOpen = new("<head[^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    /// <summary>What the tab shows: the LAN IP when known, else the host the browser
    /// used (without a port), else the machine name.</summary>
    public static string TabTitle(string? lanIp, string? requestHost, string? machineName)
    {
        if (!string.IsNullOrWhiteSpace(lanIp)) return lanIp.Trim();
        var host = (requestHost ?? "").Trim();
        if (host.StartsWith('[')) { var end = host.IndexOf(']'); if (end > 0) host = host[..(end + 1)]; }
        else { var colon = host.LastIndexOf(':'); if (colon > 0) host = host[..colon]; }
        if (!string.IsNullOrWhiteSpace(host)) return host;
        return string.IsNullOrWhiteSpace(machineName) ? "Claude Web" : machineName!;
    }

    /// <summary>Pure: the shell HTML with the title replaced and the meta tags injected.
    /// Attribute values are HTML-escaped; a shell without a title or head is returned
    /// unchanged rather than broken.</summary>
    public static string Render(string html, string? lanIp, string? requestHost, string? machineName)
    {
        var title = TabTitle(lanIp, requestHost, machineName);
        static string Esc(string? s) => System.Net.WebUtility.HtmlEncode(s ?? "");
        var meta = $"<meta name=\"claudeweb-host\" content=\"{Esc(lanIp)}\"><meta name=\"claudeweb-machine\" content=\"{Esc(machineName)}\"><meta name=\"claudeweb-title\" content=\"{Esc(title)}\">";
        var withTitle = TitleTag.IsMatch(html) ? TitleTag.Replace(html, $"<title>{Esc(title)}</title>", 1) : html;
        var head = HeadOpen.Match(withTitle);
        return head.Success ? withTitle.Insert(head.Index + head.Length, meta) : withTitle;
    }

    /// <summary>Writes the rendered shell for this request, or falls through (returns
    /// false) when the built shell is missing so the caller can 404 as before.</summary>
    public static async Task<bool> TryWriteAsync(HttpContext ctx, IFileProvider dist)
    {
        var file = dist.GetFileInfo("index.html");
        if (!file.Exists || file.IsDirectory) return false;
        string html;
        using (var s = file.CreateReadStream())
        using (var r = new StreamReader(s, Encoding.UTF8))
            html = await r.ReadToEndAsync();
        var body = Render(html, HostAddress.LanIpv4(), ctx.Request.Host.Value, Environment.MachineName);
        var res = ctx.Response;
        res.StatusCode = StatusCodes.Status200OK;
        res.ContentType = "text/html; charset=utf-8";
        res.Headers["Cache-Control"] = "no-store, no-cache, must-revalidate";
        res.Headers["Pragma"] = "no-cache";
        res.Headers["Expires"] = "0";
        await res.WriteAsync(body, Encoding.UTF8);
        return true;
    }
}
