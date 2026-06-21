namespace ClaudeWeb.Services.Run;

/// <summary>
/// Writes the "preview" convention into the opened repository so Claude knows
/// how to start that project for the App tab. The detailed guides are written
/// as separate files under docs/claude-web/ (each with a single
/// responsibility); CLAUDE.md gets only a short managed pointer block telling
/// Claude which guide to read in which circumstance. This keeps CLAUDE.md slim
/// (it is loaded into every conversation) while the guides are read on demand.
///
/// The CLAUDE.md section is delimited by HTML-comment markers so re-running
/// "Prepare" is idempotent: it replaces the existing block in place instead of
/// appending duplicates. Any content the user wrote outside the markers is
/// left untouched. The doc files are overwritten wholesale on each Prepare.
/// </summary>
public static class PreviewDoc
{
    public const string Begin = "<!-- claude-web:preview (managed by Claude Web -- re-run \"Prepare for preview\" to update) -->";
    public const string End = "<!-- /claude-web:preview -->";
    public const string DocsDir = "docs/claude-web";

    private const string ManagedNote = "<!-- managed by Claude Web -- re-run \"Prepare for preview\" to update -->";

    public sealed record PrepareResult(string Action, string FileName);

    /// <summary>Builds the managed CLAUDE.md pointer block. Each bullet tells
    /// Claude when to read which guide; the guide content itself lives in
    /// docs/claude-web/ (see <see cref="WriteDocs"/>).</summary>
    public static string BuildSection(int port, string? previewUrl, bool isSelf)
    {
        var bullets =
            $"- **{DocsDir}/preview.md** — read FIRST whenever the user asks you to run,\n" +
            $"  start, or preview the app: serve on 0.0.0.0:{port}, launch detached, free\n" +
            "  the port.\n";

        if (!string.IsNullOrWhiteSpace(previewUrl))
        {
            bullets +=
                $"- **{DocsDir}/proxy.md** — read before building/serving the frontend, and\n" +
                "  when debugging a blank page, 404s on assets, 401s on /api, HTTP 411, or UI\n" +
                "  state that \"reverts\" seconds after a click: the five reverse-proxy traps\n" +
                $"  of the {previewUrl} sub-path.\n" +
                $"- **{DocsDir}/browser-testing.md** — read BEFORE claiming a UI or proxy fix\n" +
                "  works: verify with a headless Playwright browser, not just curl.\n";
        }

        if (isSelf)
        {
            bullets +=
                $"- **{DocsDir}/self-dev.md** — read before building or running this repo:\n" +
                "  it is Claude Web itself, so build to an isolated dir, never into the\n" +
                "  running app's own bin/ or port.\n" +
                $"- **{DocsDir}/redeploy.md** — read before deploying this harness to live\n" +
                "  (:5099): the snapshot → build → gated-swap → keep/rollback runbook and\n" +
                "  the self-seeding swap.ps1 / arm.ps1 / rollback.ps1 tooling.\n";
        }

        var body =
            "## Previewing this app in Claude Web\n\n" +
            $"The Claude Web \"App\" tab embeds whatever is listening on port **{port}**.\n" +
            $"Detailed guides live in `{DocsDir}/` (also managed by \"Prepare for\n" +
            "preview\"). Read the right one for the task at hand:\n\n" +
            bullets;

        return $"{Begin}\n\n{body.Trim()}\n\n{End}\n";
    }

