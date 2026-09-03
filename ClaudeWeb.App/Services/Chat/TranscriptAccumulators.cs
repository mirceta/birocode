using System.Text.Json;

namespace ClaudeWeb.Services.Chat;

// The three transcript parsers of SessionService as stateful accumulators
// (openspec: reduce-transcript-io, D1): each is fed one parsed JSONL line at a
// time by TranscriptCache and keeps whatever cross-line state it needs (the
// tool_use → tool_result pairing map, the user-turn counter), so an appended
// tail can be folded in without re-reading what came before.

/// <summary>Human-visible messages (user prompts + assistant text), in order.</summary>
internal sealed class MessagesAcc
{
    public readonly List<ChatMessage> Messages = new();

    public void Feed(JsonElement root)
    {
        if (!root.TryGetProperty("type", out var typeProp)) return;
        var type = typeProp.GetString();
        if (type != "user" && type != "assistant") return;
        if (!root.TryGetProperty("message", out var msg)) return;

        var text = SessionService.ExtractVisibleText(msg);
        if (string.IsNullOrWhiteSpace(text)) return;

        DateTime? ts = null;
        if (root.TryGetProperty("timestamp", out var tsProp) &&
            DateTime.TryParse(tsProp.GetString(), out var parsed))
            ts = parsed;

        var synthetic = msg.TryGetProperty("model", out var modelProp)
            && modelProp.ValueKind == JsonValueKind.String
            && modelProp.GetString() == "<synthetic>";

        Messages.Add(new ChatMessage(type == "user" ? "user" : "assistant", text!.Trim(), ts, synthetic));
    }
}

/// <summary>Step-shaped tool calls (clipped input/output), paired by tool_use_id.</summary>
internal sealed class ToolCallsAcc
{
    public readonly List<ToolCall> Calls = new();
    private readonly Dictionary<string, int> _byId = new();

    public void Feed(JsonElement root)
    {
        if (!root.TryGetProperty("type", out var typeProp)) return;
        var type = typeProp.GetString();
        if (type != "user" && type != "assistant") return;
        if (!root.TryGetProperty("message", out var msg) ||
            !msg.TryGetProperty("content", out var content) ||
            content.ValueKind != JsonValueKind.Array)
            return;

        DateTime? ts = null;
        if (root.TryGetProperty("timestamp", out var tsProp) &&
            DateTime.TryParse(tsProp.GetString(), out var parsed))
            ts = parsed;

        foreach (var block in content.EnumerateArray())
        {
            var bt = block.TryGetProperty("type", out var btp) ? btp.GetString() : "";
            if (type == "assistant" && bt == "tool_use")
            {
                var id = block.TryGetProperty("id", out var ip) ? ip.GetString() ?? "" : "";
                if (string.IsNullOrEmpty(id) || _byId.ContainsKey(id)) continue;
                var name = block.TryGetProperty("name", out var np) ? np.GetString() ?? "tool" : "tool";
                string summary = "", detail = "";
                if (block.TryGetProperty("input", out var input) && input.ValueKind == JsonValueKind.Object)
                {
                    summary = SessionService.ToolSummary(name, input);
                    detail = SessionService.Truncate(input.GetRawText(), 1200);
                }
                _byId[id] = Calls.Count;
                Calls.Add(new ToolCall(id, name, summary, detail, Ok: null, Preview: "", Timestamp: ts));
            }
            else if (type == "user" && bt == "tool_result")
            {
                var id = block.TryGetProperty("tool_use_id", out var ip) ? ip.GetString() ?? "" : "";
                if (string.IsNullOrEmpty(id) || !_byId.TryGetValue(id, out var idx)) continue;
                var ok = !(block.TryGetProperty("is_error", out var ep) && ep.ValueKind == JsonValueKind.True);
                var preview = SessionService.Truncate(SessionService.ExtractToolResultText(block), 800, maxLines: 15);
                Calls[idx] = Calls[idx] with { Ok = ok, Preview = preview };
            }
        }
    }
}

/// <summary>Full-fidelity tool-call history grouped by user turn
/// (openspec: add-arch-tool-history).</summary>
internal sealed class ToolHistoryAcc
{
    public readonly List<ToolCallRecord> Calls = new();
    private readonly Dictionary<string, int> _byId = new();
    private readonly int _maxResultChars;
    private int _turn;
    private string _turnPrompt = "";
    private DateTime? _turnAt;

