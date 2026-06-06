using ClaudeWeb.Models;

namespace ClaudeWeb.Services.Monitoring;

/// <summary>
/// Thread-safe store of recent <see cref="CallRecord"/>s, shared between the
/// web backend (which populates records from <c>CliRunnerService</c>) and the
/// monitoring GUI (which subscribes to the events to render a live list +
/// detail panel). Wired exactly like <see cref="Services.Logging.Logger"/>:
/// one instance is created in <c>Program</c>, registered as a DI singleton by
/// <c>EmbeddedApi</c>, and subscribed to by <c>MainForm</c>.
///
/// Keeps at most <see cref="Capacity"/> records (oldest dropped). All list
/// mutation happens under a lock; events are raised outside the lock so a slow
/// subscriber (the UI marshaling onto its thread) never blocks the CLI runner.
/// </summary>
public class CallLog
{
    private const int Capacity = 200;

    private readonly object _gate = new();
    private readonly List<CallRecord> _records = new();
    private int _nextNumber = 1;

    /// <summary>Raised when a new call record is created.</summary>
    public event Action<CallRecord>? CallStarted;

    /// <summary>Raised whenever an existing record's fields change (including on finish).</summary>
    public event Action<CallRecord>? CallChanged;

    /// <summary>Snapshot of the recent records (newest last).</summary>
    public IReadOnlyList<CallRecord> Recent
    {
        get { lock (_gate) return _records.ToList(); }
    }

    /// <summary>
    /// Creates a new record with the next sequential <see cref="CallRecord.Number"/>,
    /// adds it to the store (dropping the oldest past capacity), and raises
    /// <see cref="CallStarted"/>.
    /// </summary>
    public CallRecord StartCall(string prompt, string commandLine, string workingDirectory,
        bool resuming, string sessionId)
    {
        CallRecord record;
        lock (_gate)
        {
            record = new CallRecord
            {
                Number = _nextNumber++,
                StartedAt = DateTime.Now,
                Status = "Running",
                Prompt = prompt,
                CommandLine = commandLine,
                WorkingDirectory = workingDirectory,
                Resuming = resuming,
                SessionId = sessionId,
            };
            _records.Add(record);
            while (_records.Count > Capacity)
                _records.RemoveAt(0);
        }

        CallStarted?.Invoke(record);
        return record;
    }

    /// <summary>Raises <see cref="CallChanged"/> for a record whose fields were just updated.</summary>
    public void Update(CallRecord record) => CallChanged?.Invoke(record);
}
