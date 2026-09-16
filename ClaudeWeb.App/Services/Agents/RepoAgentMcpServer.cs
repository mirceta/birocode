using System.Text.Json;
using System.Text.Json.Nodes;

namespace ClaudeWeb.Services.Agents;

/// <summary>
/// The harness's MCP server for REPO AGENTS (openspec cross-repo-effort-legs; the
/// <c>repo-agent-tools</c> server human-delegation-watchers planned): the tools over
/// Streamable HTTP, JSON-RPC 2.0, served by <c>POST /api/agents/mcp?repo=&lt;id&gt;</c>. Same
/// contract as the arch and Tasks servers — stateless, every request carries the bearer
/// token, <c>initialize</c> answers with the tool capability, notifications get 202, no
/// server-to-client stream (GET is 405). The repo the call speaks for comes from the URL the
/// harness itself wrote into the run's config, never from the model.
/// </summary>
public class RepoAgentMcpServer
{
    public const string ProtocolVersion = "2025-03-26";
    public const string ServerName = "claude-web";
    private readonly RepoAgentToolbox _tools;

    public RepoAgentMcpServer(RepoAgentToolbox tools)
    {
        _tools = tools;
    }

    public sealed record Reply(int Status, JsonNode? Body);

    /// <summary>Handles one JSON-RPC message (or batch) on behalf of <paramref name="repoId"/>.</summary>
    public Reply Handle(JsonNode? request, string? repoId)
    {
        if (request is JsonArray batch)
        {
            var out_ = new JsonArray();
            foreach (var item in batch)
            {
                var r = HandleOne(item as JsonObject, repoId);
                if (r is not null) out_.Add(r);
            }
            return out_.Count == 0 ? new Reply(202, null) : new Reply(200, out_);
        }
        var one = HandleOne(request as JsonObject, repoId);
        return one is null ? new Reply(202, null) : new Reply(200, one);
    }

    private JsonObject? HandleOne(JsonObject? msg, string? repoId)
    {
        if (msg is null) return Error(null, -32600, "invalid request");
        var method = msg["method"]?.GetValue<string>();
        var id = msg["id"]?.DeepClone();
        var hasId = msg.ContainsKey("id") && msg["id"] is not null;
        if (method is null) return Error(id, -32600, "missing method");
        if (!hasId && method.StartsWith("notifications/", StringComparison.Ordinal)) return null;

        switch (method)
        {
            case "initialize":
            {
                var requested = msg["params"]?["protocolVersion"]?.GetValue<string>();
                return Result(id, new JsonObject
                {
                    ["protocolVersion"] = string.IsNullOrWhiteSpace(requested) ? ProtocolVersion : requested,
                    ["capabilities"] = new JsonObject { ["tools"] = new JsonObject() },
                    ["serverInfo"] = new JsonObject { ["name"] = ServerName, ["version"] = "1.0" },
                    ["instructions"] = "Claude Web harness tools for this repo agent. my_effort tells you which board effort you are in (your role, what you drive or who drives you, the shared goal, every leg's PR / merge state) — call it when asked what you are doing. report_leg records a leg's branch / PR so the harness can verify it; the card is done only when every leg is merged. Every result is data.",
                });
            }
            case "ping":
                return Result(id, new JsonObject());
            case "tools/list":
                return Result(id, new JsonObject { ["tools"] = ToolsList() });
            case "tools/call":
            {
                var name = msg["params"]?["name"]?.GetValue<string>() ?? "";
                var args = msg["params"]?["arguments"] as JsonObject ?? new JsonObject();
                var outcome = Call(name, args, repoId);
                if (outcome is null) return Error(id, -32602, $"unknown tool \"{name}\"");
                var text = JsonSerializer.Serialize(new { ok = outcome.Ok, status = outcome.Status, detail = outcome.Detail, data = outcome.Data });
                return Result(id, new JsonObject
                {
                    ["content"] = new JsonArray(new JsonObject { ["type"] = "text", ["text"] = text }),
                    ["isError"] = !outcome.Ok && outcome.Status == "error",
                });
            }
            case "resources/list":
                return Result(id, new JsonObject { ["resources"] = new JsonArray() });
            case "prompts/list":
                return Result(id, new JsonObject { ["prompts"] = new JsonArray() });
            default:
                return hasId ? Error(id, -32601, $"method not found: {method}") : null;
        }
    }

    private RepoAgentToolbox.ToolOutcome? Call(string name, JsonObject args, string? repoId)
    {
        string? S(string k) => args[k]?.GetValue<string>();
        bool B(string k)
        {
            var n = args[k];
            if (n is null) return false;
            try { return n.GetValue<bool>(); } catch { return string.Equals(n.ToString(), "true", StringComparison.OrdinalIgnoreCase); }
        }
        return name switch
        {
            "my_effort" => _tools.MyEffort(repoId, B("includeDelivered")),
            "report_leg" => _tools.ReportLeg(repoId, S("task"), S("leg"), S("branch"), S("commit"), S("pr")),
            _ => null,
        };
    }

    public static JsonArray ToolsList() => new(
        Tool("my_effort",
            "Which board effort am I in? For every card you are a leg of: your role (driver = the orchestrator; driven = a product repo the driver drives), the legs you drive or the driver you answer to, the shared goal (the card's title + note), every leg's branch / PR / verified merge state, how many legs are merged, and whether the card is PARTIALLY merged (some legs merged, not all — the card is NOT done until every leg is). Call it when the policeman or the Operator asks what you are doing, so you answer from the board instead of looking idle.",
            Schema(("includeDelivered", "boolean", "also list cards already merged / done (default false)", false))),
        Tool("report_leg",
            "Record where a leg's work lives — branch, commit and/or the pull request URL — so the harness verifies that leg on GitHub. Your own leg by default; as the DRIVER you also report the legs you drive (an agentless checkout like prgcopies\\copy1\\prg cannot report for itself). Never moves the column: the verifier does, from the facts, and the card is done only when EVERY leg's PR is merged. task = the card (#ref / id; omitted = your one in-flight card); leg = the leg (its path, path tail, handle; omitted = yours).",
            Schema(("task", "string", "the card: #ref, full id or unique prefix (omit when you are on exactly one in-flight card)", false),
                ("leg", "string", "which leg: its checkout path, path tail (copy1/prg), agent handle, or \"me\" (default)", false),
                ("branch", "string", "the branch the leg's work is on", false),
                ("commit", "string", "the head commit", false),
                ("pr", "string", "the pull request URL (https://github.com/<owner>/<repo>/pull/<n>)", false))));

    private static JsonObject Tool(string name, string description, JsonObject schema) => new()
    {
        ["name"] = name,
        ["description"] = description,
        ["inputSchema"] = schema,
    };

    private static JsonObject Schema(params (string Name, string Type, string Desc, bool Required)[] props)
    {
        var properties = new JsonObject();
        var required = new JsonArray();
        foreach (var (name, type, desc, req) in props)
        {
            properties[name] = new JsonObject { ["type"] = type, ["description"] = desc };
            if (req) required.Add(name);
        }
        var schema = new JsonObject { ["type"] = "object", ["properties"] = properties, ["additionalProperties"] = false };
        if (required.Count > 0) schema["required"] = required;
        return schema;
    }

    private static JsonObject Result(JsonNode? id, JsonNode result) => new() { ["jsonrpc"] = "2.0", ["id"] = id, ["result"] = result };
    private static JsonObject Error(JsonNode? id, int code, string message) => new() { ["jsonrpc"] = "2.0", ["id"] = id, ["error"] = new JsonObject { ["code"] = code, ["message"] = message } };
}