    /// <summary>Writes the guide files under &lt;repoPath&gt;/docs/claude-web/.
    /// proxy.md and browser-testing.md are only written when this install is
    /// behind a reverse proxy; self-dev.md only for the harness's own repo.</summary>
    public static void WriteDocs(string repoPath, int port, string? previewUrl, bool isSelf)
    {
        var dir = Path.Combine(repoPath, "docs", "claude-web");
        Directory.CreateDirectory(dir);

        string Sub(string text)
        {
            text = text.Replace("{PORT}", port.ToString());
            if (!string.IsNullOrWhiteSpace(previewUrl))
            {
                var withSlash = previewUrl!.EndsWith("/") ? previewUrl : previewUrl + "/";
                text = text
                    .Replace("{PREVIEW_URL_NO_TRAIL}", withSlash.TrimEnd('/'))
                    .Replace("{PREVIEW_URL}", withSlash);
            }
            return $"{ManagedNote}\n\n{text.Trim()}\n";
        }

        File.WriteAllText(Path.Combine(dir, "preview.md"), Sub(GenericDoc));
        if (!string.IsNullOrWhiteSpace(previewUrl))
        {
            File.WriteAllText(Path.Combine(dir, "proxy.md"), Sub(ProxyDoc));
            File.WriteAllText(Path.Combine(dir, "browser-testing.md"), Sub(BrowserTestDoc));
        }
        if (isSelf)
        {
            File.WriteAllText(Path.Combine(dir, "self-dev.md"), Sub(SelfDoc));
            File.WriteAllText(Path.Combine(dir, "redeploy.md"), Sub(RedeployDoc));
        }
    }

