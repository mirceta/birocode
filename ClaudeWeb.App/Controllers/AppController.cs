using ClaudeWeb.Models;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Supports the "App" tab, which previews the product (the app in the opened
/// repo) by iframing a fixed preview port. The harness does not build, start, or
/// stop the product -- you ask Claude in chat to start it on the preview port
/// (detached, bound to 0.0.0.0). This endpoint just tells the frontend which
/// port to point the iframe at.
///
///   GET /api/app/preview -> { port }
/// </summary>
[ApiController]
[Route("api/app")]
public class AppController : ControllerBase
{
    private readonly AppConfig _config;

    public AppController(AppConfig config)
    {
        _config = config;
    }

    [HttpGet("preview")]
    public IActionResult Preview() => Ok(new { port = _config.PreviewPort });
}
