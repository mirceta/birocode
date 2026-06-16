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

    /// <summary>
    /// One row of the checklist. <see cref="Why"/> is the plain-language contract
    /// rationale (always present, pass or fail) — the single source of the "live
    /// contract" the helper renders, so the served product never carries a stale
    /// copy. <see cref="Fix"/> is the remediation, null when Ok.
    /// </summary>
    public sealed record Check(string Key, string Label, bool Ok, string Detail, string Why, string? Fix);

    // Plain-language "why this rule exists", anchored to the embed contract
    // (docs/networking/local-product-guide.md). Kept here so the helper and the
    // chrome panel share one up-to-date copy. Keyed by check key.
    private static string Why(string key) => key switch
    {
        "portConfigured" => "The Local tab embeds your product through the harness proxy at a fixed port. With no port set, there is nothing to embed.",
        "listeningIpv4" => "The proxy and this check dial 127.0.0.1 server-side. If the product is not listening there, the embed comes back blank.",
        "listeningIpv6" => "Browsers resolve localhost to IPv6 [::1] first. An IPv4-only bind answers curl but looks dead to the embed — bind dual-stack.",
        "servesAtRoot" => "The proxy forwards /api/localview/<repo>/ to your product's root. If the app only serves under its own sub-path, the root returns nothing.",
        "relativeAssets" => "Assets load under the proxy sub-path. A leading-slash URL (/assets/…) escapes it and 404s; a relative ./assets/… resolves correctly.",
        "assetResolves" => "Even with relative URLs, the referenced file must exist in the build output — otherwise the page loads but its styles/scripts 404.",
        _ => "",
    };

    public async Task<IReadOnlyList<Check>> RunAsync(RepositoryConfig repo, CancellationToken ct)
    {
        var results = new List<Check>();
        var port = repo.LocalPort;

        // 1. Port configured.
        if (port is not int p)
        {
            results.Add(new("portConfigured", "Local port configured", false,
                "No port set for this project.", Why("portConfigured"), "Set the port on the Local tab."));
            // Everything else needs a port — report them as blocked, not failed.
            foreach (var (k, l) in Blocked())
                results.Add(new(k, l, false, "Needs a configured port first.", Why(k), null));
            return results;
        }
        results.Add(new("portConfigured", "Local port configured", true, $"Port {p}.", Why("portConfigured"), null));

        var client = _http.CreateClient("expose");

        // 2 & 3. Listening on IPv4 and IPv6 (the dual-stack footgun).
        var v4 = await Probe($"http://127.0.0.1:{p}/", client, ct);
        results.Add(new("listeningIpv4", "Listening (IPv4)", v4.Reached,
            v4.Reached ? "Answers on 127.0.0.1." : $"No answer on 127.0.0.1:{p}.",
            Why("listeningIpv4"),
            v4.Reached ? null : "Start the product on this port."));

        var v6 = await Probe($"http://[::1]:{p}/", client, ct);
        results.Add(new("listeningIpv6", "Listening (IPv6 ::1)", v6.Reached,
            v6.Reached ? "Answers on [::1]." : $"No answer on [::1]:{p} (IPv4-only bind).",
            Why("listeningIpv6"),
            v6.Reached ? null : "Bind dual-stack (Kestrel ListenAnyIP / listen on '::') — browsers resolve localhost to ::1 first."));

        // Without a live root response, the remaining content checks can't run.
        if (!v4.Reached || v4.Response is null)
        {
            results.Add(new("servesAtRoot", "Serves at root", false, "Could not reach the product.", Why("servesAtRoot"), null));
            results.Add(new("relativeAssets", "Relative asset URLs", false, "Could not read the page.", Why("relativeAssets"), null));
            results.Add(new("assetResolves", "Assets resolve under the proxy", false, "Could not read the page.", Why("assetResolves"), null));
            return results;
        }

        // 4. Serves at root (200 + HTML).
        var rootOk = (int)v4.Response.StatusCode == 200;
        var ctype = v4.Response.Content.Headers.ContentType?.MediaType ?? "";
        var html = await v4.Response.Content.ReadAsStringAsync(ct);
        results.Add(new("servesAtRoot", "Serves at root", rootOk,
            rootOk ? $"GET / → 200 ({ctype})." : $"GET / → {(int)v4.Response.StatusCode}.",
            Why("servesAtRoot"),
            rootOk ? null : "Serve the app at / (no server-side base path)."));

        // 5. Relative asset URLs (no leading-slash absolutes that escape the prefix).
        var absolute = AbsoluteAssetRefs(html);
        var relOk = absolute.Count == 0;
        results.Add(new("relativeAssets", "Relative asset URLs", relOk,
            relOk ? "Asset URLs are relative." : $"Absolute asset URL(s): {string.Join(", ", absolute.Take(3))}",
            Why("relativeAssets"),
            relOk ? null : "Use relative URLs (Vite base: './') — leading-slash paths escape the /api/localview/ prefix."));

        // 6. A referenced asset actually resolves at its relative path (what the
        //    proxy forwards). Proves the relative URLs point at real files.
        var asset = FirstRelativeAsset(html);
        if (asset is null)
        {
            results.Add(new("assetResolves", "Assets resolve under the proxy", true,
                "No asset references to check.", Why("assetResolves"), null));
        }
        else
        {
            var probe = await Probe($"http://127.0.0.1:{p}/{asset.TrimStart('/')}", client, ct);
            var aOk = probe.Reached && probe.Response is not null && (int)probe.Response.StatusCode == 200;
            results.Add(new("assetResolves", "Assets resolve under the proxy", aOk,
                aOk ? $"{asset} → 200." : $"{asset} did not resolve.",
                Why("assetResolves"),
                aOk ? null : "The referenced asset 404s — check the build output / base path."));
        }

        _logger.Info($"[EXPOSE] {repo.Name}:{p} check -> {results.Count(r => r.Ok)}/{results.Count} ok");
        return results;
    }

    /// <summary>
    /// Slice 2 (plans/product-onboarding.md): a ready-to-send agent task built
    /// from the FAILING checks + the current contract. Null when all pass. The
    /// contract text lives here (single source) so the agent always gets the
    /// up-to-date rules, never a stale copy in the product repo.
    /// </summary>
    public string? BuildFixPrompt(RepositoryConfig repo, IReadOnlyList<Check> checks)
    {
        var failing = checks.Where(c => !c.Ok).ToList();
        if (failing.Count == 0) return null;

        var lines = failing
            .Select(c => $"- {c.Label}: {c.Fix ?? c.Detail}")
            .ToList();

        var port = repo.LocalPort?.ToString() ?? "<set a port>";
        return
            $"The local web product for \"{repo.Name}\" (port {port}) isn't correctly exposed to " +
            "Claude Web's Local tab. Fix the items below so it embeds correctly — the full contract is in " +
            "docs/networking/local-product-guide.md:\n\n" +
            string.Join("\n", lines) +
            $"\n\nThen restart the product on port {port}. I'll re-run the Exposure check to confirm.";
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
