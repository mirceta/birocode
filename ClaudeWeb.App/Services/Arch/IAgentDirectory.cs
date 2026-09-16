namespace ClaudeWeb.Services.Arch;

/// <summary>
/// The slice of the arch's knowledge of the fleet that a tool needs to name an agent: resolve a
/// handle / repo id / name to a machine and repo, find a managed agent's GitHub remote, label an
/// assignee, and audit a call. <see cref="ArchAgentService"/> implements it; tool classes depend
/// on this, never on the service.
/// </summary>
public interface IAgentDirectory
{
    ArchAgentService.AgentRef ResolveAgent(string? machine, string? repoRef);
    /// <summary>The GitHub <c>owner/repo</c> of a managed agent's remote — or a refusal (not managed,
    /// not reported) the caller returns as-is.</summary>
    GitHubRemoteLookup GitHubRemoteOf(ArchAgentService.AgentRef agent);
    string AgentLabel(string? sourceId, string repoId);
    void AuditTool(string tool, string? repoKey, string outcome);
}

public sealed record GitHubRemoteLookup(string? OwnerRepo, string? RemoteUrl, string Label, string AuditKey, ArchAgentService.ToolOutcome? Refusal);
