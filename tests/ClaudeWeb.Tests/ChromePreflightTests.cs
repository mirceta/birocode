using System.Text.Json;
using ClaudeWeb.Services.Chat;
using Xunit;
using static ClaudeWeb.Services.Chat.ChromePreflightRules;

namespace ClaudeWeb.Tests;

/// <summary>The rules of the Claude-for-Chrome preflight (openspec chrome-readiness-preflight).
/// The probe samples are the shapes the real CLI (2.1.289) printed on the hub.</summary>
public class ChromePreflightTests
{
    // ---- a healthy machine, and one change at a time --------------------------------------

    private static readonly HostFact GoodHost = new(true, @"C:\m\host.json", true, @"C:\u\.claude\chrome\chrome-native-host.bat", true, @"C:\u\.local\bin\claude.exe", true, true, null);
    private static readonly ProfileFact Default = new("Default", "Work", true, "1.0.98_0", true, null);
    private static readonly ProfileFact Second = new("Profile 2", "Home", false, null, null, null);
    private const long T0 = 1_800_000_000_000;

    private static Facts Healthy(ProbeResult? probe = null) => new(
        Windows: true, ChromePath: @"C:\Program Files\Google\Chrome\Application\chrome.exe", ChromeVersion: "154.0.8037.97", ChromeProcesses: 24,
        ProfilesReadable: true, Profiles: new[] { Default }, Host: GoodHost, BridgePipe: true, PipeName: "claude-mcp-browser-bridge-km",
        CliPath: @"C:\u\.local\bin\claude.exe", CliVersion: "2.1.289", CliSupportsChrome: true,
        LoggedIn: true, Plan: "Max", Account: "k@example.com", AuthOverrides: Array.Empty<string>(), ApiKeyHelper: false,
        GateBusy: false, GateHolder: null, Turns: new TurnFact(null, null, null, null), Probe: probe, ProbeRunning: false, Now: T0);

    private static ProbeResult PassedProbe(long at = T0 - 60_000) =>
        new(at, 27_000, "pass", "An agent turn reached the extension.", true, 22, new[] { new ProbeBrowser("Browser 1", "Windows", true) }, true);

    private static Check Of(IReadOnlyList<Check> checks, string id) => checks.Single(c => c.Id == id);

    [Fact]
    public void Everything_in_place_but_never_probed_is_degraded_not_ready()
    {
        var checks = Evaluate(Healthy());
        Assert.DoesNotContain(checks, c => c.State == Fail);
        Assert.Equal(Unknown, Of(checks, "live").State);
        Assert.Equal("degraded", Overall(checks));          // "installed" alone is not "usable"
    }

    [Fact]
    public void A_passed_live_probe_makes_it_ready()
    {
        var checks = Evaluate(Healthy(PassedProbe()));
        Assert.Equal(Pass, Of(checks, "live").State);
        Assert.Equal("ready", Overall(checks));
    }

    [Fact]
    public void A_real_agent_call_that_answered_is_proof_too()
    {
        var checks = Evaluate(Healthy() with { Turns = new TurnFact(T0 - 30_000, null, null, null) });
        Assert.Equal(Pass, Of(checks, "lastTurn").State);
        Assert.Equal("ready", Overall(checks));
    }

    [Fact]
    public void What_the_harness_cannot_see_is_unknown_until_a_live_answer_proves_it()
    {
        var before = Of(Evaluate(Healthy()), "extensionLogin");
        Assert.Equal(Unknown, before.State);                       // never green on files alone
        Assert.Contains("k@example.com", before.Detail);
        Assert.Equal(Pass, Of(Evaluate(Healthy(PassedProbe())), "extensionLogin").State);
        Assert.Equal(Pass, Of(Evaluate(Healthy() with { Turns = new TurnFact(T0 - 5_000, null, null, null) }), "extensionLogin").State);
        var failedSince = Healthy() with { Turns = new TurnFact(T0 - 600_000, T0 - 5_000, "Browser extension is not connected.", "navigate") };
        Assert.Equal(Unknown, Of(Evaluate(failedSince), "extensionLogin").State);
    }

