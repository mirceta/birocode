namespace ClaudeWeb.Services.Run;

/// <summary>
/// Writes the "preview" convention into the opened repository's CLAUDE.md, so
/// Claude knows how to start that project for the App tab. The text lives in the
/// target repo (inspectable + editable by the operator) rather than being
/// injected invisibly at runtime.
///
/// The section is delimited by HTML-comment markers so re-running "Prepare" is
/// idempotent: it replaces the existing block in place (refreshing the port /
/// self-dev steps) instead of appending duplicates. Any content the user wrote
/// outside the markers is left untouched.
/// </summary>
public static class PreviewDoc
{
    public const string Begin = "<!-- claude-web:preview (managed by Claude Web -- re-run \"Prepare for preview\" to update) -->";
    public const string End = "<!-- /claude-web:preview -->";

    public sealed record PrepareResult(string Action, string FileName);

    /// <summary>Builds the managed section for the given preview port. When
    /// <paramref name="previewUrl"/> is non-empty (this install is behind a
    /// reverse proxy), the extra sub-path section is included so the product
    /// is built with the correct base URL. Self-dev gets the isolated-build
    /// steps (the harness can't build over its own running exe).</summary>
    public static string BuildSection(int port, string? previewUrl, bool isSelf)
    {
        var body = Generic.Replace("{PORT}", port.ToString());
        if (!string.IsNullOrWhiteSpace(previewUrl))
        {
            var withSlash = previewUrl!.EndsWith("/") ? previewUrl : previewUrl + "/";
            var noTrail = withSlash.TrimEnd('/');
            body += Proxy
                .Replace("{PORT}", port.ToString())
                .Replace("{PREVIEW_URL}", withSlash)
                .Replace("{PREVIEW_URL_NO_TRAIL}", noTrail);
        }
        if (isSelf) body += Self.Replace("{PORT}", port.ToString());
        return $"{Begin}\n\n{body.Trim()}\n\n{End}\n";
    }

    /// <summary>
    /// Creates, updates, or appends the managed section in &lt;repoPath&gt;/CLAUDE.md.
    /// Returns which action was taken.
    /// </summary>
    public static PrepareResult Prepare(string repoPath, int port, string? previewUrl, bool isSelf)
    {
        const string fileName = "CLAUDE.md";
        var path = Path.Combine(repoPath, fileName);
        var section = BuildSection(port, previewUrl, isSelf);

        if (!File.Exists(path))
        {
            File.WriteAllText(path, $"# Project notes\n\n{section}");
            return new PrepareResult("created", fileName);
        }

        var content = File.ReadAllText(path);
        var bi = content.IndexOf(Begin, StringComparison.Ordinal);
        var ei = content.IndexOf(End, StringComparison.Ordinal);
        if (bi >= 0 && ei > bi)
        {
            var before = content[..bi];
            var after = content[(ei + End.Length)..];
            File.WriteAllText(path, before + section.TrimEnd() + after);
            return new PrepareResult("updated", fileName);
        }

        var sep = content.EndsWith("\n") ? "\n" : "\n\n";
        File.WriteAllText(path, content + sep + section);
        return new PrepareResult("appended", fileName);
    }

    private const string Generic = @"## Previewing this app in Claude Web

The Claude Web ""App"" tab embeds whatever is listening on **port {PORT}**. When the
user asks you to run, start, or preview the app:

1. Start it listening on **0.0.0.0:{PORT}** (not localhost) so it is reachable
   from the phone over the LAN.
2. Launch it **detached** so it keeps running after your turn ends. Claude Web
   runs you via `claude -p` (one-shot), so a normal child process dies when the
   turn finishes. Windows: `Start-Process`. macOS/Linux: `nohup ... & disown`.
3. Free the port first if something already holds it:
   - Windows: `Get-NetTCPConnection -LocalPort {PORT} -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
   - macOS/Linux: `lsof -ti tcp:{PORT} | xargs -r kill`
4. Use this repository's own stack and scripts to start it.";

    private const string Proxy = @"

### Build for the reverse-proxy sub-path

This Claude Web install fronts the App tab through a reverse proxy that maps
**{PREVIEW_URL}** -> `http://<host>:{PORT}/` (the proxy **strips** the prefix
before forwarding). Any **absolute** URL the browser sees in your page --
`/assets/index-XYZ.js`, `/api/foo`, `/img/x.png` -- is sent at the page's
origin *without* the `{PREVIEW_URL}` prefix, so it escapes your product and
gets routed to the harness on a different port. Symptoms: blank app, 404s on
`/assets/...`, **401 Unauthorized on `/api/...`** (the harness password-gates
its own API), ""Failed to load module script: Expected JavaScript ... but the
server responded with a MIME type of 'text/html'"".

You need to fix this in **three places**: built-time asset URLs, runtime
fetch URLs, and the server's URL handling.

**1. Built-time asset URLs (script/link tags in index.html).** Set the
framework's base URL to `{PREVIEW_URL}`:

- **Vite**: `base: '{PREVIEW_URL}'` in `vite.config.*`
- **Create React App**: `""homepage"": ""{PREVIEW_URL}""` in `package.json`
- **Next.js**: `basePath: '{PREVIEW_URL_NO_TRAIL}'` in `next.config.*` (no trailing slash)
- **Angular**: build with `--base-href {PREVIEW_URL}`
- **Plain HTML**: prefer relative paths (`./assets/...`), or set `<base href=""{PREVIEW_URL}"">`.

**2. Runtime fetch / XHR / axios URLs.** Setting the build-time base does
NOT rewrite calls like `fetch('/api/foo')` in your JS -- those are still
hard-coded absolute paths and will escape the prefix at runtime. Derive the
API base from the framework's runtime base value so it inherits whatever
prefix you built with:

