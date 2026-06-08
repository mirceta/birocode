# Claude Web — working notes for Claude

This repo is **Claude Web**, a phone-accessible harness that runs Claude Code
over a repository. It is a C# .NET 8 WinForms app with an embedded Kestrel server
(`ClaudeWeb.App/`) plus a React/Vite frontend (`client/`). When you are editing
this repo *through the app itself*, you are improving the very tool you're running
in ("self-development").

## Build / run the harness normally

```
npm --prefix client run build      # build the frontend (client/dist)
dotnet run --project ClaudeWeb.App # run the harness (GUI + Kestrel on :5099)
```

The "App tab" preview instructions below are managed by the app's
**Prepare for preview** button — re-run it to refresh them.


<!-- claude-web:preview (managed by Claude Web -- re-run "Prepare for preview" to update) -->

## Previewing this app in Claude Web

The Claude Web "App" tab embeds whatever is listening on **port 5200**. When the
user asks you to run, start, or preview the app:

1. Start it listening on **0.0.0.0:5200** (not localhost) so it is reachable
   from the phone over the LAN.
2. Launch it **detached** so it keeps running after your turn ends. Claude Web
   runs you via `claude -p` (one-shot), so a normal child process dies when the
   turn finishes. Windows: `Start-Process`. macOS/Linux: `nohup ... & disown`.
3. Free the port first if something already holds it:
   - Windows: `Get-NetTCPConnection -LocalPort 5200 -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
   - macOS/Linux: `lsof -ti tcp:5200 | xargs -r kill`
4. Use this repository's own stack and scripts to start it.

### Build for the reverse-proxy sub-path

This Claude Web install fronts the App tab through a reverse proxy that maps
**/preview/** -> `http://<host>:5200/` (the proxy **strips** the prefix
before forwarding). Any **absolute** URL the browser sees in your page --
`/assets/index-XYZ.js`, `/api/foo`, `/img/x.png` -- is sent at the page's
origin *without* the `/preview/` prefix, so it escapes your product and
gets routed to the harness on a different port. Symptoms: blank app, 404s on
`/assets/...`, **401 Unauthorized on `/api/...`** (the harness password-gates
its own API), "Failed to load module script: Expected JavaScript ... but the
server responded with a MIME type of 'text/html'".

You need to fix this in **three places**: built-time asset URLs, runtime
fetch URLs, and the server's URL handling.

**1. Built-time asset URLs (script/link tags in index.html).** Set the
framework's base URL to `/preview/`:

- **Vite**: `base: '/preview/'` in `vite.config.*`
- **Create React App**: `"homepage": "/preview/"` in `package.json`
- **Next.js**: `basePath: '/preview'` in `next.config.*` (no trailing slash)
- **Angular**: build with `--base-href /preview/`
- **Plain HTML**: prefer relative paths (`./assets/...`), or set `<base href="/preview/">`.

**2. Runtime fetch / XHR / axios URLs.** Setting the build-time base does
NOT rewrite calls like `fetch('/api/foo')` in your JS -- those are still
hard-coded absolute paths and will escape the prefix at runtime. Derive the
API base from the framework's runtime base value so it inherits whatever
prefix you built with:

- **Vite**: `const API = import.meta.env.BASE_URL.replace(/\/$/, '')` then
  `fetch(\`${API}/api/...\`)`. Becomes `'/api/...'` when base is `'/'`
  and `'/preview/api/...'` when base is `'/preview/'`.
- **Create React App**: use `process.env.PUBLIC_URL` analogously.
- **Next.js**: prefix fetches with `process.env.NEXT_PUBLIC_BASE_PATH` (set
  it from `next.config`'s `basePath`).
- **Angular**: inject `APP_BASE_HREF` and prepend it to API URLs.
- **Plain HTML**: use relative URLs (`fetch('api/foo')`) so they resolve
  against the current page's path.

**3. Server-side URL handling.** The browser will send requests at
`/preview/api/...` when accessed directly on the LAN port (no proxy in
front), and at `/api/...` when behind the proxy (which has already stripped
the prefix). The cleanest fix is a one-line URL-rewrite at the top of your
middleware chain so the rest of your routes don't care which path they
arrived through. For Express:

```js
app.use((req, _res, next) => {
  if (req.url.startsWith('/preview/')) req.url = req.url.slice('/preview'.length)
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
- Click "Start" on a real-time game -> render flashes the moving entity,
  then snaps back to the dead/initial state.
- Game state poll appears to "revert" your mutations on a delay.
- Behaviour is fine on `http://<host>:5200` (no cache layer) but broken on
  `/preview/` (proxy with cache in the path).

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
curl -I http://localhost:5200/                              # 200, text/html
curl -I http://localhost:5200/preview/                  # 200, text/html (direct-LAN form)
curl -I http://localhost:5200/assets/<hash>.js              # 200, text/javascript (proxy-stripped form)
curl -I http://localhost:5200/preview/assets/<hash>.js  # 200, text/javascript (direct-LAN form)
curl    http://localhost:5200/preview/api/<your-route>  # 200 + real API JSON, not the harness's 401
```

To prove ARR's cache is the culprit (not a race), make a mutation through
the proxy and then GET twice -- once bare, once with a unique query param:

```
# Through the public host, not localhost:
curl -X POST -H 'Content-Type: application/json' -d '{...}' http://<host>/preview/api/your-mutation
curl                                                          http://<host>/preview/api/your-state     # might be STALE
curl                                                          http://<host>/preview/api/your-state?_=1 # always FRESH
```
If the bare GET disagrees with the `?_=1` GET, you're hitting ARR's cache.

### Test in a real headless browser, not just with curl

`curl` is the wrong lens for any of these except trap 4. Traps 1, 2, 3, 5 all
involve **what the browser does after the page loads** -- which assets it
asks for, which fetch URLs it constructs, whether `setState` from a click
sticks after the next poll. curl tells you the server responds correctly,
not whether the user sees a working product. After many "should be fixed"
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
// .preview-test/play.mjs -- run with: PUBLIC_URL=http://<your-host>/preview/ node play.mjs
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'fs'

const URL = process.env.PUBLIC_URL || 'http://localhost:5200/preview/'
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

Common "it works in curl but the screenshot is broken" scenarios:

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
  makes polls return stale data), not the polls themselves.

### This repo is Claude Web itself (self-development)

You cannot build into the running app's own `bin/` (its `ClaudeWeb.exe` is locked)
or reuse its port. Build to an isolated dir and run on 5200:

```powershell
npm --prefix client install
npm --prefix client run build
dotnet build ClaudeWeb.App/ClaudeWeb.App.csproj -o .claudeweb-preview/bin
Copy-Item client/dist .claudeweb-preview/bin/client/dist -Recurse -Force
$env:CLAUDEWEB_PORT = "5200"
Start-Process .claudeweb-preview/bin/ClaudeWeb.exe
```

`.claudeweb-preview/` is gitignored. A second monitoring window appearing is
expected.

<!-- /claude-web:preview -->
