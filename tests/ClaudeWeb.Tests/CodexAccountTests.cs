using System.Text;
using ClaudeWeb.Services.Accounts;
using ClaudeWeb.Services.Chat;
using Xunit;

namespace ClaudeWeb.Tests;

/// <summary>openspec codex-account-and-models: the Codex account chip's data (who the
/// login is, plan usage) and the model→engine mapping, pinned to the real shapes
/// captured on 2026-09-07 (chatgpt.com wham/usage body, auth.json id-token claims).
/// Pure — no network, no CLI.</summary>
public class CodexAccountTests
{
    // Verbatim structure of the real usage response (ids/email replaced).
    private const string RealUsageBody = """{"user_id":"user-XXXX","account_id":"acct-XXXX","email":"someone@example.invalid","plan_type":"prolite","rate_limit":{"allowed":true,"limit_reached":false,"primary_window":{"used_percent":0,"limit_window_seconds":604800,"reset_after_seconds":603053,"reset_at":1789385295},"secondary_window":null},"code_review_rate_limit":null,"additional_rate_limits":[{"limit_name":"GPT-5.3-Codex-Spark","metered_feature":"codex_bengalfox","rate_limit":{"allowed":true,"limit_reached":false,"primary_window":{"used_percent":0,"limit_window_seconds":18000,"reset_after_seconds":18000,"reset_at":1788800242},"secondary_window":{"used_percent":0,"limit_window_seconds":604800,"reset_after_seconds":604800,"reset_at":1789387042}},"normal_model_slug":null}],"model_usage":{"gpt-6-astra":{"available":true,"available_at":null,"credits_would_enable":false}},"credits":{"has_credits":false,"unlimited":false,"overage_limit_reached":false,"balance":"0","approx_local_messages":[0,0],"approx_cloud_messages":[0,0]},"spend_control":{"reached":false,"individual_limit":null},"rate_limit_reached_type":null,"promo":null,"rate_limit_reset_credits":{"available_count":0,"applicable_available_count":0}}""";

    [Fact]
    public void Usage_parses_the_real_wham_usage_body()
    {
        var u = CodexUsageService.Parse(RealUsageBody);
        Assert.True(u.Available);
        Assert.False(u.Stale);
        Assert.Equal("prolite", u.Plan);
        Assert.False(u.LimitReached);
        // This plan's primary window is the 7-day one; there is no 5-hour session window.
        Assert.Null(u.Session);
        Assert.NotNull(u.Weekly);
        Assert.Equal(0, u.Weekly!.Percent);
        Assert.Equal("normal", u.Weekly.Severity);
        Assert.StartsWith("2026-09-", u.Weekly.ResetsAt); // unix 1789385295 → ISO
        // The per-model limit contributes two labelled rows (5h + week).
        Assert.Equal(2, u.ScopedWeekly.Count);
        Assert.Contains(u.ScopedWeekly, s => s.Label == "GPT-5.3-Codex-Spark · 5h");
        Assert.Contains(u.ScopedWeekly, s => s.Label == "GPT-5.3-Codex-Spark · week");
        Assert.NotNull(u.Credits);
        Assert.False(u.Credits!.HasCredits);
        Assert.Equal("0", u.Credits.Balance);
    }

    [Fact]
    public void Usage_marks_severity_from_percent_and_limit_reached()
    {
        var warn = CodexUsageService.Parse("""{"rate_limit":{"limit_reached":false,"primary_window":{"used_percent":85,"limit_window_seconds":18000,"reset_at":1788800242}}}""");
        Assert.Equal("warn", warn.Session!.Severity);
        var crit = CodexUsageService.Parse("""{"rate_limit":{"limit_reached":true,"primary_window":{"used_percent":100,"limit_window_seconds":604800,"reset_at":1789385295}}}""");
        Assert.True(crit.LimitReached);
        Assert.Equal("critical", crit.Weekly!.Severity);
    }

    [Fact]
    public void Usage_degrades_on_garbage_or_empty()
    {
        Assert.False(CodexUsageService.Parse("not json").Available);
        Assert.False(CodexUsageService.Parse("{}").Available);
        Assert.Equal("no usage data in response", CodexUsageService.Parse("{}").Error);
    }

