namespace ClaudeWeb.Services.Audit;

/// <summary>Who an audited action is attributed to (openspec add-action-audit). Best-available
/// identity from the resilient-auth layer; falls back to <c>unknown@&lt;ip&gt;</c>.</summary>
public sealed record AuditActor(string? Device, string? Guest, string Ip, string? Session)
{
    /// <summary>Human-meaningful label: device name, else guest name, else unknown@ip.</summary>
    public string Display =>
        !string.IsNullOrEmpty(Device) ? Device :
        !string.IsNullOrEmpty(Guest) ? Guest :
        $"unknown@{Ip}";

    /// <summary>The Operator acting at the desktop GUI (no request behind it).</summary>
    public static AuditActor Operator { get; } = new("operator (desktop)", null, "local", null);
}

/// <summary>Per-chat-turn audit context, built by <c>ChatController</c> from the request and
/// threaded into <c>CliRunnerService.RunAsync</c> so tool actions can be attributed.</summary>
public sealed class AuditContext
{
    public required AuditActor Actor { get; init; }
    public string? Repo { get; init; }
    public string? Lane { get; init; }
}

/// <summary>One append-only audit record (one JSON line). Null fields are omitted on write.</summary>
public sealed class AuditEntry
{
    public DateTime Ts { get; set; }
    public string Kind { get; set; } = "";        // prompt | tool | auth
    public string Actor { get; set; } = "";        // display label
    public string? Device { get; set; }
    public string? Guest { get; set; }
    public string Ip { get; set; } = "";
    public string? Session { get; set; }
    public string? Repo { get; set; }
    public string? Lane { get; set; }
    public string? Tool { get; set; }             // kind=tool
    public string? Args { get; set; }             // kind=tool/auth
    public string? Text { get; set; }             // kind=prompt
    public string? Event { get; set; }            // kind=auth (login/mint/approve/revoke)
}
