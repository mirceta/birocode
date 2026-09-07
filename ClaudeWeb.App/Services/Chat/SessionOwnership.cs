namespace ClaudeWeb.Services.Chat;

/// <summary>
/// Which engine a conversation id belongs to (openspec codex-account-and-models).
/// A Claude session id and a Codex thread id are both UUIDs, so the id alone says
/// nothing; the CLIs' own stores do: Claude keeps
/// <c>~/.claude/projects/&lt;encoded cwd&gt;/&lt;id&gt;.jsonl</c>, Codex keeps
/// <c>&lt;CODEX_HOME&gt;/sessions/yyyy/MM/dd/rollout-…-&lt;id&gt;.jsonl</c>. When a repo's
/// engine is switched under a live conversation, resuming the other engine's id would
/// fail ("no rollout found" / "No conversation found"); the chat path uses this to
/// start a fresh conversation on the new engine instead.
/// </summary>
public static class SessionOwnership
{
    /// <summary>True when <paramref name="sessionId"/> may be resumed on
    /// <paramref name="provider"/>: the id is found in that engine's store. An empty
    /// id is "new conversation" and always fine.</summary>
    public static bool BelongsTo(string provider, string? sessionId, string workingDirectory, string? codexHome = null)
    {
        if (string.IsNullOrWhiteSpace(sessionId)) return true;
        if (sessionId.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0) return false;
        return AgentProviders.Normalize(provider) == AgentProviders.Codex
            ? IsCodexThread(codexHome ?? Accounts.CodexAccountService.CodexHome(), sessionId)
            : IsClaudeSession(SessionService.ProjectsDirectoryFor(workingDirectory), sessionId);
    }

    /// <summary>A Claude transcript exists for the id in the repo's project folder.</summary>
    public static bool IsClaudeSession(string projectsDirectory, string sessionId)
    {
        try { return File.Exists(Path.Combine(projectsDirectory, sessionId + ".jsonl")); }
        catch { return false; }
    }

    /// <summary>A Codex rollout file named after the thread id exists under
    /// <c>&lt;home&gt;/sessions</c> (date-partitioned; searched recursively).</summary>
    public static bool IsCodexThread(string codexHome, string threadId)
    {
        try
        {
            var dir = Path.Combine(codexHome, "sessions");
            if (!Directory.Exists(dir)) return false;
            return Directory.EnumerateFiles(dir, $"*{threadId}*.jsonl", SearchOption.AllDirectories).Any();
        }
        catch { return false; }
    }
}
