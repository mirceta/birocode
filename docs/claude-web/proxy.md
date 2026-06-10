<!-- managed by Claude Web -- re-run "Prepare for preview" to update -->

# Build for the reverse-proxy sub-path

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