- **Vite**: `const API = import.meta.env.BASE_URL.replace(/\/$/, '')` then
  `fetch(\`${API}/api/...\`)`. Becomes `'/api/...'` when base is `'/'`
  and `'{PREVIEW_URL_NO_TRAIL}/api/...'` when base is `'{PREVIEW_URL}'`.
- **Create React App**: use `process.env.PUBLIC_URL` analogously.
- **Next.js**: prefix fetches with `process.env.NEXT_PUBLIC_BASE_PATH` (set
  it from `next.config`'s `basePath`).
- **Angular**: inject `APP_BASE_HREF` and prepend it to API URLs.
- **Plain HTML**: use relative URLs (`fetch('api/foo')`) so they resolve
  against the current page's path.

**3. Server-side URL handling.** The browser will send requests at
`{PREVIEW_URL}api/...` when accessed directly on the LAN port (no proxy in
front), and at `/api/...` when behind the proxy (which has already stripped
the prefix). The cleanest fix is a one-line URL-rewrite at the top of your
middleware chain so the rest of your routes don't care which path they
arrived through. For Express:

```js
app.use((req, _res, next) => {
  if (req.url.startsWith('{PREVIEW_URL}')) req.url = req.url.slice('{PREVIEW_URL_NO_TRAIL}'.length)
  next()
})
// then your existing app.use(express.static(...)), app.get('/api/...'), etc.
```

For other servers, the equivalent: in FastAPI use `root_path` + a small
ASGI middleware; in Django, `FORCE_SCRIPT_NAME`; in Spring, `server.servlet.context-path`.

**4. Body-less POSTs through the proxy.** IIS+ARR rejects POSTs that lack
either `Content-Length` or `Transfer-Encoding` with `HTTP 411 Length
Required`. Browsers don't always set `Content-Length: 0` for a body-less
`fetch(url, { method: 'POST' })`, so those calls work locally on the
product's own port but get 411 through the proxy. Always send at least an
empty JSON body on POST:

```js
// Bad -- 411 through the proxy
await fetch('/api/foo', { method: 'POST' })

// Good -- works locally AND through the proxy
await fetch('/api/foo', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: '{}',
})
```

**5. ARR's output cache on GET responses (the silent killer).** ARR caches
GET responses by exact URL and **ignores `Cache-Control: no-store` from the
backend** -- once a response is cached, subsequent GETs to the same URL
return the cached body until the cache entry expires, even if a POST to a
sibling URL has changed the underlying state. Symptoms look exactly like a
client-side bug:

- Click a difficulty button -> UI snaps back to the previous value 1s later.
- Click ""Start"" on a real-time game -> render flashes the moving entity,
  then snaps back to the dead/initial state.
- Game state poll appears to ""revert"" your mutations on a delay.
- Behaviour is fine on `http://<host>:{PORT}` (no cache layer) but broken on
  `{PREVIEW_URL}` (proxy with cache in the path).

This is NOT a React race condition, even though it looks identical. The
proxy is serving a frozen-in-time GET response.

Two fixes, apply at least one:

a) **Client-side cache-busting (always works, no proxy access needed).**
   Append a unique query param to every GET so each URL is a cache miss:

   ```js
   const nocache = (p) => `${p}${p.includes('?') ? '&' : '?'}_=${Date.now()}`
   await fetch(nocache('/api/state'))   // -> /api/state?_=1717543210
   ```

b) **Server-side no-store header (defence in depth, won't evict already-
   cached entries).** Add `Cache-Control: no-store` on `/api/*` responses
   so future entries don't get cached. For Express:

   ```js
   app.use('/api', (_req, res, next) => {
     res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate')
     next()
   })
   ```

   Be aware: any URL the proxy has already cached will keep serving stale
   until its TTL passes -- you usually still need (a) for an immediate fix.

After all five changes, verify (page bundle hash will change, so the proxy
self-cache might serve stale HTML -- hard-refresh in the browser):

```
curl -I http://localhost:{PORT}/                              # 200, text/html
curl -I http://localhost:{PORT}{PREVIEW_URL}                  # 200, text/html (direct-LAN form)
curl -I http://localhost:{PORT}/assets/<hash>.js              # 200, text/javascript (proxy-stripped form)
curl -I http://localhost:{PORT}{PREVIEW_URL}assets/<hash>.js  # 200, text/javascript (direct-LAN form)
curl    http://localhost:{PORT}{PREVIEW_URL}api/<your-route>  # 200 + real API JSON, not the harness's 401
```

To prove ARR's cache is the culprit (not a race), make a mutation through
the proxy and then GET twice -- once bare, once with a unique query param:

```
# Through the public host, not localhost:
curl -X POST -H 'Content-Type: application/json' -d '{...}' http://<host>{PREVIEW_URL}api/your-mutation
curl                                                          http://<host>{PREVIEW_URL}api/your-state     # might be STALE
curl                                                          http://<host>{PREVIEW_URL}api/your-state?_=1 # always FRESH
```
If the bare GET disagrees with the `?_=1` GET, you're hitting ARR's cache.";

    private const string Self = @"

### This repo is Claude Web itself (self-development)

You cannot build into the running app's own `bin/` (its `ClaudeWeb.exe` is locked)
or reuse its port. Build to an isolated dir and run on {PORT}:

```powershell
npm --prefix client install
npm --prefix client run build
dotnet build ClaudeWeb.App/ClaudeWeb.App.csproj -o .claudeweb-preview/bin
Copy-Item client/dist .claudeweb-preview/bin/client/dist -Recurse -Force
$env:CLAUDEWEB_PORT = ""{PORT}""
Start-Process .claudeweb-preview/bin/ClaudeWeb.exe
```

`.claudeweb-preview/` is gitignored. A second monitoring window appearing is
expected.";
}
