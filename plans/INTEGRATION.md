# Integration Conventions

How modules (M1, M2, M3, ...) plug into the M0 scaffolding WITHOUT editing
shared files. This lets later modules be built in parallel by separate agents
with zero merge conflicts in `Program.cs` or `EmbeddedApi.cs`.

## 1. Controllers auto-register (zero shared-file edits)

The backend calls `builder.Services.AddControllers()` and `app.MapControllers()`
in `ClaudeWeb.App/Services/EmbeddedApi.cs`. ASP.NET discovers every
attribute-routed controller in the assembly automatically.

To add an endpoint, a module just drops a new file in
`ClaudeWeb.App/Controllers/`:

```csharp
[ApiController]
[Route("api/chat")]
public class ChatController : ControllerBase
{
    private readonly CliRunnerService _cli;     // injected (see section 2)
    private readonly Logger _logger;            // shared singleton, already registered
    public ChatController(CliRunnerService cli, Logger logger) { _cli = cli; _logger = logger; }

    [HttpPost]
    public async Task Post() { /* ... */ }
}
```

No changes to `Program.cs` or `EmbeddedApi.cs` are needed for new controllers.

## 2. Service registration via a per-module extension class

Each module that needs dependency injection ships ONE static extension class
in ITS OWN file, e.g. `ClaudeWeb.App/Services/ChatModuleExtensions.cs`:

```csharp
public static class ChatModuleExtensions
{
    public static IServiceCollection AddChatModule(this IServiceCollection services)
    {
        services.AddSingleton<CliRunnerService>();
        return services;
    }
}
```

The orchestrator (not the module agent) then un-comments the matching line in
the clearly marked region inside `EmbeddedApi.cs`:

```csharp
// === MODULE SERVICE REGISTRATION (orchestrator wires these between phases) ===
// builder.Services.AddChatModule();   // M1
// builder.Services.AddFileModule();   // M2
// builder.Services.AddGitModule();    // M3
// === END MODULE SERVICE REGISTRATION ===
```

This is the ONLY shared-file edit, it is a single uncomment line per module,
and it is done by the orchestrator between phases -- not by parallel agents.

## 3. Shared singletons available to inject

Registered in `EmbeddedApi.cs` at startup; inject by constructor:

- `Logger`    -- thread-safe logger. Log with a category tag, e.g.
  `logger.Info("[CHAT] session started")`. Call `logger.CountRequest()` once
  per inbound API request so the GUI status bar updates. `logger.Error(...)`
  auto-increments the error counter.
- `AppConfig` -- strongly typed config. Read `config.WorkingDirectory` for the
  fixed working directory (the operator can change it at runtime via the GUI,
  so read it per-request, do not cache it). `config.Port`, `config.AuthPassword`
  also available.

## 4. Auth

`PasswordAuthMiddleware` already protects all `/api/*` routes. Clients pass the
shared password via the `X-Auth-Password` header or `?pw=` query param.
Exemptions: `GET /api/health` and all non-`/api` (static/SPA) routes.
Module controllers do NOT implement auth themselves -- it is global.

## 5. Logging categories (convention)

Use a bracketed tag prefix so the operator can scan the activity log:
`[CHAT]`, `[CLI]`, `[FILE]`, `[GIT]`, `[SERVER]`, `[CONFIG]`, `[AUTH]`.