    [Fact]
    public void No_agent_browser_call_yet_is_information_not_a_verdict()
    {
        var checks = Evaluate(Healthy(PassedProbe()));
        Assert.Equal(Info, Of(checks, "lastTurn").State);
        Assert.Equal("ready", Overall(checks));
    }

    [Fact]
    public void Chrome_closed_fails_chrome_and_the_bridge()
    {
        var checks = Evaluate(Healthy() with { ChromeProcesses = 0, BridgePipe = false });
        Assert.Equal(Fail, Of(checks, "chrome").State);
        Assert.Equal(Fail, Of(checks, "bridge").State);
        Assert.Equal("Open Chrome.", Of(checks, "bridge").Fix);
        Assert.Equal("not-ready", Overall(checks));
    }

    [Fact]
    public void Chrome_open_but_the_local_host_down_is_a_repairable_warning_not_a_failure()
    {
        // Verified on the hub: with the native host stopped a turn still got through over the
        // extension's cloud connection, and the extension does not restart the host by itself.
        var checks = Evaluate(Healthy(PassedProbe()) with { BridgePipe = false });
        var c = Of(checks, "bridge");
        Assert.Equal(Warn, c.State);
        Assert.Contains("cloud connection", c.Detail);
        Assert.Contains("Browser extension is not connected", c.Detail);   // what the agent sees when that fails too
        Assert.Equal(RepairAuto, c.Repair);
        Assert.Equal("degraded", Overall(checks));
        Assert.Equal(new[] { StepReconnect }, RepairSteps(checks));
        Assert.Empty(TurnBlockers(checks));                               // nothing to tell the turn: the harness fixes it
    }

    [Fact]
    public void Extension_missing_everywhere()
    {
        var checks = Evaluate(Healthy() with { Profiles = new[] { Second } });
        Assert.Equal(Fail, Of(checks, "extension").State);
        Assert.Contains("claude.ai/chrome", Of(checks, "extension").Fix);
    }

    [Fact]
    public void Extension_disabled_and_extension_too_old()
    {
        var disabled = Evaluate(Healthy() with { Profiles = new[] { Default with { ExtensionEnabled = false, DisabledWhy = "switched off in chrome://extensions" } } });
        Assert.Equal(Fail, Of(disabled, "extension").State);
        Assert.Contains("switched off", Of(disabled, "extension").Detail);
        var old = Evaluate(Healthy() with { Profiles = new[] { Default with { ExtensionVersion = "1.0.30_0" } } });
        Assert.Equal(Fail, Of(old, "extension").State);
        Assert.Contains(MinExtensionVersion, Of(old, "extension").Detail);
    }

    [Fact]
    public void A_second_profile_without_the_extension_is_a_warning_and_the_open_one_without_it_a_failure()
    {
        var both = Evaluate(Healthy(PassedProbe()) with { Profiles = new[] { Default, Second } });
        Assert.Equal(Pass, Of(both, "profile").State);             // the bridge is up: the right profile is evidently open
        Assert.Contains("\"Home\"", Of(both, "profile").Detail);
        Assert.Equal("ready", Overall(both));
        var bridgeDown = Evaluate(Healthy() with { Profiles = new[] { Default, Second }, BridgePipe = false });
        Assert.Equal(Warn, Of(bridgeDown, "profile").State);       // and now it is the likeliest reason

        var wrongOpen = Evaluate(Healthy() with { Profiles = new[] { Default with { Active = false }, Second with { Active = true } } });
        Assert.Equal(Fail, Of(wrongOpen, "profile").State);
        Assert.Contains("\"Work\"", Of(wrongOpen, "profile").Fix);
    }

