namespace ClaudeWebInstaller.Models;

/// <summary>
/// Deployment phases for the Internet Deployment tab. Mirrors the deployer
/// skill's phase grouping, adapted for our .NET + WinForms-in-session model
/// (no PM2 / Windows Service -- IIS reverse-proxies the in-session app, which
/// the operator runs in their logged-in session).
/// </summary>
public enum DeployPhase
{
    PreFlight,
    Backend,
    Firewall,
    Configure,
    Verify
}

/// <summary>
/// Describes one deployment step. Reuses the installer's <see cref="StepStatus"/>
/// enum so the form can render both checklists identically. A step always has a
/// check delegate that reports current state without changing anything; steps
/// that automate a change also carry a deploy delegate.
/// </summary>
public class DeployStep
{
    public int Number { get; }
    public string Name { get; }
    public string Description { get; }
    public DeployPhase Phase { get; }

    /// <summary>Reports current state. Changes nothing.</summary>
    public Func<CancellationToken, Task<(StepStatus Status, string Details)>> CheckFunc { get; }

    /// <summary>Optional deploy action. Returns success plus a short summary.</summary>
    public Func<CancellationToken, Task<(bool Success, string Output)>>? DeployFunc { get; }

    public StepStatus Status { get; set; } = StepStatus.Pending;
    public string Details { get; set; } = "";

    public DeployStep(
        int number,
        string name,
        string description,
        DeployPhase phase,
        Func<CancellationToken, Task<(StepStatus Status, string Details)>> checkFunc,
        Func<CancellationToken, Task<(bool Success, string Output)>>? deployFunc = null)
    {
        Number = number;
        Name = name;
        Description = description;
        Phase = phase;
        CheckFunc = checkFunc;
        DeployFunc = deployFunc;
    }
}
