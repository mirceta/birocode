using System.Text.Json;
using ClaudeWeb.Services.Audit;
using ClaudeWeb.Services.Auth;
using ClaudeWeb.Services.Hosting;
using ClaudeWeb.Services.Logging;
using ClaudeWeb.Services.Remote;
using Microsoft.AspNetCore.Mvc;

namespace ClaudeWeb.Controllers;

/// <summary>
/// Sofa mode (openspec sofa-mode): the phone remote's API and the big screen's.
///
///   POST /api/remote/commands  { type, args }        -> { ok, seq }        the phone posts a command
///   GET  /api/remote/commands?after=N                -> { seq, commands }  the listening tab polls (after=-1: catch up, no replay)
///   POST /api/remote/screens   { id, name, url, activeAgent, view } -> [screens]   a big screen's heartbeat
///   GET  /api/remote/screens                         -> [screens]          what is listening right now
///   POST /api/remote/pair/new                        -> { pin, expiresAt } a logged-in tab asks for a pairing PIN
///   POST /api/remote/pair      { pin }               -> { ok }             the phone redeems it; gets the session cookie   (password-exempt)
///
/// Everything but <c>pair</c> sits behind the normal IP + password gates like every other /api
/// route; <c>pair</c> is exempt from the password gate exactly like <c>/api/auth/login</c> (you
/// must be able to pair), still behind the IP gate, throttled by the same per-IP lockout, and
/// on success mints the SAME cookie a login mints. A command is a request to whichever screen
/// is listening — the server stores and publishes it, never acts on it.
/// </summary>
[ApiController]
[Route("api/remote")]
public class RemoteController : ControllerBase
{
    private readonly RemoteCommandStore _store;
    private readonly RemotePairing _pairing;
    private readonly AuthService _auth;
    private readonly AuditService _audit;
    private readonly Logger _logger;

    public RemoteController(RemoteCommandStore store, RemotePairing pairing, AuthService auth, AuditService audit, Logger logger)
    {
        _store = store;
        _pairing = pairing;
        _auth = auth;
        _audit = audit;
        _logger = logger;
    }

    public sealed record CommandBody(string? Type, JsonElement? Args);

    [HttpPost("commands")]
    public IActionResult PostCommand([FromBody] CommandBody? body)
    {
        _logger.CountRequest();
        if (!RemoteCommandStore.IsKnownType(body?.Type))
            return BadRequest(new { error = "unknown command type", types = RemoteCommandStore.Types });
        var cmd = _store.Post(body!.Type!, body.Args, ClientIp.Get(HttpContext));
        return Ok(new { ok = true, seq = cmd.Seq });
    }

    [HttpGet("commands")]
    public IActionResult GetCommands([FromQuery] int after = -1)
    {
        _logger.CountRequest();
        var (commands, seq) = _store.Read(after);
        return Ok(new { seq, commands = commands.Select(ToDto) });
    }

    public sealed record ScreenBody(string? Id, string? Name, string? Url, string? ActiveAgent, string? View, string? Layout = null);

    [HttpPost("screens")]
    public IActionResult Heartbeat([FromBody] ScreenBody? body)
    {
        _logger.CountRequest();
        if (string.IsNullOrWhiteSpace(body?.Id)) return BadRequest(new { error = "id is required" });
        return Ok(_store.Heartbeat(body!.Id!.Trim(), body.Name, body.Url, body.ActiveAgent, body.View, body.Layout).Select(ToDto));
    }

    [HttpGet("screens")]
    public IActionResult Screens()
    {
        _logger.CountRequest();
        return Ok(_store.Screens().Select(ToDto));
    }

    [HttpPost("pair/new")]
    public IActionResult NewPin()
    {
        _logger.CountRequest();
        var (pin, expires) = _pairing.NewPin();
        _audit.LogAuth(_audit.ResolveActor(HttpContext), "pair-new");
        _logger.Info($"[REMOTE] Pairing PIN minted for {ClientIp.Get(HttpContext)}, valid {RemotePairing.Lifetime.TotalMinutes:0} min");
        return Ok(new { pin, expiresAt = new DateTimeOffset(expires, TimeSpan.Zero).ToUnixTimeMilliseconds(), lifetimeSeconds = (int)RemotePairing.Lifetime.TotalSeconds });
    }

    public sealed record PairBody(string? Pin);

    [HttpPost("pair")]
    public IActionResult Pair([FromBody] PairBody? body)
    {
        _logger.CountRequest();
        var client = ClientIp.Get(HttpContext);
        if (_auth.BlockedFor(client) is { } wait)
            return StatusCode(429, new { error = "Too many attempts", retryAfterSeconds = (int)Math.Ceiling(wait.TotalSeconds) });

        if (!_pairing.Redeem(body?.Pin))
        {
            _auth.RecordFailure(client);
            _audit.LogAuth(_audit.ResolveActor(HttpContext), "pair-fail", client);
            _logger.Error($"[REMOTE] Pairing failed from {client}");
            return Unauthorized(new { error = "Wrong or expired PIN" });
        }

        _auth.RecordSuccess(client);
        var token = _auth.CreateSession("remote-pair");
        Response.Cookies.Append(AuthController.CookieName, token, AuthController.CookieOptions(HttpContext, AuthService.SessionLifetime));
        _audit.LogAuth(_audit.ResolveActor(HttpContext), "pair-ok", client);
        _logger.Info($"[REMOTE] Phone paired from {client}");
        return Ok(new { ok = true });
    }

    private static object ToDto(RemoteCommand c) => new { seq = c.Seq, at = c.At, type = c.Type, args = c.Args, from = c.From };
    private static object ToDto(RemoteScreen s) => new { id = s.Id, name = s.Name, url = s.Url, activeAgent = s.ActiveAgent, view = s.View, layout = s.Layout, seenAt = s.SeenAt };
}
