using System.Text.Json;
using System.Text.RegularExpressions;

namespace ClaudeWeb.Services.Chat;

/// <summary>
/// The pure half of the Claude-for-Chrome preflight (openspec chrome-readiness-preflight):
/// what the facts of this machine MEAN. Everything here is a function of its arguments —
/// no registry, no files, no processes — so the chain's rules are unit-tested.
///
/// The chain, as verified on the hub against CLI 2.1.289 and the official docs
/// (code.claude.com/docs/en/chrome):
///
///   agent turn  --chrome-->  Claude Code CLI  --named pipe-->  native host
///   (claude.exe --chrome-native-host, started BY Chrome from the registered
///   native-messaging manifest)  --stdio-->  the Claude extension in a Chrome profile,
///   signed in to claude.ai with the SAME account as the CLI.
///
/// A break anywhere reads the same to the agent: "Browser extension is not connected".
/// </summary>
public static class ChromePreflightRules
{
    public const string ExtensionId = "fcoeoabgfenejglbffodgkkbkcdhcgfn";
    public const string NativeHostName = "com.anthropic.claude_code_browser_extension";
    public const string MinExtensionVersion = "1.0.36";
    public const string ServerName = "claude-in-chrome";
    public const string ToolPrefix = "mcp__claude-in-chrome__";
    public static string BridgePipeName(string userName) => $"claude-mcp-browser-bridge-{userName}";

    /// <summary>Environment variables that make the CLI authenticate with something other
    /// than the claude.ai login — the CLI then keeps Chrome integration OFF even with
    /// <c>--chrome</c>, silently (docs; reproduced on the hub with both of the first two).
    /// The harness strips <c>ANTHROPIC_API_KEY</c> from every agent spawn; the others reach it.</summary>
    public static readonly string[] AuthOverrideVars =
    {
        "ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN",
        "CLAUDE_CODE_USE_BEDROCK", "CLAUDE_CODE_USE_VERTEX", "CLAUDE_CODE_USE_FOUNDRY",
    };
    public const string StrippedAtSpawn = "ANTHROPIC_API_KEY";

    /// <summary>pass / fail / warn; <c>unknown</c> = could not be checked from the harness (never
    /// shown green); <c>info</c> = nothing to judge yet (not counted either way).</summary>
    public const string Pass = "pass", Fail = "fail", Warn = "warn", Unknown = "unknown", Info = "info";

    /// <summary>One line of the section: what was checked, what was found, what to do.</summary>
    public sealed record Check(string Id, string Label, string State, string Detail, string? Fix = null);

    // ---- facts (gathered by ChromePreflightService) ---------------------------------------

    public sealed record ProfileFact(string Dir, string Name, bool Active, string? ExtensionVersion, bool? ExtensionEnabled, string? DisabledWhy);
    public sealed record HostFact(bool Registered, string? ManifestPath, bool ManifestExists, string? TargetPath, bool TargetExists,
        string? CliPath, bool CliExists, bool AllowsExtension, string? Error);
    public sealed record ProbeBrowser(string Name, string? Platform, bool Local);
    public sealed record ProbeResult(long At, long TookMs, string Outcome, string Detail, bool ServerListed, int ToolCount,
        IReadOnlyList<ProbeBrowser> Browsers, bool ReachedExtension);
    public sealed record TurnFact(long? LastOkAt, long? LastErrorAt, string? LastError, string? LastErrorTool);
    public sealed record Facts(
        bool Windows, string? ChromePath, string? ChromeVersion, int ChromeProcesses, bool ProfilesReadable, IReadOnlyList<ProfileFact> Profiles,
        HostFact Host, bool? BridgePipe, string PipeName,
        string? CliPath, string? CliVersion, bool CliSupportsChrome,
        bool LoggedIn, string? Plan, string? Account, IReadOnlyList<string> AuthOverrides, bool ApiKeyHelper,
        bool GateBusy, string? GateHolder, TurnFact Turns, ProbeResult? Probe, bool ProbeRunning, long Now);