    public ToolHistoryAcc(int maxResultChars) { _maxResultChars = maxResultChars; }

    public int MaxResultChars => _maxResultChars;

    public void Feed(JsonElement root)
    {
        if (!root.TryGetProperty("type", out var typeProp)) return;
        var type = typeProp.GetString();
        if (type != "user" && type != "assistant") return;
        if (!root.TryGetProperty("message", out var msg) || !msg.TryGetProperty("content", out var content)) return;

        DateTime? ts = null;
        if (root.TryGetProperty("timestamp", out var tsProp) &&
            DateTime.TryParse(tsProp.GetString(), null, System.Globalization.DateTimeStyles.RoundtripKind, out var parsed))
            ts = parsed;

        if (type == "user")
        {
            var hasResult = content.ValueKind == JsonValueKind.Array && content.EnumerateArray()
                .Any(b => b.TryGetProperty("type", out var t) && t.GetString() == "tool_result");
            if (!hasResult)
            {
                var text = SessionService.ExtractVisibleText(msg);
                if (!string.IsNullOrWhiteSpace(text))
                {
                    _turn++;
                    _turnPrompt = text!.Trim();
                    _turnAt = ts;
                }
                return;
            }
        }
        if (content.ValueKind != JsonValueKind.Array) return;

        foreach (var block in content.EnumerateArray())
        {
            var bt = block.TryGetProperty("type", out var btp) ? btp.GetString() : "";
            if (type == "assistant" && bt == "tool_use")
            {
                var id = block.TryGetProperty("id", out var ip) ? ip.GetString() ?? "" : "";
                if (string.IsNullOrEmpty(id) || _byId.ContainsKey(id)) continue;
                var name = block.TryGetProperty("name", out var np) ? np.GetString() ?? "tool" : "tool";
                string summary = "";
                System.Text.Json.Nodes.JsonNode? input = null;
                if (block.TryGetProperty("input", out var inp))
                {
                    if (inp.ValueKind == JsonValueKind.Object) summary = SessionService.ToolSummary(name, inp);
                    try { input = System.Text.Json.Nodes.JsonNode.Parse(inp.GetRawText()); } catch { input = null; }
                }
                _byId[id] = Calls.Count;
                Calls.Add(new ToolCallRecord(id, name, summary, input, Ok: null, Result: "", ResultClipped: false, ResultChars: 0,
                    At: ts, ResultAt: null, Turn: _turn, TurnPrompt: _turnPrompt, TurnAt: _turnAt));
            }
            else if (type == "user" && bt == "tool_result")
            {
                var id = block.TryGetProperty("tool_use_id", out var ip) ? ip.GetString() ?? "" : "";
                if (string.IsNullOrEmpty(id) || !_byId.TryGetValue(id, out var idx)) continue;
                var ok = !(block.TryGetProperty("is_error", out var ep) && ep.ValueKind == JsonValueKind.True);
                var full = SessionService.ExtractToolResultText(block);
                var clipped = full.Length > _maxResultChars;
                Calls[idx] = Calls[idx] with
                {
                    Ok = ok,
                    Result = clipped ? full[.._maxResultChars] : full,
                    ResultClipped = clipped,
                    ResultChars = full.Length,
                    ResultAt = ts,
                };
            }
        }
    }
}

/// <summary>Session-list metadata: id, first prompt, turn counts, last timestamp.</summary>
internal sealed class MetadataAcc
{
    public string? SessionId;
    public string? FirstPrompt;
    public DateTime? LastTimestamp;
    public int UserTurns;
    public int AssistantTurns;

    public void Feed(JsonElement root)
    {
        if (!root.TryGetProperty("type", out var typeProp)) return;
        var type = typeProp.GetString();

        if (SessionId == null && root.TryGetProperty("sessionId", out var sidProp))
            SessionId = sidProp.GetString();

        if (root.TryGetProperty("timestamp", out var tsProp) &&
            DateTime.TryParse(tsProp.GetString(), out var ts))
            LastTimestamp = ts;

        switch (type)
        {
            case "user":
                UserTurns++;
                FirstPrompt ??= SessionService.ExtractFirstPrompt(root);
                break;
            case "assistant":
                AssistantTurns++;
                break;
        }
    }
}
