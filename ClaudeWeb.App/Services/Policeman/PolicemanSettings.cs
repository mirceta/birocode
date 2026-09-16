using System.Text.Json;

namespace ClaudeWeb.Services.Policeman;

/// <summary>
/// The policeman's few knobs (openspec one-policeman), persisted beside the board: whether the
/// loop asks the model at all (the facts, moves and mechanical flags run regardless), which model
/// answers the one question, how many of the assignee's last messages it is shown, and how many
/// questions one pass may ask.
/// </summary>
public sealed class PolicemanSettings
{
    public const string FileName = "policeman.json";
    public const string DefaultModel = "haiku";
    public const int DefaultTail = 4;
    public const int DefaultMaxQuestionsPerPass = 8;

    public sealed record Values(bool Enabled, string Model, int Tail, int MaxQuestionsPerPass);

    private readonly object _gate = new();
    private readonly string? _path;
    private Values _values = new(true, DefaultModel, DefaultTail, DefaultMaxQuestionsPerPass);

    /// <param name="dir">The data dir to persist in; null = memory only.</param>
    public PolicemanSettings(string? dir)
    {
        if (dir is null) return;
        Directory.CreateDirectory(dir);
        _path = Path.Combine(dir, FileName);
        try
        {
            if (File.Exists(_path))
            {
                var v = JsonSerializer.Deserialize<Values>(File.ReadAllText(_path), new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
                if (v is not null) _values = Clean(v);
            }
        }
        catch { /* a corrupt file is the defaults */ }
    }

    public Values Current { get { lock (_gate) return _values; } }

    public Values Update(bool? enabled, string? model, int? tail, int? maxQuestionsPerPass)
    {
        lock (_gate)
        {
            _values = Clean(new Values(enabled ?? _values.Enabled, string.IsNullOrWhiteSpace(model) ? _values.Model : model!.Trim(),
                tail ?? _values.Tail, maxQuestionsPerPass ?? _values.MaxQuestionsPerPass));
            if (_path is not null)
            {
                try { File.WriteAllText(_path, JsonSerializer.Serialize(_values)); } catch { /* best effort */ }
            }
            return _values;
        }
    }

    /// <summary>Pure: the bounds every value is held to.</summary>
    public static Values Clean(Values v) => new(
        v.Enabled,
        string.IsNullOrWhiteSpace(v.Model) ? DefaultModel : v.Model.Trim(),
        Math.Clamp(v.Tail, 1, 12),
        Math.Clamp(v.MaxQuestionsPerPass, 1, 40));
}
