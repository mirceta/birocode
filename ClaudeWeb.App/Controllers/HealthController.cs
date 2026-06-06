using ClaudeWeb.Models;
using ClaudeWeb.Services.Repositories;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Liveness endpoint. Exempt from password auth so probes and the app shell
/// can confirm the server is up. Auto-discovered by AddControllers() --
/// no Program.cs changes needed to add more controllers like this one.
/// </summary>
[ApiController]
[Route("api/health")]
public class HealthController : ControllerBase
{
    private readonly AppConfig _config;
    private readonly RepositoryRegistry _registry;

    public HealthController(AppConfig config, RepositoryRegistry registry)
    {
        _config = config;
        _registry = registry;
    }

    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        status = "running",
        port = _config.Port,
        repositoryCount = _registry.GetAll().Count
    });
}
