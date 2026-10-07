using System.Text.Json;
using ClaudeWeb.Services.Events;

namespace ClaudeWeb.Services.Arch;

/// <summary>
/// Repo-agent provisioning (openspec provision-repo-agent): the hub side of "we need a
/// new repo agent &lt;name&gt; on &lt;machine&gt; for &lt;url&gt;". One arch tool,
/// <c>provision_repo_agent</c>, in the style of <c>upgrade_peer</c>: for <c>self</c> it
/// runs the local <see cref="RepoProvisionService"/>; for a peer it goes over the fleet
/// channel to <c>POST /api/arch/peer/provision</c>, gated like upgrades by the peer's own
/// "accept fleet provisioning" opt-in, and when the peer answers the new agent is added to
/// THIS hub's scope. The reply carries the resulting <c>list_agents</c> row so the arch can
/// report the handle back and dispatch to it at once.
/// </summary>
public partial class ArchAgentService
{
    public const string ToolProvision = "provision_repo_agent";

    /// <summary>Receiving-side opt-in: does THIS harness let a fleet arch elsewhere
    /// provision a repo agent here (clone + register + dock + scope)?</summary>
    public bool AcceptFleetProvisioning => _state.AcceptFleetProvisioning;

    public void SetAcceptFleetProvisioning(bool accept)
    {
        _state.SetAcceptFleetProvisioning(accept);
        _logger.Info($"[ARCH] accept fleet provisioning -> {(accept ? "on" : "off")}");
    }

    public ToolOutcome ToolProvisionRepoAgent(string? machine, string? url, string? name, string? parentFolder, string? defaultBranch) =>
        ProvisionRepoAgent(machine, url, name, parentFolder, defaultBranch, requireArmed: true);

    /// <summary>Pure posture check before dialling a peer (unit-tested): null = go.</summary>
    public static (string Status, string Reason)? ProvisionPosture(string peerStatus, bool acceptsProvisioning)
    {
        if (peerStatus != FleetClient.StatusOk) return (peerStatus, "the peer is not reachable with the peer API");
        if (!acceptsProvisioning) return ("not-accepting", "its operator has not enabled accept fleet provisioning (Arch tab, next to accept fleet sends / upgrades)");
        return null;
    }

    /// <summary>The whole provisioning from the hub's point of view. <paramref name="requireArmed"/>
    /// is the arch tool's rule (an armed loop, as for every send); the dashboard's button
    /// passes false — the Operator is the actor there.</summary>
    public ToolOutcome ProvisionRepoAgent(string? machine, string? url, string? name, string? parentFolder, string? defaultBranch, bool requireArmed)
    {
        if (string.IsNullOrWhiteSpace(url)) return new ToolOutcome(false, "error", "url is required (the repository's clone URL); nothing was done");
        if (_provision is null) return new ToolOutcome(false, "error", "provisioning is not wired on this build");
        var target = ResolveMachine(machine);
        if (target.Error is not null) return new ToolOutcome(false, "error", target.Error + "; nothing was done");
        var requestedBy = requireArmed ? "arch" : "operator";

        if (target.IsSelf)
        {
            if (!_gate.Enabled)
            {
                AuditTool(ToolProvision, null, "not-accepting");
                return new ToolOutcome(false, "not-accepting", $"{SelfLabel}'s autopilot gate is closed by its operator; nothing was done");
            }
            var local = _provision.Provision(requestedBy, url, name, parentFolder, defaultBranch);
            var localData = local.Data as RepoProvisionService.Result;
            AuditTool(ToolProvision, localData?.RepoId, local.Status);
            if (!local.Ok || localData is null) return local;
            RefreshAgentSnapshot();   // the Status tab and the describe see the agent now, not on the next pass
            var (row, view) = AgentRowFor(CollectorService.SelfId, localData.RepoId, refreshPeers: false);
            _logger.Info($"[ARCH] {ToolProvision} self -> {local.Status}: {localData.Name} ({Handles.AgentLabel(SelfLabel, localData.Handle)})");
            return new ToolOutcome(true, local.Status, $"{local.Detail}; in this hub's scope; {ReadyLine(view)}",
                new { machine = SelfLabel, sourceId = CollectorService.SelfId, repoId = localData.RepoId, key = localData.RepoId, handle = Handles.AgentLabel(SelfLabel, localData.Handle), addedToHubScope = localData.Steps.Any(s => s.Name == "scope" && s.Status == "done"), provisioned = localData, agent = row });
        }

        var src = target.Source!;
        if (requireArmed && ArmedOrRefusal(src.Id, out _, ToolProvision) is { } refusal) return refusal;
        if (!src.AllowSends)
        {
            AuditTool(ToolProvision, src.Id, "sends-not-allowed");
            return new ToolOutcome(false, "error", $"the operator has not allowed sends to {src.Label} (allow sends first); nothing was sent");
        }
        // A forced describe, not the 5 s cache: the peer's operator may have just opted in.
        var snap = _fleet.Refresh(src.Id);
        var posture = ProvisionPosture(snap.Status, snap.Info?.AcceptsProvisioning ?? false);
        if (posture is not null)
        {
            AuditTool(ToolProvision, src.Id, posture.Value.Status);
            return new ToolOutcome(false, posture.Value.Status, $"{src.Label}: {posture.Value.Reason}; nothing was sent");
        }
        var o = _fleet.Provision(src.Id, url, name, parentFolder, defaultBranch, SelfLabel);
        AuditTool(ToolProvision, src.Id, o.Status);
        _logger.Info($"[ARCH] {ToolProvision} {src.Label} -> {o.Status}: {o.Detail}");
        if (!o.Ok) return o;
        var repoId = ProvisionedRepoId(o.Data);
        if (repoId is null) return new ToolOutcome(false, "error", $"{src.Label} answered {o.Status} without a repoId: {o.Detail}", o.Data);
        // The hub's half of the promise: the new agent lands in THIS arch's scope too.
        var key = ArchStateStore.FleetKey(src.Id, repoId);
        var already = ManagedFleet().Contains(key, StringComparer.Ordinal);
        if (!already)
        {
            _state.SetManagedFleet(ManagedFleet().Append(key));
            _logger.Info($"[ARCH] scope += {key} (provisioned on {src.Label})");
        }
        _fleet.Refresh(src.Id);   // the describe now lists the new repo; the row below reads it
        var (remoteRow, remoteView) = AgentRowFor(src.Id, repoId, refreshPeers: false);
        return new ToolOutcome(true, o.Status, $"{o.Detail}; {(already ? "already" : "now")} in this hub's scope as {key}; {ReadyLine(remoteView)}",
            new { machine = src.Label, sourceId = src.Id, repoId, key, handle = remoteView?.Label(SelfLabel), addedToHubScope = !already, provisioned = o.Data, agent = remoteRow });
    }