    [Theory]
    [InlineData(false, true, true, true, true, "No com.anthropic.claude_code_browser_extension")]
    [InlineData(true, false, true, true, true, "manifest that does not exist")]
    [InlineData(true, true, false, true, true, "which does not exist")]
    [InlineData(true, true, true, false, true, "moved or reinstalled")]
    [InlineData(true, true, true, true, false, "does not allow the Claude extension")]
    public void A_broken_native_host_registration_names_the_broken_link(bool registered, bool manifest, bool target, bool cli, bool allows, string expected)
    {
        var host = new HostFact(registered, @"C:\m\host.json", manifest, @"C:\x\host.bat", target, @"C:\x\claude.exe", cli, allows, null);
        var c = Of(Evaluate(Healthy() with { Host = host }), "nativeHost");
        Assert.Equal(Fail, c.State);
        Assert.Contains(expected, c.Detail);
        Assert.Contains("claude --chrome", c.Fix);
    }

    [Fact]
    public void An_auth_override_is_removed_from_browser_turns_when_a_claude_ai_login_exists()
    {
        var c = Of(Evaluate(Healthy() with { AuthOverrides = new[] { "CLAUDE_CODE_OAUTH_TOKEN" } }), "login");
        Assert.Equal(Pass, c.State);                                       // the harness repairs this one at every spawn
        Assert.Contains("CLAUDE_CODE_OAUTH_TOKEN", c.Detail);
        Assert.Contains("removes it from every browser turn", c.Detail);
        Assert.Contains("CLAUDE_CODE_OAUTH_TOKEN", BrowserTurnStrips(claudeAiLogin: true));
        Assert.Contains("ANTHROPIC_API_KEY", BrowserTurnStrips(claudeAiLogin: true));
    }

    [Fact]
    public void Without_a_claude_ai_login_the_overrides_stay_and_the_login_check_fails_naming_them()
    {
        // Removing the turn's only credential would break it outright.
        Assert.Equal(new[] { "ANTHROPIC_API_KEY" }, BrowserTurnStrips(claudeAiLogin: false));
        var c = Of(Evaluate(Healthy() with { LoggedIn = false, AuthOverrides = new[] { "CLAUDE_CODE_OAUTH_TOKEN" } }), "login");
        Assert.Equal(Fail, c.State);
        Assert.Contains("CLAUDE_CODE_OAUTH_TOKEN", c.Detail);
        Assert.Null(c.Repair);
        Assert.Contains(TurnBlockers(Evaluate(Healthy() with { LoggedIn = false })), b => b.Id == "login");   // told to the turn up front
    }

    // ---- repair ---------------------------------------------------------------------------

    [Fact]
    public void A_healthy_machine_needs_no_repair()
    {
        var checks = Evaluate(Healthy(PassedProbe()));
        Assert.Empty(RepairSteps(checks));
        Assert.Empty(TurnBlockers(checks));
        Assert.DoesNotContain(checks, c => c.Repair is not null);
    }

    [Fact]
    public void Chrome_closed_is_repaired_by_starting_it()
    {
        var checks = Evaluate(Healthy() with { ChromeProcesses = 0, BridgePipe = false });
        Assert.Equal(RepairAuto, Of(checks, "chrome").Repair);
        Assert.Equal(new[] { StepReconnect }, RepairSteps(checks));        // the reconnect address also starts Chrome
        Assert.Empty(TurnBlockers(checks));
    }

    [Fact]
    public void A_broken_registration_is_rewritten_first_and_then_the_extension_is_asked_to_reconnect()
    {
        var host = new HostFact(true, @"C:\m\host.json", true, @"C:\x\host.bat", true, @"C:\gone\claude.exe", false, true, null);
        var checks = Evaluate(Healthy() with { Host = host, BridgePipe = false });
        Assert.Equal(RepairAuto, Of(checks, "nativeHost").Repair);
        Assert.Equal(new[] { StepRegenHost, StepReconnect }, RepairSteps(checks));
        var noCli = Evaluate(Healthy() with { Host = host, CliPath = null, CliSupportsChrome = false });
        Assert.Null(Of(noCli, "nativeHost").Repair);                       // nothing can rewrite it without the CLI
    }

