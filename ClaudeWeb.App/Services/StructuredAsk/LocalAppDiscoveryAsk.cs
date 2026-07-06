namespace ClaudeWeb.Services.StructuredAsk;

/// <summary>
/// The "stage": owns the GENERIC, signature-based discovery prompt and runs it for
/// one repository. The prompt names NO app and assumes NO layout -- it describes the
/// shape of a local-app exposure (per docs/local-exposure-convention.md) so it keeps
/// working as apps are added and in any repository. The required-output schema is
/// rendered from <see cref="LocalAppExposureReport"/>, so prompt and parser cannot
/// drift. See openspec/changes/discover-local-apps/.
/// </summary>
public class LocalAppDiscoveryAsk
{
    private readonly StructuredAskRunner _runner;

    public LocalAppDiscoveryAsk(StructuredAskRunner runner) => _runner = runner;

    /// <summary>Discover local-app exposures in the single repository rooted at
    /// <paramref name="workingDirectory"/>.</summary>
    public Task<StructuredAskResult<LocalAppExposureReport>> DiscoverAsync(
        string workingDirectory, CancellationToken ct = default)
        => DiscoverAsync(workingDirectory, promptTemplate: null, ct);

    /// <summary>Same discovery, with an optional prompt-template override — the seam the
    /// offline discovery eval uses to score CANDIDATE prompts against the shipped baseline
    /// (openspec change add-discovery-eval). A null/empty template means the shipped
    /// <see cref="BaselinePromptTemplate"/>; production callers never pass one, so shipped
    /// behavior is unchanged. A template must contain the {{OUTPUT_FORMAT}} placeholder.</summary>
    public Task<StructuredAskResult<LocalAppExposureReport>> DiscoverAsync(
        string workingDirectory, string? promptTemplate, CancellationToken ct = default)
        => _runner.RunAsync(BuildPrompt(promptTemplate), LocalAppExposureReport.Parse, workingDirectory, ct);

    /// <summary>The shipped discovery prompt template, exposed so the eval can run it as
    /// the baseline and assert the no-override path stays byte-identical to it.</summary>
    public static string BaselinePromptTemplate => Prompt;

    /// <summary>Render a template (default: the shipped one) into the final prompt by
    /// substituting the output-format skeleton derived from the typed report.</summary>
    public static string BuildPrompt(string? promptTemplate = null) =>
        (string.IsNullOrEmpty(promptTemplate) ? Prompt : promptTemplate).Replace(
            "{{OUTPUT_FORMAT}}",
            OutputFormatRenderer.Render(typeof(LocalAppExposureReport)));

    private const string Prompt = @"
Scan THIS repository for every web app in it that exposes itself as a **local app** --
a self-serving HTTP server the Claude Web harness can reach on its Local tab.

A local-app exposure is a directory in this repository that:
  - runs its OWN HTTP server (e.g. a Node serve.mjs / server.js, a serve.ps1, or an
    embedded server) that LISTENS on a FIXED port;
  - binds dual-stack loopback -- 127.0.0.1 AND [::1] (or 0.0.0.0 / [::] / `::` with
    dualstack enabled);
  - serves its page at the root path GET /;
  - references its assets with RELATIVE URLs (./... not /...).

The canonical contract is `docs/local-exposure-convention.md` in this repository --
read it if present, then go find the apps.

Find EVERY such directory. Do NOT assume any particular app exists, and do NOT assume a
particular layout -- discover them by locating the server's listen/bind call and the
fixed port it uses. Search the repository (look for files like serve.mjs, server.js,
serve.ps1, and calls such as `.listen(`, `createServer`, `HttpListener`, `app.listen`).

For each app you find, report:
  - name: the app's name (its directory name is a good default)
  - port: the fixed port it listens on (an integer)
  - folder: the repo-relative folder it lives in
  - evidence: the file and line where the port is bound (e.g. homepage/serve.mjs:22)
  - startCommand: the command that LAUNCHES the app, meant to be run from its
    folder (the value of `folder`). Read it from the server file you found -- e.g.
    `node serve.mjs` for a Node server file, `powershell -File serve.ps1` for a
    PowerShell server, or the documented start command if one is given. Report just
    the command (no `cd` prefix). Use an empty string ONLY if you genuinely cannot
    determine how to start it.

If the repository has no such directory, return an empty ""apps"" array. Do not invent
entries.

### Output format

Respond with ONLY valid JSON in this exact structure:

{{OUTPUT_FORMAT}}
";
}