    /// <summary>The peer API's receiving side: a fleet arch asks THIS harness to bring a
    /// repo agent up. Behind "accept fleet provisioning" and the gate.</summary>
    public ToolOutcome PeerProvision(string? from, string? url, string? name, string? parentFolder, string? defaultBranch)
    {
        var machine = SanitizeMachine(from) ?? "unknown";
        if (!AcceptFleetProvisioning)
            return new ToolOutcome(false, "not-accepting", $"{SelfLabel} does not accept fleet provisioning (its operator must enable it on the Arch tab)");
        if (!_gate.Enabled) return new ToolOutcome(false, "not-accepting", $"{SelfLabel}'s autopilot gate is closed by its operator");
        if (_provision is null) return new ToolOutcome(false, "error", "provisioning is not wired on this build");
        var o = _provision.Provision($"arch@{machine}", url, name, parentFolder, defaultBranch);
        _logger.Info($"[ARCH] fleet provisioning requested by {machine} -> {o.Status}: {o.Detail}");
        if (o.Ok) RefreshAgentSnapshot();
        return o;
    }

    /// <summary>The provisioning from this harness's own operator (the dashboard, curl):
    /// no opt-in, no armed rule — the password gate is the consent.</summary>
    public ToolOutcome ProvisionLocal(string? url, string? name, string? parentFolder, string? defaultBranch) =>
        ProvisionRepoAgent(null, url, name, parentFolder, defaultBranch, requireArmed: false);

    // ---- the resulting list_agents row ---------------------------------------------------------

    /// <summary>One agent's <c>list_agents</c> row, freshly read, or null when it is not in the
    /// list (then the detail says so instead of pretending).</summary>
    private (object? Row, AgentView? View) AgentRowFor(string sourceId, string repoId, bool refreshPeers)
    {
        var a = ListAgents(refreshPeers: refreshPeers).FirstOrDefault(v => v.SourceId == sourceId && v.RepoId == repoId);
        if (a is null) return (null, null);
        var providerById = _repos.GetAll().ToDictionary(r => r.Id, r => r.Provider, StringComparer.Ordinal);
        return (AgentRow(a, providerById, UnpushedTaskBranches()), a);
    }

    private string ReadyLine(AgentView? a)
    {
        if (a is null) return "the agent is not in list_agents yet (read it again on a later wake)";
        var where = a.IsLocal ? "on this machine" : $"on {a.Machine} (managedThere {(a.ManagedThere ? "true" : "false")})";
        return a.Sendable
            ? $"ready for dispatch_task: {a.Label(SelfLabel)} {where}, on {a.Branch}{(a.Dirty ? " (dirty)" : ", clean")}, {a.Availability}"
            : $"{a.Label(SelfLabel)} {where}, on {a.Branch}, {a.Availability} — not sendable yet: {a.Blocked?.Reason}";
    }

    /// <summary>The repoId a peer's provisioning reply carries (its data is a JSON element).</summary>
    public static string? ProvisionedRepoId(object? data)
    {
        try
        {
            if (data is JsonElement e && e.ValueKind == JsonValueKind.Object && e.TryGetProperty("repoId", out var id) && id.ValueKind == JsonValueKind.String)
                return id.GetString();
            if (data is RepoProvisionService.Result r) return r.RepoId;
        }
        catch { /* not a provisioning reply */ }
        return null;
    }
}