    [Fact]
    public void What_only_the_Operator_can_fix_opens_the_right_page_and_blocks_the_turn_notice()
    {
        var missing = Evaluate(Healthy() with { Profiles = new[] { Second } });
        Assert.Equal(RepairOpenStore, Of(missing, "extension").Repair);
        Assert.Equal("extension", Assert.Single(TurnBlockers(missing)).Id);

        var disabled = Evaluate(Healthy() with { Profiles = new[] { Default with { ExtensionEnabled = false, DisabledWhy = "switched off in chrome://extensions" } } });
        Assert.Equal(RepairOpenExtensions, Of(disabled, "extension").Repair);

        Assert.Equal(RepairOpenSignIn, Of(Evaluate(Healthy()), "extensionLogin").Repair);
        Assert.Null(Of(Evaluate(Healthy(PassedProbe())), "extensionLogin").Repair);   // proven: nothing to open
    }

    [Fact]
    public void The_open_profile_without_the_extension_is_repaired_by_opening_the_one_that_has_it()
    {
        var profiles = new[] { Default with { Active = false }, Second with { Active = true } };
        var checks = Evaluate(Healthy() with { Profiles = profiles, BridgePipe = false });
        Assert.Equal(RepairAuto, Of(checks, "profile").Repair);
        Assert.Equal("Default", PreferredProfile(profiles));               // the one with the extension, not the open one
        Assert.Equal("Profile 2", PreferredProfile(new[] { Second with { Active = true } }));
        Assert.Null(PreferredProfile(Array.Empty<ProfileFact>()));
    }

    [Fact]
    public void A_failed_probe_or_a_failed_real_call_is_never_a_turn_blocker_by_itself()
    {
        var failedProbe = Evaluate(Healthy(new ProbeResult(T0 - 5_000, 20_000, "fail", "The extension did not answer.", true, 22, Array.Empty<ProbeBrowser>(), false)));
        Assert.Empty(TurnBlockers(failedProbe));                           // the turn is the next proof
    }

    [Fact]
    public void The_api_key_the_harness_strips_is_noted_but_passes()
    {
        var c = Of(Evaluate(Healthy() with { AuthOverrides = new[] { "ANTHROPIC_API_KEY" } }), "login");
        Assert.Equal(Pass, c.State);
        Assert.Contains("removes it", c.Detail);
    }

    [Fact]
    public void Not_signed_in_and_api_key_helper_fail_the_login_check()
    {
        Assert.Equal(Fail, Of(Evaluate(Healthy() with { LoggedIn = false }), "login").State);
        Assert.Contains("apiKeyHelper", Of(Evaluate(Healthy() with { ApiKeyHelper = true }), "login").Detail);
    }

    [Fact]
    public void A_real_connection_failure_newer_than_the_last_success_fails_and_an_older_one_does_not()
    {
        var failing = Evaluate(Healthy() with { Turns = new TurnFact(T0 - 600_000, T0 - 60_000, "Browser extension is not connected.", "tabs_context_mcp") });
        Assert.Equal(Fail, Of(failing, "lastTurn").State);
        Assert.Contains("tabs_context_mcp", Of(failing, "lastTurn").Detail);
        var recovered = Evaluate(Healthy() with { Turns = new TurnFact(T0 - 60_000, T0 - 600_000, "Browser extension is not connected.", "tabs_context_mcp") });
        Assert.Equal(Pass, Of(recovered, "lastTurn").State);
    }