    // ---- parsing ---------------------------------------------------------------------------

    /// <summary>"1.0.98_0" (Chrome's on-disk folder name) or "1.0.98" → comparable parts.</summary>
    public static int[] VersionParts(string? v)
    {
        if (string.IsNullOrWhiteSpace(v)) return Array.Empty<int>();
        var core = v.Split('_')[0];
        return core.Split('.').Select(p => int.TryParse(p, out var n) ? n : 0).ToArray();
    }

    public static bool VersionAtLeast(string? have, string need)
    {
        var a = VersionParts(have); var b = VersionParts(need);
        if (a.Length == 0) return false;
        for (var i = 0; i < Math.Max(a.Length, b.Length); i++)
        {
            var x = i < a.Length ? a[i] : 0; var y = i < b.Length ? b[i] : 0;
            if (x != y) return x > y;
        }
        return true;
    }

    /// <summary>The extension's entry in a profile's (Secure) Preferences:
    /// <c>extensions.settings.&lt;id&gt;</c>. Enabled unless Chrome recorded a reason to
    /// disable it (<c>disable_reasons</c>, a list in current Chrome, a bitmask before) or the
    /// legacy <c>state</c> is 0. Null when the profile has no entry for it.</summary>
    public static (bool Enabled, string? Why)? ExtensionEntry(JsonElement prefsRoot, string extensionId = ExtensionId)
    {
        if (prefsRoot.ValueKind != JsonValueKind.Object ||
            !prefsRoot.TryGetProperty("extensions", out var ext) || ext.ValueKind != JsonValueKind.Object ||
            !ext.TryGetProperty("settings", out var settings) || settings.ValueKind != JsonValueKind.Object ||
            !settings.TryGetProperty(extensionId, out var e) || e.ValueKind != JsonValueKind.Object)
            return null;
        if (e.TryGetProperty("disable_reasons", out var dr))
        {
            if (dr.ValueKind == JsonValueKind.Array && dr.GetArrayLength() > 0)
                return (false, "Chrome lists it as disabled (reason " + string.Join(", ", dr.EnumerateArray().Select(x => x.ToString())) + ")");
            if (dr.ValueKind == JsonValueKind.Number && dr.TryGetInt32(out var mask) && mask != 0)
                return (false, $"Chrome lists it as disabled (reason {mask})");
        }
        if (e.TryGetProperty("state", out var st) && st.ValueKind == JsonValueKind.Number && st.TryGetInt32(out var state) && state == 0)
            return (false, "switched off in chrome://extensions");
        return (true, null);
    }

    /// <summary>The native-messaging manifest: the host program Chrome will start and which
    /// extension may talk to it.</summary>
    public static (string? Path, bool AllowsExtension)? ParseHostManifest(string json, string extensionId = ExtensionId)
    {
        try
        {
            using var doc = JsonDocument.Parse(json);
            var root = doc.RootElement;
            var path = root.TryGetProperty("path", out var p) && p.ValueKind == JsonValueKind.String ? p.GetString() : null;
            var allows = root.TryGetProperty("allowed_origins", out var ao) && ao.ValueKind == JsonValueKind.Array &&
                ao.EnumerateArray().Any(o => (o.GetString() ?? "").Contains(extensionId, StringComparison.OrdinalIgnoreCase));
            return (path, allows);
        }
        catch { return null; }
    }

    /// <summary>The CLI binary a generated wrapper script starts:
    /// <c>"C:\Users\x\.local\bin\claude.exe" "--chrome-native-host"</c>.</summary>
    public static string? WrapperTarget(string script)
    {
        var m = Regex.Match(script, "\"([^\"\\r\\n]+\\.(?:exe|cmd|js))\"[^\\r\\n]*--chrome-native-host", RegexOptions.IgnoreCase);
        return m.Success ? m.Groups[1].Value : null;
    }

