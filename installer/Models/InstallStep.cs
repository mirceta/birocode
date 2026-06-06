namespace ClaudeWebInstaller.Models;

public enum StepStatus
{
    Pending,
    Running,
    Ok,
    Missing,
    Warning,
    Failed
}

public enum StepPhase
{
    Check,
    Install,
    Build,
    Run
}

/// <summary>
/// Describes one installer step. A step always has a check delegate that
/// reports its current state without changing anything; some steps also have
/// an install/fix delegate that brings the system into the desired state.
/// </summary>
public class InstallStep
{
    public int Number { get; }
    public string Name { get; }
    public string Description { get; }
    public StepPhase Phase { get; }

    /// <summary>Reports current state. Changes nothing.</summary>
    public Func<CancellationToken, Task<(StepStatus Status, string Details)>> CheckFunc { get; }

    /// <summary>Optional fix/install action. Returns success plus a short summary.</summary>
    public Func<CancellationToken, Task<(bool Success, string Output)>>? InstallFunc { get; }

    public StepStatus Status { get; set; } = StepStatus.Pending;
    public string Details { get; set; } = "";

    public InstallStep(
        int number,
        string name,
        string description,
        StepPhase phase,
        Func<CancellationToken, Task<(StepStatus Status, string Details)>> checkFunc,
        Func<CancellationToken, Task<(bool Success, string Output)>>? installFunc = null)
    {
        Number = number;
        Name = name;
        Description = description;
        Phase = phase;
        CheckFunc = checkFunc;
        InstallFunc = installFunc;
    }
}