    [Fact]
    public void A_failed_probe_is_not_ready_and_an_old_pass_is_only_a_warning()
    {
        var failed = Evaluate(Healthy(new ProbeResult(T0 - 5_000, 20_000, "fail", "The extension did not answer.", true, 22, Array.Empty<ProbeBrowser>(), false)));
        Assert.Equal("not-ready", Overall(failed));
        var stale = Evaluate(Healthy(PassedProbe(T0 - (long)ProbeFresh.TotalMilliseconds - 1_000)));
        Assert.Equal(Warn, Of(stale, "live").State);
        Assert.Equal("degraded", Overall(stale));
    }

    [Fact]
    public void A_held_browser_is_a_warning_naming_the_holder()
    {
        var c = Of(Evaluate(Healthy(PassedProbe()) with { GateBusy = true, GateHolder = "pers-dec" }), "harness");
        Assert.Equal(Warn, c.State);
        Assert.Contains("pers-dec", c.Detail);
    }

    [Fact]
    public void Off_windows_the_static_checks_say_they_cannot_tell()
    {
        var checks = Evaluate(Healthy() with { Windows = false });
        Assert.Equal(Unknown, Of(checks, "platform").State);
        Assert.DoesNotContain(checks, c => c.Id is "chrome" or "nativeHost" or "bridge");
    }

    // ---- parsing ---------------------------------------------------------------------------

    [Theory]
    [InlineData("1.0.98_0", "1.0.36", true)]
    [InlineData("1.0.36", "1.0.36", true)]
    [InlineData("1.0.35_1", "1.0.36", false)]
    [InlineData("1.1", "1.0.36", true)]
    [InlineData("", "1.0.36", false)]
    [InlineData(null, "1.0.36", false)]
    public void Extension_versions_compare_numerically(string? have, string need, bool expected)
        => Assert.Equal(expected, VersionAtLeast(have, need));

    private static JsonElement Prefs(string entry) =>
        JsonDocument.Parse("{\"extensions\":{\"settings\":{\"" + ExtensionId + "\":" + entry + "}}}").RootElement;

    [Fact]
    public void Extension_entry_enabled_disabled_and_absent()
    {
        Assert.Equal((true, (string?)null), ExtensionEntry(Prefs("{\"disable_reasons\":[],\"location\":1}")));
        Assert.False(ExtensionEntry(Prefs("{\"disable_reasons\":[1]}"))!.Value.Enabled);        // current Chrome: a list
        Assert.False(ExtensionEntry(Prefs("{\"disable_reasons\":8192}"))!.Value.Enabled);       // older Chrome: a bitmask
        Assert.False(ExtensionEntry(Prefs("{\"state\":0}"))!.Value.Enabled);
        Assert.True(ExtensionEntry(Prefs("{\"state\":1}"))!.Value.Enabled);
        Assert.Null(ExtensionEntry(JsonDocument.Parse("{\"extensions\":{\"settings\":{}}}").RootElement));
        Assert.Null(ExtensionEntry(JsonDocument.Parse("{}").RootElement));
    }

    [Fact]
    public void Host_manifest_and_its_wrapper_script()
    {
        var m = ParseHostManifest("{\"name\":\"com.anthropic.claude_code_browser_extension\",\"path\":\"C:\\\\Users\\\\km\\\\.claude\\\\chrome\\\\chrome-native-host.bat\",\"type\":\"stdio\",\"allowed_origins\":[\"chrome-extension://fcoeoabgfenejglbffodgkkbkcdhcgfn/\"]}");
        Assert.Equal(@"C:\Users\km\.claude\chrome\chrome-native-host.bat", m!.Value.Path);
        Assert.True(m.Value.AllowsExtension);
        Assert.False(ParseHostManifest("{\"path\":\"x\",\"allowed_origins\":[\"chrome-extension://someoneelse/\"]}")!.Value.AllowsExtension);
        Assert.Null(ParseHostManifest("not json"));
        Assert.Equal(@"C:\Users\km\.local\bin\claude.exe",
            WrapperTarget("@echo off\r\nREM Chrome native host wrapper script\r\n\"C:\\Users\\km\\.local\\bin\\claude.exe\" \"--chrome-native-host\"\r\n"));
        Assert.Null(WrapperTarget("@echo off\r\necho nothing here\r\n"));
    }