    /// <summary>A browser tool result that says the CLI could not reach the extension at all
    /// (as opposed to a page-level error such as "No element found").</summary>
    public static bool IsConnectionError(string? toolResultText) =>
        !string.IsNullOrEmpty(toolResultText) &&
        (toolResultText.Contains("Browser extension is not connected", StringComparison.OrdinalIgnoreCase)
         || toolResultText.Contains("Receiving end does not exist", StringComparison.OrdinalIgnoreCase)
         || toolResultText.Contains("No Chrome extension", StringComparison.OrdinalIgnoreCase));

    /// <summary>Reads a probe turn's <c>--output-format stream-json</c> lines: was the
    /// claude-in-chrome server offered to the turn (init), which browsers answered
    /// <c>list_connected_browsers</c>, and did <c>tabs_context_mcp</c> get an answer from the
    /// extension. The verdict comes from the TOOL RESULTS, never from the model's prose.</summary>
    public static ProbeResult ParseProbe(IEnumerable<string> lines, long at, long tookMs, bool timedOut = false, string? launchError = null)
    {
        if (launchError is not null)
            return new ProbeResult(at, tookMs, "error", "The probe turn could not be started: " + launchError, false, 0, Array.Empty<ProbeBrowser>(), false);
        var serverListed = false; string? serverStatus = null; var tools = 0; string? authSource = null;
        var calls = new Dictionary<string, string>(StringComparer.Ordinal);
        var browsers = new List<ProbeBrowser>(); bool? listed = null; var reached = false; string? connError = null; string? turnError = null;
        foreach (var line in lines)
        {
            if (string.IsNullOrWhiteSpace(line) || line[0] != '{') continue;
            JsonDocument doc;
            try { doc = JsonDocument.Parse(line); } catch { continue; }
            using (doc)
            {
                var root = doc.RootElement;
                var type = Str(root, "type");
                if (type == "system" && Str(root, "subtype") == "init")
                {
                    authSource = Str(root, "apiKeySource");
                    if (root.TryGetProperty("mcp_servers", out var servers) && servers.ValueKind == JsonValueKind.Array)
                        foreach (var s in servers.EnumerateArray())
                            if (Str(s, "name") == ServerName) { serverListed = true; serverStatus = Str(s, "status"); }
                    if (root.TryGetProperty("tools", out var ts) && ts.ValueKind == JsonValueKind.Array)
                        tools = ts.EnumerateArray().Count(t => (t.GetString() ?? "").StartsWith(ToolPrefix, StringComparison.Ordinal));
                }
                else if (type is "assistant" or "user")
                {
                    if (!root.TryGetProperty("message", out var msg) || !msg.TryGetProperty("content", out var content) || content.ValueKind != JsonValueKind.Array) continue;
                    foreach (var b in content.EnumerateArray())
                    {
                        var bt = Str(b, "type");
                        if (bt == "tool_use") { var name = Str(b, "name") ?? ""; if (name.StartsWith(ToolPrefix, StringComparison.Ordinal)) calls[Str(b, "id") ?? ""] = name[ToolPrefix.Length..]; }
                        else if (bt == "tool_result" && calls.TryGetValue(Str(b, "tool_use_id") ?? "", out var tool))
                        {
                            var text = TurnText.ExtractToolResultText(b);
                            if (IsConnectionError(text)) { connError = FirstSentence(text); continue; }
                            if (tool == "list_connected_browsers") { listed = true; browsers.AddRange(ParseBrowsers(text)); }
                            else if (tool == "tabs_context_mcp") reached = true;   // any answer that is not a connection error came from the extension
                        }
                    }
                }
                else if (type == "result" && root.TryGetProperty("is_error", out var ie) && ie.ValueKind == JsonValueKind.True)
                    turnError = Short(Str(root, "result") ?? "the turn ended in an error");
            }
        }
        ProbeResult R(string outcome, string detail) => new(at, tookMs, outcome, detail, serverListed, tools, browsers, reached);
        if (timedOut) return R("error", "The probe turn did not finish in time.");
        if (!serverListed || tools == 0)
            return R("fail", "The turn was started with --chrome but was NOT offered the browser tools"
                + (authSource is not null and not "none" ? $" — the CLI authenticated with {authSource}, and Chrome integration only works with the claude.ai login." : ".")
                + (turnError is not null ? " " + turnError : ""));
        if (connError is not null) return R("fail", "The browser tools were offered, but the extension did not answer: " + connError);
        if (listed == true && browsers.Count == 0) return R("fail", "The browser tools were offered, but no browser is connected to this account (list_connected_browsers answered an empty list).");
        if (browsers.Count > 0 && reached)
            return R("pass", $"An agent turn reached the extension: {browsers.Count} browser(s) connected ({string.Join(", ", browsers.Select(b => b.Name + (b.Local ? " — this machine" : " — remote")))}), and tabs_context_mcp answered.");
        if (browsers.Count > 0) return R("warn", $"{browsers.Count} browser(s) connected, but the tab call got no answer.");
        if (turnError is not null) return R("error", "The probe turn failed before it could call a browser tool: " + turnError);
        return R("error", "The probe turn ended without calling the browser tools (" + (serverStatus ?? "no status") + ").");
    }