    /// <summary>
    /// Writes the guide files and creates, updates, or appends the managed
    /// pointer section in &lt;repoPath&gt;/CLAUDE.md. Returns which action was taken.
    /// </summary>
    public static PrepareResult Prepare(string repoPath, int port, string? previewUrl, bool isSelf)
    {
        const string fileName = "CLAUDE.md";
        var path = Path.Combine(repoPath, fileName);

        WriteDocs(repoPath, port, previewUrl, isSelf);
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

    private const string GenericDoc = @"# Previewing this app in Claude Web

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

    private const string ProxyDoc = @"# Build for the reverse-proxy sub-path

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

    private const string BrowserTestDoc = @"# Test in a real headless browser, not just with curl

`curl` is the wrong lens for proxy traps 1, 2, 3 and 5 (see proxy.md) -- they
all involve **what the browser does after the page loads**: which assets it
asks for, which fetch URLs it constructs, whether `setState` from a click
sticks after the next poll. curl tells you the server responds correctly,
not whether the user sees a working product. After many ""should be fixed""
rounds that weren't, the rule is: **before claiming a UI/proxy fix works,
drive a headless browser through the user flow and screenshot it.**

Set up Playwright in the product repo (gitignored sandbox dir):

```bash
mkdir -p .preview-test && cd .preview-test
npm init -y >/dev/null
npm install playwright --no-save
npx playwright install chromium
```

Add `.preview-test/` to `.gitignore`. Then write a minimal driver that
loads the product through the **public** URL (not `localhost`, otherwise
you skip the proxy entirely and miss trap 5), clicks through the user
flow, and checks DOM state at multiple times after each action. Save the
URL to test as an env var so the same script works from anywhere:

```js
// .preview-test/play.mjs -- run with: PUBLIC_URL=http://<your-host>{PREVIEW_URL} node play.mjs
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'

const URL = process.env.PUBLIC_URL || 'http://localhost:{PORT}{PREVIEW_URL}'
const OUT = '.preview-test/out'; mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage()
const requests = []
page.on('response', r => requests.push({
  method: r.request().method(),
  url: r.url(),
  status: r.status(),
  ctype: r.headers()['content-type'],
}))
page.on('console', m => console.log('[browser]', m.type(), m.text()))

await page.goto(URL, { waitUntil: 'networkidle' })
await page.screenshot({ path: `${OUT}/01-loaded.png` })

// ... click buttons, wait, check DOM state ...
// e.g. for a value that should stick after a click:
//   await page.getByRole('button', { name: 'Medium' }).click()
//   await page.waitForTimeout(50)
//   console.log('+50ms:', await page.$eval('.diff-btn.active', el => el.textContent))
//   await page.waitForTimeout(2500)
//   console.log('+2.5s:', await page.$eval('.diff-btn.active', el => el.textContent))
// If +50ms and +2.5s diverge, you have trap 5 (ARR cache).

await browser.close()
writeFileSync(`${OUT}/requests.json`, JSON.stringify(requests, null, 2))
```

Run it after every change that touches build config, proxy behaviour, or
fetch logic. Compare `out/requests.json` -- if you see GETs to bundle
hashes that aren't in `dist/`, traps 1-3 are still leaking; if you see
401s on `/api/*`, trap 2 is leaking; if a button click's effect reverts
2s later in the screenshots, trap 5 is leaking.

Common ""it works in curl but the screenshot is broken"" scenarios:

- **The bundle hash in the served HTML is fresh, but the screenshot is
  blank.** Usually the browser fetched an *old* bundle hash referenced by
  a CACHED `index.html` -- add `Cache-Control: no-store` on `index.html`
  and the SPA-fallback handler must `404` for missing `/assets/*` (not
  return HTML) so the failure is visible.
- **Single curl works, but rapid POST/GET cycles in the browser show
  stale state.** Trap 5 (cache). Cache-bust GETs.
- **Headless browser shows correct first render, then snaps back.** Either
  trap 5 (cache returns stale on poll) or a real race condition. Test by
  pausing polling temporarily; if the bug disappears, it's a poll
  interfering -- but the cause is almost certainly the proxy cache (which
  makes polls return stale data), not the polls themselves.";

    private const string SelfDoc = @"# This repo is Claude Web itself (self-development)

You cannot build into the running app's own `bin/` (its `ClaudeWeb.exe` is locked)
or reuse its port. Build to an isolated dir and run on {PORT}:

```powershell
npm --prefix client install
npm --prefix client run build
dotnet build ClaudeWeb.App/ClaudeWeb.App.csproj -o .claudeweb-preview/bin
# robocopy /MIR, NOT Copy-Item: when the dest client/dist already exists Copy-Item
# nests the build into client/dist/dist (stale top-level shadows it). /MIR mirrors
# exactly and purges stale hashes. Exit codes 0-3 are success.
robocopy client/dist .claudeweb-preview/bin/client/dist /MIR /NFL /NDL /NJH /NP | Out-Null
$env:CLAUDEWEB_PORT = ""{PORT}""
Start-Process .claudeweb-preview/bin/ClaudeWeb.exe
```

`.claudeweb-preview/` is gitignored. A second monitoring window appearing is
expected.

## Deploy rule — NEVER deploy a tree that is missing origin/main

Three times on 2026-06-11/12, parallel self-dev sessions silently clobbered
each other's DEPLOYED features off live (files-tree-view, auth-ip-filter — a
live security gate) by deploying from a branch that predated origin/main.

Before ANY production deploy of this repo:

1. `git fetch origin`
2. `git merge-base --is-ancestor origin/main HEAD` must succeed — if not,
   merge main into your branch first and re-verify.
3. Stage the backend AND build the frontend from that same tree, then swap.

This is also ENFORCED at the chokepoint: the deploy `swap.ps1` aborts (and
leaves the live harness untouched) when the working tree does not contain
origin/main. Do not bypass it by hand-copying binaries. The Git tab's drift
warning (plans/git-origin-visibility.md) shows the danger before you deploy.";

    private const string RedeployDoc = @"# Redeploy this harness to live (:5099)

The production deploy runbook for the harness's OWN repo (self-development).
Read **self-dev.md first** — it covers the isolated-build rule and the
origin/main gate that this procedure depends on.

## What drives a deploy

The tooling lives **off-repo** in `<parent-of-repo>/claudeweb-rollback/` (a
rollback reverts the working tree, so its own scripts must live outside it).
Three scripts run it, and all three are **seeded automatically on first run**
by `DeployScriptProvisioner` from templates in `ClaudeWeb.App/Deploy/templates/`
— with this machine's paths substituted in. So on a fresh checkout they appear
by themselves; you never copy them by hand.

- **swap.ps1** — the gated swap: aborts if origin/main is missing, stops the
  harness, mirrors the staged build into the live bin (`robocopy /MIR`),
  restarts, health-checks `:5099`, appends the `deploys.jsonl` ledger, and
  **auto-rolls-back if the health check fails**.
- **arm.ps1** — arms a dead-man's switch (Windows scheduled task
  `ClaudeWebAutoRollback`) that runs rollback.ps1 in **15 minutes** unless you
  disarm it.
