using System.Text;
using System.Text.Json.Nodes;
using ClaudeWeb.Services.Agents;
using ClaudeWeb.Services.Logging;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// The repo-agent tool server's endpoint (openspec cross-repo-effort-legs): the MCP route
/// every repo agent's turn calls. Exempt from the password middleware; the per-process
/// bearer token the harness itself wrote into the run's <c>--mcp-config</c> is the
/// credential, and <c>?repo=</c> — written by the harness too — names the agent speaking.
/// </summary>
[ApiController]
[Route("api/agents")]
public class AgentToolsController : ControllerBase
{
    private readonly RepoAgentToolsService _service;
    private readonly RepoAgentMcpServer _mcp;
    private readonly Logger _logger;

    public AgentToolsController(RepoAgentToolsService service, RepoAgentMcpServer mcp, Logger logger)
    {
        _service = service;
        _mcp = mcp;
        _logger = logger;
    }

    [HttpPost("mcp")]
    public async Task<IActionResult> Mcp([FromQuery] string? repo = null)
    {
        if (!Authorized()) return Unauthorized(new { error = "bad or missing repo-agent MCP token" });
        JsonNode? body;
        try
        {
            using var reader = new StreamReader(Request.Body, Encoding.UTF8);
            var text = await reader.ReadToEndAsync();
            body = string.IsNullOrWhiteSpace(text) ? null : JsonNode.Parse(text);
        }
        catch (Exception ex)
        {
            return BadRequest(new { jsonrpc = "2.0", id = (object?)null, error = new { code = -32700, message = $"parse error: {ex.Message}" } });
        }
        var reply = _mcp.Handle(body, repo);
        Response.Headers["Mcp-Session-Id"] = "repo-agent";
        if (reply.Body is null) return StatusCode(reply.Status);
        return new ContentResult { StatusCode = reply.Status, ContentType = "application/json", Content = reply.Body.ToJsonString() };
    }

    [HttpGet("mcp")]
    public IActionResult McpGet() => StatusCode(StatusCodes.Status405MethodNotAllowed);

    [HttpDelete("mcp")]
    public IActionResult McpDelete() => Authorized() ? Ok() : Unauthorized();

    private bool Authorized()
    {
        var auth = Request.Headers.Authorization.FirstOrDefault() ?? "";
        const string prefix = "Bearer ";
        return auth.StartsWith(prefix, StringComparison.OrdinalIgnoreCase) && _service.ValidateMcpToken(auth[prefix.Length..].Trim());
    }
}
