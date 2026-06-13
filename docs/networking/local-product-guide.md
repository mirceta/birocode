# Exposing a local product to the Local tab

A HOWTO for the agent building an app that should show up in Claude Web's
**Local tab**. This is the *contract* a product must meet to be embeddable —
derived from the working `web-flow-autodev` pilot. Drop a link to this in
your product repo's `CLAUDE.md`, or just follow it.

> Hand-copying this into each product repo drifts over time — making the
> setup harness-driven and verifiable instead is the
> [product-onboarding](../../plans/product-onboarding.md) design.

Context for *why* (the harness side): [surfaces.md](surfaces.md) and
[../../plans/local-app-proxy.md](../../plans/local-app-proxy.md). The Local
tab embeds the same-origin path `/api/localview/{repoId}/`, and the harness
reverse-proxies it to `127.0.0.1:<your port>` after **stripping the prefix**.
So your app just needs to behave like a normal app served at its own root —
with two adjustments.

## The contract (3 things)

### 1. Bind dual-stack on a fixed port

Serve on **all interfaces, both IPv6 and IPv4**. The harness connects to
`127.0.0.1:<port>` server-side, and browsers/tools resolve `localhost` to
`::1` (IPv6) **first** — so an IPv4-only bind (`0.0.0.0`) makes it a
coin-flip. Make the port configurable (env var) with a sensible default.

```csharp
// .NET / Kestrel (what the pilot uses) — ListenAnyIP binds [::] dual-stack
var port = int.TryParse(Environment.GetEnvironmentVariable("APP_PORT"), out var p) ? p : 5300;
builder.WebHost.ConfigureKestrel(o => o.ListenAnyIP(port));
```

```js
// Node / Express — '::' dual-stacks on Windows/Linux defaults
const port = process.env.APP_PORT || 5300;
app.listen(port, '::');
```

> Do NOT bind `http://0.0.0.0:<port>` only / `127.0.0.1` only — that's the
> #1 reason a Local tab loads blank while `curl 127.0.0.1:<port>` works.

### 2. Serve your app at the root (`/`)

The harness strips `/api/localview/{repoId}/` before forwarding, so your
server receives plain `/`, `/assets/...`, `/api/...`. **Don't** configure a
server-side base path — serve at root as if there were no proxy. (This is
simpler than the App-tab `/preview/` path, which *does* need server-side
prefix handling.)

### 3. Use RELATIVE URLs in the frontend

The iframe's document URL is `/api/localview/{repoId}/` (note the trailing
slash), so **relative** URLs resolve under that prefix — and the harness
strips the prefix back off when forwarding. **Absolute** URLs (leading `/`)
escape the prefix and hit the harness origin instead → 404.

- **Assets** — set the bundler base to relative:
  ```js
  // vite.config.js
  export default defineConfig({ base: './', /* ... */ });
  // → emits ./assets/app.js, not /assets/app.js
  ```
- **API calls** — relative, no leading slash:
  ```js
  fetch('api/forms')      // ✅ resolves to /api/localview/{repo}/api/forms
  fetch('/api/forms')     // ❌ escapes to the harness origin
  ```

That's the whole contract. No `<base>` tag, no prefix middleware, no
cache-busting — the harness proxy handles the rest.

## Run it, then point the Local tab at it

1. Build the frontend into wherever the server serves static files, then
   start the server **detached** (so it outlives the agent turn) on your
   port — e.g. `Start-Process` on Windows, `nohup … & disown` on *nix.
2. In Claude Web: **Projects** → add/select your product's repo → **Local**
   tab → set the port. It's remembered per project (backend-synced).

## Verify (before claiming it works)

```
# both must answer 200 — the IPv6 one is the common miss:
curl http://127.0.0.1:<port>/        # IPv4
curl http://[::1]:<port>/            # IPv6  (fails ⇒ not dual-stack, fix #1)
```

Then open the **Local** tab and confirm the app renders *and* its own API
calls succeed (they travel back through `/api/localview/{repo}/…`). If assets
404 or the page is blank-but-up, you used absolute URLs (fix #3).

## Caveats

- **WebSockets do not work** through the Local tab — the proxy doesn't perform
  the `Upgrade` handshake. Plain HTTP streaming (SSE / long-poll) flows
  through (the proxy streams response bodies) but is lightly tested; prefer
  request/response for anything that must be robust.
- **The raw LAN port is unauthenticated.** Anyone on the LAN can hit
  `192.168.0.215:<port>` directly — only the harness-proxied *internet* path
  is behind the password. Don't expose secrets or destructive actions on a
  local product without your own auth.
- **Reference implementation:** `web-flow-autodev/web` (`Autodev.Web`
  Kestrel + Vite `base:'./'` + relative `fetch('api/…')`).