    private static IEnumerable<ProbeBrowser> ParseBrowsers(string text)
    {
        var start = text.IndexOf('['); var end = text.LastIndexOf(']');
        if (start < 0 || end <= start) yield break;
        JsonDocument doc;
        try { doc = JsonDocument.Parse(text[start..(end + 1)]); } catch { yield break; }
        using (doc)
        {
            if (doc.RootElement.ValueKind != JsonValueKind.Array) yield break;
            foreach (var b in doc.RootElement.EnumerateArray())
                if (b.ValueKind == JsonValueKind.Object)
                    yield return new ProbeBrowser(Str(b, "name") ?? "browser", Str(b, "osPlatform"),
                        b.TryGetProperty("isLocal", out var l) && l.ValueKind == JsonValueKind.True);
        }
    }

    private static string? Str(JsonElement e, string name) =>
        e.ValueKind == JsonValueKind.Object && e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;

    private static string Short(string text)
    {
        var t = Regex.Replace(text, "\\s+", " ").Trim();
        return t.Length > 220 ? t[..220] + "…" : t;
    }

    private static string FirstSentence(string text)
    {
        var t = Regex.Replace(text, "\\s+", " ").Trim();
        var dot = t.IndexOf(". ", StringComparison.Ordinal);
        if (dot > 20) t = t[..(dot + 1)];
        return t.Length > 220 ? t[..220] + "…" : t;
    }

    // ---- the checks -----------------------------------------------------------------------

    public static readonly TimeSpan ProbeFresh = TimeSpan.FromHours(6);

