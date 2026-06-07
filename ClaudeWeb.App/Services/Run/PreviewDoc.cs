namespace ClaudeWeb.Services.Run;

/// <summary>
/// Writes the "preview" convention into the opened repository's CLAUDE.md, so
/// Claude knows how to start that project for the App tab. The text lives in the
/// target repo (inspectable + editable by the operator) rather than being
/// injected invisibly at runtime.
///
/// The section is delimited by HTML-comment markers so re-running "Prepare" is
/// idempotent: it replaces the existing block in place (refreshing the port /
/// self-dev steps) instead of appending duplicates. Any content the user wrote
/// outside the markers is left untouched.
/// </summary>
public static class PreviewDoc
{
    public const string Begin = "<!-- claude-web:preview (managed by Claude Web -- re-run \"Prepare for preview\" to update) -->";
    public const string End = "<!-- /claude-web:preview -->";

    public sealed record PrepareResult(string Action, string FileName);

    /// <summary>Builds the managed section for the given preview port. Self-dev
    /// gets the extra isolated-build steps (the harness can't build over its own
    /// running exe).</summary>
    public static string BuildSection(int port, bool isSelf)
    {
        var body = Generic.Replace("{PORT}", port.ToString());
        if (isSelf) body += Self.Replace("{PORT}", port.ToString());
        return $"{Begin}\n\n{body.Trim()}\n\n{End}\n";
    }

    /// <summary>
    /// Creates, updates, or appends the managed section in &lt;repoPath&gt;/CLAUDE.md.
    /// Returns which action was taken.
    /// </summary>
    public static PrepareResult Prepare(string repoPath, int port, bool isSelf)
    {
        const string fileName = "CLAUDE.md";
        var path = Path.Combine(repoPath, fileName);
        var section = BuildSection(port, isSelf);

        if (!File.Exists(path))
        {
            File.WriteAllText(path, $"# Project notes\n\n{section}");
            return new PrepareResult("created", fileName);
        }

        var content = File.ReadAllText(path);
        var bi = content.IndexOf(Begin, StringComparison.Ordinal);
        var ei = content.IndexOf(End, StringComparison.Ordinal);
        if (bi >= 0 && ei > bi)
        {
            var before = content[..bi];
            var after = content[(ei + End.Length)..];
            File.WriteAllText(path, before + section.TrimEnd() + after);
            return new PrepareResult("updated", fileName);
        }

        var sep = content.EndsWith("\n") ? "\n" : "\n\n";
        File.WriteAllText(path, content + sep + section);
        return new PrepareResult("appended", fileName);
    }

    private const string Generic = @"## Previewing this app in Claude Web

The Claude Web ""App"" tab embeds whatever is listening on **port {PORT}**. When the
user asks you to run, start, or preview the app:

1. Start it listening on **0.0.0.0:{PORT}** (not localhost) so it is reachable
   from the phone over the LAN.
2. Launch it **detached** so it keeps running after your turn ends. Claude Web
   runs you via `claude -p` (one-shot), so a normal child process dies when the
   turn finishes. Windows: `Start-Process`. macOS/Linux: `nohup ... & disown`.
3. Free the port first if something already holds it:
   - Windows: `Get-NetTCPConnection -LocalPort {PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
   - macOS/Linux: `lsof -ti tcp:{PORT} | xargs -r kill`
4. Use this repository's own stack and scripts to start it.";

    private const string Self = @"

### This repo is Claude Web itself (self-development)

You cannot build into the running app's own `bin/` (its `ClaudeWeb.exe` is locked)
or reuse its port. Build to an isolated dir and run on {PORT}:

```powershell
npm --prefix client install
npm --prefix client run build
dotnet build ClaudeWeb.App/ClaudeWeb.App.csproj -o .claudeweb-preview/bin
Copy-Item client/dist .claudeweb-preview/bin/client/dist -Recurse -Force
$env:CLAUDEWEB_PORT = ""{PORT}""
Start-Process .claudeweb-preview/bin/ClaudeWeb.exe
```

`.claudeweb-preview/` is gitignored. A second monitoring window appearing is
expected.";
}