    [Theory]
    [InlineData("Browser extension is not connected. Please ensure the Claude browser extension is installed and running (https://claude.ai/chrome), and that you are logged into claude.ai with the same account as Claude Code.", true)]
    [InlineData("Error: Could not establish connection. Receiving end does not exist.", true)]
    [InlineData("actions[0] (form_input) failed: No element found with reference: \"ref_267\".", false)]   // a page error, not the bridge
    [InlineData("No tab group exists for this session. Use createIfEmpty: true to create one.", false)]
    [InlineData("", false)]
    public void Only_bridge_failures_count_as_connection_errors(string text, bool expected)
        => Assert.Equal(expected, IsConnectionError(text));

    // ---- the probe turn, as the CLI really printed it --------------------------------------

    private const string InitOk = "{\"type\":\"system\",\"subtype\":\"init\",\"apiKeySource\":\"none\",\"mcp_servers\":[{\"name\":\"claude-in-chrome\",\"status\":\"connected\",\"source\":\"dynamic\"},{\"name\":\"claude.ai Gmail\",\"status\":\"needs-auth\"}],\"tools\":[\"Bash\",\"mcp__claude-in-chrome__list_connected_browsers\",\"mcp__claude-in-chrome__tabs_context_mcp\",\"mcp__claude-in-chrome__navigate\"]}";
    private const string Calls = "{\"type\":\"assistant\",\"message\":{\"content\":[{\"type\":\"tool_use\",\"id\":\"t1\",\"name\":\"mcp__claude-in-chrome__list_connected_browsers\",\"input\":{}},{\"type\":\"tool_use\",\"id\":\"t2\",\"name\":\"mcp__claude-in-chrome__tabs_context_mcp\",\"input\":{}}]}}";
    private static string Result(string id, string text) =>
        "{\"type\":\"user\",\"message\":{\"content\":[{\"type\":\"tool_result\",\"tool_use_id\":\"" + id + "\",\"content\":[{\"type\":\"text\",\"text\":" + JsonSerializer.Serialize(text) + "}]}]}}";
    private const string Done = "{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":false,\"result\":\"DONE\"}";
    private const string NotConnected = "Browser extension is not connected. Please ensure the Claude browser extension is installed and running (https://claude.ai/chrome), and that you are logged into claude.ai with the same account as Claude Code. If this is your first time connecting to Chrome, you may need to restart Chrome for the installation to take effect.";

    [Fact]
    public void Probe_that_reached_the_extension_passes()
    {
        var r = ParseProbe(new[]
        {
            InitOk, Calls,
            Result("t1", "[{\"deviceId\":\"0d7c\",\"name\":\"Browser 1\",\"osPlatform\":\"Windows\",\"connectedAt\":1791232735158,\"isLocal\":true,\"inUse\":true}]"),
            Result("t2", "No tab group exists for this session. Use createIfEmpty: true to create one."),
            Done,
        }, T0, 27_000);
        Assert.Equal("pass", r.Outcome);
        Assert.True(r.ServerListed);
        Assert.Equal(3, r.ToolCount);
        Assert.Equal("Browser 1", Assert.Single(r.Browsers).Name);
        Assert.True(r.Browsers[0].Local);
        Assert.True(r.ReachedExtension);
        Assert.Contains("this machine", r.Detail);
    }