    public static IReadOnlyList<Check> Evaluate(Facts f)
    {
        var checks = new List<Check>();
        if (!f.Windows)
        {
            checks.Add(new Check("platform", "Platform", Unknown, "The static checks read the Windows registry and Chrome's Windows profile folder; on this OS only the live probe can tell.", "Run the live probe."));
        }
        else
        {
            // 1. Chrome itself.
            checks.Add(f.ChromePath is null
                ? new Check("chrome", "Chrome installed", Fail, "Google Chrome was not found in Program Files or the user's local app data.", "Install Google Chrome, then install the Claude extension in it.")
                : f.ChromeProcesses == 0
                    ? new Check("chrome", "Chrome installed and running", Fail, $"Chrome {f.ChromeVersion} is installed but not running. The extension — and the native host it starts — only exist while Chrome is open.", "Open Chrome on this machine (the profile that has the Claude extension).")
                    : new Check("chrome", "Chrome installed and running", Pass, $"Chrome {f.ChromeVersion}, running."));

            // 2 + 3. Profiles and the extension in them.
            var with = f.Profiles.Where(p => p.ExtensionVersion is not null).ToList();
            var usable = with.Where(p => p.ExtensionEnabled != false && VersionAtLeast(p.ExtensionVersion, MinExtensionVersion)).ToList();
            var active = f.Profiles.Where(p => p.Active).ToList();
            string Names(IEnumerable<ProfileFact> ps) => string.Join(", ", ps.Select(p => $"\"{p.Name}\""));
            if (!f.ProfilesReadable)
                checks.Add(new Check("extension", "Claude extension installed and enabled", Unknown, "Chrome's profile folder could not be read, so the extension's install state is unknown.", "Check chrome://extensions by hand."));
            else if (with.Count == 0)
                checks.Add(new Check("extension", "Claude extension installed and enabled", Fail, $"None of the {f.Profiles.Count} Chrome profile(s) on this machine has the Claude extension.", "Install it from the Chrome Web Store (https://claude.ai/chrome) in the profile you keep open, then restart Chrome."));
            else if (usable.Count == 0)
            {
                var p = with[0];
                checks.Add(p.ExtensionEnabled == false
                    ? new Check("extension", "Claude extension installed and enabled", Fail, $"Installed in {Names(with)} (version {p.ExtensionVersion?.Split('_')[0]}) but {p.DisabledWhy ?? "disabled"}.", "Enable it in chrome://extensions.")
                    : new Check("extension", "Claude extension installed and enabled", Fail, $"Version {p.ExtensionVersion?.Split('_')[0]} is older than the required {MinExtensionVersion}.", "Update the extension in chrome://extensions (Developer mode → Update)."));
            }
            else
            {
                var v = usable[0].ExtensionVersion?.Split('_')[0];
                checks.Add(new Check("extension", "Claude extension installed and enabled", Pass, $"Version {v}, enabled, in profile {Names(usable)}."));
                var without = f.Profiles.Where(p => p.ExtensionVersion is null).ToList();
                if (active.Count > 0 && !active.Any(a => usable.Any(u => u.Dir == a.Dir)))
                    checks.Add(new Check("profile", "Extension is in the profile Chrome has open", Fail, $"Chrome's open profile is {Names(active)}, which does not have the extension; it is only in {Names(usable)}.", $"Open a Chrome window with profile {Names(usable)}."));
                else if (without.Count > 0)
                    // With the bridge up the profile that has it is evidently open — a note, not a
                    // warning. With the bridge down, this is the likeliest reason.
                    checks.Add(f.BridgePipe == true
                        ? new Check("profile", "Extension is in the profile Chrome has open", Pass, $"{Names(usable)} has it and is open now (the bridge is up). {Names(without)} does not have it: browser use stops if only that profile's window is open.")
                        : new Check("profile", "Extension is in the profile Chrome has open", Warn, $"{Names(usable)} has it; {Names(without)} does not. Agents can only use the browser while a window of {Names(usable)} is open.", $"Open a {Names(usable)} window, or install the extension in {Names(without)} too."));
                else
                    checks.Add(new Check("profile", "Extension is in the profile Chrome has open", Pass, $"Every profile on this machine has it ({Names(usable)})."));
            }

            // 4. The native-messaging registration Chrome uses to start the bridge.
            var h = f.Host;
            checks.Add(!h.Registered
                ? new Check("nativeHost", "Native messaging host registered", Fail, $"No {NativeHostName} under HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts. Chrome cannot start the bridge to Claude Code.", "Run `claude --chrome` once in a terminal on this machine (it writes the registration), then restart Chrome.")
                : !h.ManifestExists
                    ? new Check("nativeHost", "Native messaging host registered", Fail, $"The registry points at a manifest that does not exist: {h.ManifestPath}.", "Run `claude --chrome` once to regenerate it, then restart Chrome.")
                    : h.Error is not null
                        ? new Check("nativeHost", "Native messaging host registered", Fail, h.Error, "Run `claude --chrome` once to regenerate it, then restart Chrome.")
                        : !h.TargetExists
                            ? new Check("nativeHost", "Native messaging host registered", Fail, $"The manifest starts {h.TargetPath}, which does not exist (a moved or reinstalled Claude Code).", "Run `claude --chrome` once to regenerate it, then restart Chrome.")
                            : !h.CliExists
                                ? new Check("nativeHost", "Native messaging host registered", Fail, $"The host script starts {h.CliPath}, which does not exist (Claude Code was moved or reinstalled).", "Run `claude --chrome` once to regenerate it, then restart Chrome.")
                                : !h.AllowsExtension
                                    ? new Check("nativeHost", "Native messaging host registered", Fail, "The manifest does not allow the Claude extension's id to connect.", "Run `claude --chrome` once to regenerate it, then restart Chrome.")
                                    : new Check("nativeHost", "Native messaging host registered", Pass, $"Registered for Chrome; it starts {h.CliPath ?? h.TargetPath}."));

            // 5. Is the bridge up right now?
            checks.Add(f.BridgePipe switch
            {
                true => new Check("bridge", "Bridge to the extension is up", Pass, $"The native host is running (pipe {f.PipeName}): Chrome's extension has started it."),
                false => new Check("bridge", "Bridge to the extension is up", Fail,
                    $"No pipe {f.PipeName}: the extension has not started the native host. An agent's browser call fails right now with \"Browser extension is not connected\".",
                    f.ChromeProcesses == 0 ? "Open Chrome." : "Open a Chrome window in the profile with the extension; if it was just installed, restart Chrome; if it is open, click the extension's icon or disable and re-enable it in chrome://extensions."),
                _ => new Check("bridge", "Bridge to the extension is up", Unknown, "The pipe list could not be read.", "Run the live probe."),
            });
        }

        // 6. The CLI.
        checks.Add(f.CliPath is null
            ? new Check("cli", "Claude Code supports --chrome", Fail, "The claude CLI was not found on PATH.", "Install Claude Code on this machine.")
            : !f.CliSupportsChrome
                ? new Check("cli", "Claude Code supports --chrome", Fail, $"claude {f.CliVersion ?? "(unknown version)"} does not list --chrome.", "Update Claude Code (`claude update`).")
                : new Check("cli", "Claude Code supports --chrome", Pass, $"claude {f.CliVersion ?? ""}".Trim() + " lists --chrome."));

        // 7. Who the CLI is — Chrome integration needs the claude.ai login.
        var leaking = f.AuthOverrides.Where(v => v != StrippedAtSpawn).ToList();
        if (!f.LoggedIn)
            checks.Add(new Check("login", "Claude Code signed in with the claude.ai login", Fail, "Claude Code has no live claude.ai session on this machine.", "Run `claude` in a terminal here and `/login`."));
        else if (leaking.Count > 0)
            checks.Add(new Check("login", "Claude Code signed in with the claude.ai login", Fail,
                $"The harness process has {string.Join(", ", leaking)} set. Agent turns inherit it, the CLI then authenticates with it instead of the claude.ai login, and it keeps Chrome integration OFF even with --chrome — no error, the browser tools are simply not there.",
                $"Remove {string.Join(", ", leaking)} from the environment the harness starts in, and restart the harness."));
        else if (f.ApiKeyHelper)
            checks.Add(new Check("login", "Claude Code signed in with the claude.ai login", Fail, "~/.claude/settings.json sets apiKeyHelper: the CLI authenticates with that key and keeps Chrome integration off.", "Remove apiKeyHelper from ~/.claude/settings.json."));
        else
            checks.Add(new Check("login", "Claude Code signed in with the claude.ai login", Pass,
                $"Signed in{(f.Plan is null ? "" : $" ({f.Plan})")}{(f.Account is null ? "" : $" as {f.Account}")}."
                + (f.AuthOverrides.Contains(StrippedAtSpawn) ? $" {StrippedAtSpawn} is set but the harness removes it from every agent turn." : "")));

        // 8. What the harness cannot see — only a live answer from the extension proves it.
        var probeProves = f.Probe is { Outcome: "pass" } pp && f.Now - pp.At <= ProbeFresh.TotalMilliseconds;
        var turnProves = f.Turns.LastOkAt is long ok0 && (f.Turns.LastErrorAt is null || f.Turns.LastErrorAt < ok0);
        checks.Add(probeProves || turnProves
            ? new Check("extensionLogin", "Extension signed in to claude.ai with the same account", Pass,
                $"Proven by {(probeProves ? "the live probe" : "a real agent browser call")}: the extension answered this machine's Claude Code{(f.Account is null ? "" : $" ({f.Account})")}, which it only does for the same account.")
            : new Check("extensionLogin", "Extension signed in to claude.ai with the same account", Unknown,
                "Not visible from the harness: the extension's sign-in lives inside the browser." + (f.Account is null ? "" : $" It must be the account Claude Code uses ({f.Account}).") + " Only the live probe proves it.",
                "Open the extension's side panel in Chrome and check the account; then press Re-run."));

        // 9. The harness side.
        checks.Add(f.GateBusy
            ? new Check("harness", "Harness browser mode", Warn, $"The browser is held right now by a browser turn of \"{f.GateHolder}\"; the harness runs one at a time, so another agent's browser turn is refused until it ends.", "Wait for that turn to end, or stop it.")
            : new Check("harness", "Harness browser mode", Pass, "A turn gets --chrome when its agent's 🌐 toggle is on, on the builder lane, with the Claude engine. Nothing holds the browser right now."));

        // 10. What real agent turns saw.
        var t = f.Turns;
        if (t.LastErrorAt is long errAt && (t.LastOkAt is null || t.LastOkAt < errAt))
            checks.Add(new Check("lastTurn", "Last real agent browser call", Fail, $"{Ago(f.Now - errAt)} ago {t.LastErrorTool ?? "a browser call"} failed: {t.LastError}", "Fix the failing check above, then run the live probe."));
        else if (t.LastOkAt is long okAt)
            checks.Add(new Check("lastTurn", "Last real agent browser call", Pass, $"Answered {Ago(f.Now - okAt)} ago." + (t.LastErrorAt is long e2 ? $" (An earlier call failed {Ago(f.Now - e2)} ago.)" : "")));
        else
            checks.Add(new Check("lastTurn", "Last real agent browser call", Info, "No agent on this harness has called a browser tool since it started."));

        // 11. The end-to-end proof.
        if (f.ProbeRunning)
            checks.Add(new Check("live", "Live probe: an agent turn reaches the browser", Unknown, "Running now — one short agent turn with --chrome that calls two read-only browser tools…"));
        else if (f.Probe is null)
            checks.Add(new Check("live", "Live probe: an agent turn reaches the browser", Unknown, "Not run since the harness started. Everything above is the state of files and processes; only this proves an agent turn gets through.", "Press Re-run."));
        else
        {
            var age = f.Now - f.Probe.At;
            var stale = age > ProbeFresh.TotalMilliseconds;
            var state = f.Probe.Outcome switch { "pass" => stale ? Warn : Pass, "warn" => Warn, "fail" => Fail, _ => Unknown };
            checks.Add(new Check("live", "Live probe: an agent turn reaches the browser", state,
                $"{Ago(age)} ago ({f.Probe.TookMs / 1000} s): {f.Probe.Detail}" + (stale && f.Probe.Outcome == "pass" ? " That is old — run it again." : ""),
                f.Probe.Outcome == "pass" && !stale ? null : "Press Re-run after fixing what failed above."));
        }
        return checks;
    }

    /// <summary>ready: nothing failed and a live proof exists (the probe, or a real agent call
    /// that answered). not-ready: a check failed. degraded: nothing failed, but something is
    /// uncertain — a warning, or no live proof yet.</summary>
    public static string Overall(IReadOnlyList<Check> checks)
    {
        if (checks.Any(c => c.State == Fail)) return "not-ready";
        var proven = checks.Any(c => (c.Id == "live" || c.Id == "lastTurn") && c.State == Pass);
        if (checks.Any(c => c.State == Warn) || !proven) return "degraded";
        return "ready";
    }

    public static string Ago(long ms)
    {
        if (ms < 0) ms = 0;
        var s = ms / 1000;
        if (s < 90) return $"{s} s";
        if (s < 5400) return $"{s / 60} min";
        if (s < 172800) return $"{s / 3600} h";
        return $"{s / 86400} d";
    }
}
