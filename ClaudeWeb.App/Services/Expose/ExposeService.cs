using System.Text.RegularExpressions;
using ClaudeWeb.Models;
using ClaudeWeb.Services.Logging;

namespace ClaudeWeb.Services.Expose;

/// <summary>
/// The Exposure check, slice 1 of plans/product-onboarding.md: probes the
/// selected project's local product and reports — per the contract in
/// docs/networking/local-product-guide.md — whether it is correctly
/// embeddable in the Local tab, and if not, exactly which rule it breaks.
///
/// All checks are HTTP-level (stack-agnostic) and run server-side against
/// 127.0.0.1 / [::1] on the project's configured LocalPort. Read-only: it
/// never edits the product.
/// </summary>
public class ExposeService
{
    private readonly IHttpClientFactory _http;
    private readonly Logger _logger;

    public ExposeService(IHttpClientFactory http, Logger logger)
    {
        _http = http;
        _logger = logger;
    }

    /// <summary>One row of the checklist. Fix is null when Ok.</summary>
    public sealed record Check(string Key, string Label, bool Ok, string Detail, string? Fix);

    public async Task<IReadOnlyList<Check>> RunAsync(RepositoryConfig repo, CancellationToken ct)
    {
        var results = new List<Check>();
        var port = repo.LocalPort;

        // 1. Port configured.
        if (port is not int p)
        {
            results.Add(new("portConfigured", "Local port configured", false,
                "No port set for this project.", "Set the port on the Local tab."));
            // Everything else needs a port — report them as blocked, not failed.
            foreach (var (k, l) in Blocked())
                results.Add(new(k, l, false, "Needs a configured port first.", null));
            return results;
        }
        results.Add(new("portConfigured", "Local port configured", true, $"Port {p}.", null));

        var client = _http.CreateClient("expose");

        // 2 & 3. Listening on IPv4 and IPv6 (the dual-stack footgun).
        var v4 = await Probe($"http://127.0.0.1:{p}/", client, ct);
        results.Add(new("listeningIpv4", "Listening (IPv4)", v4.Reached,
            v4.Reached ? "Answers on 127.0.0.1." : $"No answer on 127.0.0.1:{p}.",
            v4.Reached ? null : "Start the product on this port."));

        var v6 = await Probe($"http://[::1]:{p}/", client, ct);
        results.Add(new("listeningIpv6", "Listening (IPv6 ::1)", v6.Reached,
            v6.Reached ? "Answers on [::1]." : $"No answer on [::1]:{p} (IPv4-only bind).",
            v6.Reached ? null : "Bind dual-stack (Kestrel ListenAnyIP / listen on '::') — browsers resolve localhost to ::1 first."));

        // Without a live root response, the remaining content checks can't run.
        if (!v4.Reached || v4.Response is null)
        {
            results.Add(new("servesAtRoot", "Serves at root", false, "Could not reach the product.", null));
            results.Add(new("relativeAssets", "Relative asset URLs", false, "Could not read the page.", null));
            results.Add(new("assetResolves", "Assets resolve under the proxy", false, "Could not read the page.", null));
            return results;
        }

        // 4. Serves at root (200 + HTML).
        var rootOk = (int)v4.Response.StatusCode == 200;
        var ctype = v4.Response.Content.Headers.ContentType?.MediaType ?? "";
        var html = await v4.Response.Content.ReadAsStringAsync(ct);
        results.Add(new("servesAtRoot", "Serves at root", rootOk,
            rootOk ? $"GET / → 200 ({ctype})." : $"GET / → {(int)v4.Response.StatusCode}.",
            rootOk ? null : "Serve the app at / (no server-side base path)."));

        // 5. Relative asset URLs (no leading-slash absolutes that escape the prefix).
        var absolute = AbsoluteAssetRefs(html);
        var relOk = absolute.Count == 0;
        results.Add(new("relativeAssets", "Relative asset URLs", relOk,
            relOk ? "Asset URLs are relative." : $"Absolute asset URL(s): {string.Join(", ", absolute.Take(3))}",
            relOk ? null : "Use relative URLs (Vite base: './') — leading-slash paths escape the /api/localview/ prefix."));

        // 6. A referenced asset actually resolves at its relative path (what the
        //    proxy forwards). Proves the relative URLs point at real files.
        var asset = FirstRelativeAsset(html);
        if (asset is null)
        {
            results.Add(new("assetResolves", "Assets resolve under the proxy", true,
                "No asset references to check.", null));
        }
        else
        {
            var probe = await Probe($"http://127.0.0.1:{p}/{asset.TrimStart('/')}", client, ct);
            var aOk = probe.Reached && probe.Response is not null && (int)probe.Response.StatusCode == 200;
            results.Add(new("assetResolves", "Assets resolve under the proxy", aOk,
                aOk ? $"{asset} → 200." : $"{asset} did not resolve.",
                aOk ? null : "The referenced asset 404s — check the build output / base path."));
        }

        _logger.Info($"[EXPOSE] {repo.Name}:{p} check -> {results.Count(r => r.Ok)}/{results.Count} ok");
        return results;
    }

    private static IEnumerable<(string Key, string Label)> Blocked() => new[]
    {
        ("listeningIpv4", "Listening (IPv4)"),
        ("listeningIpv6", "Listening (IPv6 ::1)"),
        ("servesAtRoot", "Serves at root"),
        ("relativeAssets", "Relative asset URLs"),
        ("assetResolves", "Assets resolve under the proxy"),
    };

    private sealed record ProbeResult(bool Reached, HttpResponseMessage? Response, string Error);

    private static async Task<ProbeResult> Probe(string url, HttpClient client, CancellationToken ct)
    {
        try
        {
            var resp = await client.GetAsync(url, HttpCompletionOption.ResponseHeadersRead, ct);
            return new ProbeResult(true, resp, "");
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            return new ProbeResult(false, null, ex.Message);
        }
    }

    // <script src> / <link href> values that are root-absolute ("/x"), which
    // escape the proxy prefix. Ignores protocol-relative ("//") and full URLs.
    private static List<string> AbsoluteAssetRefs(string html)
    {
        var matches = Regex.Matches(html, """(?:src|href)\s*=\s*["'](/(?!/)[^"']*)["']""",
            RegexOptions.IgnoreCase);
        return matches.Select(m => m.Groups[1].Value)
            .Where(v => v.Contains('.') || v.Contains("/assets")) // asset-ish, not anchors
            .Distinct()
            .ToList();
    }

    // First relative asset path referenced by the HTML, normalized to a
    // root-relative path the product would serve.
    private static string? FirstRelativeAsset(string html)
    {
        var m = Regex.Match(html, """(?:src|href)\s*=\s*["'](\.?/?assets/[^"']+)["']""",
            RegexOptions.IgnoreCase);
        if (!m.Success) return null;
        var raw = m.Groups[1].Value;
        return "/" + raw.TrimStart('.').TrimStart('/');
    }
}