    private static string Jwt(string payloadJson)
    {
        static string B64(string s) => Convert.ToBase64String(Encoding.UTF8.GetBytes(s)).TrimEnd('=').Replace('+', '-').Replace('/', '_');
        return $"{B64("{\"alg\":\"RS256\"}")}.{B64(payloadJson)}.sig";
    }

    [Fact]
    public void Identity_comes_from_the_id_token_claims_only()
    {
        // The claim layout Codex's auth.json holds (2026-09-07), synthetic values.
        var idToken = Jwt("""{"email":"someone@example.invalid","email_verified":true,"name":"Some One","auth_provider":"google","https://api.openai.com/auth":{"chatgpt_account_id":"acct","chatgpt_plan_type":"prolite","chatgpt_subscription_active_until":"2026-10-07T10:54:12+00:00"},"exp":1}""");
        var auth = $$"""{"auth_mode":"chatgpt","OPENAI_API_KEY":null,"tokens":{"id_token":"{{idToken}}","access_token":"SECRET-ACCESS","refresh_token":"SECRET-REFRESH","account_id":"acct"},"last_refresh":"2026-09-07T11:16:48Z"}""";
        var id = CodexAccountService.ParseIdentity(auth);
        Assert.Equal("someone@example.invalid", id.Account);
        Assert.Equal("Some One", id.Name);
        Assert.Equal("prolite", id.PlanType);
        Assert.Equal("2026-10-07T10:54:12+00:00", id.SubscriptionUntil);
        Assert.Equal("google", id.AuthProvider);
        Assert.Equal("chatgpt", id.AuthMode);
        // Nothing secret leaks into the identity record.
        var dump = id.ToString();
        Assert.DoesNotContain("SECRET", dump);
        Assert.DoesNotContain(idToken, dump);
    }

    [Fact]
    public void Identity_is_fail_soft()
    {
        var none = CodexAccountService.ParseIdentity("{\"auth_mode\":\"apikey\"}");
        Assert.Null(none.Account);
        Assert.Equal("apikey", none.AuthMode);
        Assert.Null(CodexAccountService.ParseIdentity("garbage").Account);
        Assert.Null(CodexAccountService.ParseIdentity("{\"tokens\":{\"id_token\":\"not.a.jwt\"}}").Account);
    }

    [Fact]
    public void Plan_labels_known_slugs_and_titlecases_unknown_ones()
    {
        Assert.Equal("Pro (lite)", CodexAccountService.PlanLabel("prolite"));
        Assert.Equal("Plus", CodexAccountService.PlanLabel("plus"));
        Assert.Equal("Business", CodexAccountService.PlanLabel("team"));
        Assert.Equal("Ultra", CodexAccountService.PlanLabel("ultra"));
        Assert.Null(CodexAccountService.PlanLabel(null));
    }

    [Fact]
    public void Model_family_decides_the_engine_and_the_chat_guard_drops_mismatches()
    {
        Assert.Equal("claude", AgentProviders.ProviderOfModel("claude-fable-5-1"));
        Assert.Equal("codex", AgentProviders.ProviderOfModel("gpt-6-astra"));
        Assert.Equal("codex", AgentProviders.ProviderOfModel("gpt-5.4-mini"));
        Assert.Equal("codex", AgentProviders.ProviderOfModel("o4-mini"));
        Assert.Null(AgentProviders.ProviderOfModel("llama-3"));
        Assert.Null(AgentProviders.ProviderOfModel(null));

        Assert.True(AgentProviders.ModelBelongsTo("codex", "gpt-6-astra"));
        Assert.False(AgentProviders.ModelBelongsTo("codex", "claude-fable-5-1")); // the bug the guard prevents
        Assert.False(AgentProviders.ModelBelongsTo("claude", "gpt-5.6"));
        Assert.True(AgentProviders.ModelBelongsTo("claude", null));
        Assert.True(AgentProviders.ModelBelongsTo("codex", "mystery")); // unknown family: the CLI decides
    }
}