    [Fact]
    public void Probe_with_another_auth_source_is_never_offered_the_browser_tools()
    {
        // Reproduced on the hub: ANTHROPIC_API_KEY (and CLAUDE_CODE_OAUTH_TOKEN) set, --chrome passed.
        var r = ParseProbe(new[]
        {
            "{\"type\":\"system\",\"subtype\":\"init\",\"apiKeySource\":\"ANTHROPIC_API_KEY\",\"mcp_servers\":[],\"tools\":[\"Bash\",\"Read\"]}",
            "{\"type\":\"result\",\"subtype\":\"success\",\"is_error\":true,\"result\":\"Failed to authenticate. API Error: 401 API key is invalid.\"}",
        }, T0, 3_000);
        Assert.Equal("fail", r.Outcome);
        Assert.False(r.ServerListed);
        Assert.Contains("NOT offered the browser tools", r.Detail);
        Assert.Contains("ANTHROPIC_API_KEY", r.Detail);
        Assert.Contains("401", r.Detail);
    }

    [Fact]
    public void Probe_whose_tools_answer_not_connected_fails_with_the_extensions_own_words()
    {
        var r = ParseProbe(new[] { InitOk, Calls, Result("t1", NotConnected), Result("t2", NotConnected), Done }, T0, 20_000);
        Assert.Equal("fail", r.Outcome);
        Assert.True(r.ServerListed);            // the tools were there — "connected" in init proves nothing
        Assert.Contains("Browser extension is not connected", r.Detail);
        Assert.False(r.ReachedExtension);
    }

    [Fact]
    public void Probe_with_no_connected_browser_fails()
    {
        var r = ParseProbe(new[] { InitOk, Calls, Result("t1", "[]"), Result("t2", NotConnected), Done }, T0, 20_000);
        Assert.Equal("fail", r.Outcome);
    }

    [Fact]
    public void Probe_that_timed_out_could_not_start_or_called_nothing_is_an_error_not_a_pass()
    {
        Assert.Equal("error", ParseProbe(Array.Empty<string>(), T0, 150_000, timedOut: true).Outcome);
        Assert.Contains("could not be started", ParseProbe(Array.Empty<string>(), T0, 5, launchError: "file not found").Detail);
        Assert.Equal("error", ParseProbe(new[] { InitOk, Done }, T0, 9_000).Outcome);
    }

    // ---- the passive observer --------------------------------------------------------------

    [Fact]
    public void Observer_records_answers_and_connection_failures_of_browser_tools_only()
    {
        ChromeTurnObserver.ResetForTests();
        ChromeTurnObserver.ToolStarted("a", "Bash");
        ChromeTurnObserver.ToolFinished("a", false, "Browser extension is not connected");        // not a browser tool: ignored
        Assert.Null(ChromeTurnObserver.Current().LastErrorAt);

        ChromeTurnObserver.ToolStarted("b", "mcp__claude-in-chrome__tabs_context_mcp");
        ChromeTurnObserver.ToolFinished("b", true, NotConnected);
        var failed = ChromeTurnObserver.Current();
        Assert.NotNull(failed.LastErrorAt);
        Assert.Equal("tabs_context_mcp", failed.LastErrorTool);
        Assert.Null(failed.LastOkAt);

        ChromeTurnObserver.ToolStarted("c", "mcp__claude-in-chrome__navigate");
        ChromeTurnObserver.ToolFinished("c", false, "No element found with reference");           // a page error: neither proof nor bridge failure
        Assert.Null(ChromeTurnObserver.Current().LastOkAt);

        ChromeTurnObserver.ToolStarted("d", "mcp__claude-in-chrome__navigate");
        ChromeTurnObserver.ToolFinished("d", true, "Navigated");
        Assert.NotNull(ChromeTurnObserver.Current().LastOkAt);
        ChromeTurnObserver.ResetForTests();
    }

    [Theory]
    [InlineData(45_000, "45 s")]
    [InlineData(600_000, "10 min")]
    [InlineData(3 * 3600_000, "3 h")]
    [InlineData(3 * 86400_000L, "3 d")]
    public void Ages_read_like_a_person_would_say_them(long ms, string expected) => Assert.Equal(expected, Ago(ms));
}
