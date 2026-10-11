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
    private readonly RemoteRelay _relay;
    private readonly AuthService _auth;
    private readonly AuditService _audit;
    private readonly Logger _logger;

    public RemoteController(RemoteCommandStore store, RemotePairing pairing, RemoteRelay relay, AuthService auth, AuditService audit, Logger logger)
    {
        _store = store;
        _pairing = pairing;
        _relay = relay;
        _auth = auth;
        _audit = audit;
        _logger = logger;
    }

    /// <summary><c>screenOn</c> (openspec remote-fleet-agents): where the big screen is right now — null /
    /// "self" for a page of this harness, else the sourceId of the peer whose page it shows; <c>screen</c>
    /// is the screen's name (default "projector"). The command is enqueued where the screen listens, and
    /// an <c>open-agent</c> that crosses machines becomes a <c>navigate</c> (with a one-shot PIN minted on
    /// the peer, so the projector browser logs itself in there).</summary>
    public sealed record CommandBody(string? Type, JsonElement? Args, string? ScreenOn = null, string? Screen = null);

    [HttpPost("commands")]
    public async Task<IActionResult> PostCommand([FromBody] CommandBody? body)
    {
        _logger.CountRequest();
        if (!RemoteCommandStore.IsKnownType(body?.Type))
            return BadRequest(new { error = "unknown command type", types = RemoteCommandStore.Types });
        var from = ClientIp.Get(HttpContext);
        var selfBase = $"{Request.Scheme}://{Request.Host}";
        var screenName = string.IsNullOrWhiteSpace(body!.Screen) ? "projector" : body.Screen!.Trim();
        var plan = RemoteRelay.PlanCommand(body.Type!.Trim().ToLowerInvariant(), body.Args, body.ScreenOn, selfBase, screenName,
            _relay.AddressOf,
            sid => _relay.MintPeerPinAsync(sid, HttpContext.RequestAborted).GetAwaiter().GetResult());
        if (plan.Type == "navigate" && plan.Args is null)
            return BadRequest(new { error = plan.Note ?? "cannot navigate" });
        if (plan.Queue == "self")
        {
            var cmd = _store.Post(plan.Type, plan.Args, from);
            return Ok(new { ok = true, seq = cmd.Seq, queue = "self", note = plan.Note });
        }
        // The big screen listens to a peer's queue: hand the command to that peer.
        var r = await _relay.ForwardAsync(plan.Queue, "POST", "remote/commands", "", null,
            JsonSerializer.Serialize(new { type = plan.Type, args = plan.Args }), HttpContext.RequestAborted);
        if (r.Status is < 200 or >= 300) return StatusCode(r.Status, new { error = "the screen's harness refused the command", detail = r.Body });
        return Ok(new { ok = true, queue = plan.Queue, note = plan.Note });
    }

    // ---- the relay to a peer (openspec remote-fleet-agents) --------------------------------------

    /// <summary>Forward an allow-listed call to a fleet peer with the credential this harness stores for
    /// it: <c>/api/remote/relay/{sourceId}/dock</c>, <c>…/sessions/{id}/messages|tools</c>,
    /// <c>…/remote/screens</c>, <c>…/remote/commands</c>, <c>…/remote/pair/new</c>, <c>…/chat</c>,
    /// <c>…/chat/stop</c>. <c>X-Repo-Id</c> and the query string ride along. Anything else is 404 here.</summary>
    [HttpGet("relay/{sourceId}/{**path}")]
    [HttpPost("relay/{sourceId}/{**path}")]
    public async Task<IActionResult> Relay(string sourceId, string path)
    {
        _logger.CountRequest();
        var method = Request.Method;
        var allowed = RemoteRelay.Match(method, path);
        if (allowed is null) return NotFound(new { error = "not relayed", path });
        if (_relay.AddressOf(sourceId) is null) return NotFound(new { error = "unknown machine", sourceId });
        if (allowed.IsSend && !_relay.SendsAllowed(sourceId))
            return StatusCode(403, new { error = "sends to this machine are off on this harness (Fleet tab → allow sends)" });
        string? body = null;
        if (method.Equals("POST", StringComparison.OrdinalIgnoreCase))
        {
            using var reader = new StreamReader(Request.Body);
            body = await reader.ReadToEndAsync(HttpContext.RequestAborted);
            if (string.IsNullOrWhiteSpace(body)) body = null;
        }
        var repoId = Request.Headers["X-Repo-Id"].FirstOrDefault();
        var r = await _relay.ForwardAsync(sourceId, method, path, Request.QueryString.Value ?? "", repoId, body, HttpContext.RequestAborted);
        return new ContentResult { StatusCode = r.Status, ContentType = r.ContentType, Content = r.Body };
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
