namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The slice of the arch's knowledge of the fleet that the policeman loop needs (openspec
/// one-policeman): resolve an assignee to a machine and repo, find its GitHub remote, label it,
/// read the last words of its conversation (local or on a peer), and hand it the Operator's
/// answer. <see cref="ArchAgentService"/> implements it; the policeman depends on this, never on
/// the service.
/// </summary>
public interface IAgentDirectory
{
    ArchAgentService.AgentRef ResolveAgent(string? machine, string? repoRef);
    /// <summary>The GitHub <c>owner/repo</c> of a managed agent's remote — or a refusal (not managed,
    /// not reported) the caller returns as-is.</summary>
    GitHubRemoteLookup GitHubRemoteOf(ArchAgentService.AgentRef agent);
    string AgentLabel(string? sourceId, string repoId);
    void AuditTool(string tool, string? repoKey, string outcome);
    /// <summary>The last <paramref name="tail"/> messages of an assignee's conversation, oldest
    /// first — or null with the refusal (not managed, claimed by the Operator, peer unreachable).</summary>
    (IReadOnlyList<AgentMessage>? Messages, string? Refusal) ReadTranscript(string? sourceId, string repoId, int tail);
    /// <summary>Put the Operator's words into an assignee's conversation (the answer to a 🆘).</summary>
    ArchAgentService.ToolOutcome SendToAgent(string? sourceId, string repoId, string text);
}

public sealed record GitHubRemoteLookup(string? OwnerRepo, string? RemoteUrl, string Label, string AuditKey, ArchAgentService.ToolOutcome? Refusal);

/// <summary>One message of an agent's conversation as the policeman reads it.</summary>
public sealed record AgentMessage(string Role, string Text, long? At);