- **rollback.ps1** — restores the `.lastgood` snapshots (bin + client/dist)
  and restarts. Safe to run by hand at any time.

The **Deployments tab** only *reads* this (status + history) and lets you
**""Keep it""** (disarm) or trigger a manual rollback. It does **not** build or
push the forward deploy — that is the procedure below.

## Where the pieces live (read this before you build)

- **Live exe**: `ClaudeWeb.App\bin\Release\net8.0-windows\ClaudeWeb.exe`
  (locked while the harness runs — never build into it).
- **Frontend**: the live app serves `client/dist` **from the bin beside the
  exe** — `EmbeddedApi.ResolveDistPath` checks `<bin>\client\dist` first and
  only falls back to `<repo>\client\dist` when the bin has none. The live exe
  runs from `bin\Release\net8.0-windows`, which has a `client/dist`, so the bin
  copy wins. You must therefore **stage the built frontend into the bin** so
  swap mirrors it in; `npm run build` alone only updates the repo tree, which
  the running app ignores.
- **Backend staging dir**: `.claudeweb-deploy\bin` (gitignored). You build the
  backend Release here AND stage `client/dist` into it; swap.ps1 mirrors the
  whole thing into the live bin with `robocopy /MIR` — which also **purges**
  files not in the source, so a frontend you forget to stage gets deleted off
  live.

## The procedure (run from the repo root)

Steps 1–5 are yours; step 6 hands off to the seeded scripts.

**1. Pass the gate** (also enforced inside swap.ps1 — check it first so you
don't waste a build):

```powershell
git fetch origin
git merge-base --is-ancestor origin/main HEAD   # must exit 0; else merge main first
```

**2. Snapshot the currently-live bin to `.lastgood`** — rollback's restore
point (it captures the live backend *and* its bundled `client/dist`):

```powershell
$bin = 'ClaudeWeb.App\bin\Release\net8.0-windows'
robocopy $bin ""$bin.lastgood"" /MIR /NFL /NDL /NJH | Out-Null
robocopy client\dist client\dist.lastgood /MIR /NFL /NDL /NJH | Out-Null
```

**3. Build the frontend** (updates `<repo>\client\dist`):

```powershell
npm --prefix client run build
```

**4. Build the backend Release into the STAGING dir** (never the locked live
bin):

```powershell
dotnet build ClaudeWeb.App/ClaudeWeb.App.csproj -c Release -o .claudeweb-deploy\bin
```

**5. Stage the built frontend INTO the staged bin** so swap carries it into
the live bin (the copy the app actually serves):

```powershell
robocopy client\dist .claudeweb-deploy\bin\client\dist /MIR /NFL /NDL /NJH | Out-Null
```

**6. Arm the dead-man's switch, then run the gated swap** (both from the
seeded dir):

```powershell
$deploy = (Resolve-Path ..\claudeweb-rollback).Path
powershell -ExecutionPolicy Bypass -File ""$deploy\arm.ps1""
powershell -ExecutionPolicy Bypass -File ""$deploy\swap.ps1""
```

swap.ps1 **stops the harness that is driving you**, so expect your turn's
connection to drop — the swap finishes on its own and restarts `:5099`.

## After the swap

- **Verify**: `curl http://localhost:5099/api/health` returns **200**, then
  load the UI in a real browser (see browser-testing.md).
- **Good** → open the **Deployments tab** and click **""Keep it""** to disarm
  the 15-minute rollback. If you do nothing, rollback.ps1 fires automatically.
- **Bad** → swap's own health check has likely already auto-rolled-back. To
  force it: run `rollback.ps1`, or use the Deployments tab's **Rollback**.

## Logs / ledger (in the seeded dir)

- `swap.log` / `rollback.log` — per-run trace.
- `deploys.jsonl` — append-only history the Deployments tab reads (commit,
  subject, healthOk, event).";
}
