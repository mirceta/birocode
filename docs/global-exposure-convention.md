# The Global-exposure convention

This is the **canonical, agent-agnostic statement** of how an app gets onto the **public
Homepage** of Claude Web — the one surface a stranger can reach, with **no login**. It is
meant to be read directly off disk by any agent on this box. Point an agent here once and it
can expose its own product to the world correctly.

> The Claude Web harness and its own `CLAUDE.md` reference this file as the single source of
> truth. If the convention changes, change it **here** — don't re-describe it elsewhere.

## What this is (and how it differs from Local exposure)

The [Local-exposure convention](local-exposure-convention.md) puts a product on the **Local
tab** — *behind login*, reverse-proxied by the harness over **loopback**. This is the public
twin: the **App product on the Preview Port `:5200`**, embedded by the public **Homepage `/`**
(and the App tab) and fronted by an **off-box IIS + ARR** reverse proxy at the `/preview/`
path. It crosses a real public proxy, so it has **more rules** than local — the extra ones
exist to survive IIS/ARR, not the harness.

## How the public Homepage reaches your product

```
🌍 anyone (past the IP gate) ──GET https://<domain>/preview/──▶ 🛡️ IIS + ARR (public HTTPS door)
                                                                  │ strips /preview/, forwards
                                                                  ▼
                                                            🚀 your product (0.0.0.0:5200)
```

- The browser loads the public Homepage and embeds the App product via the **same-origin
  `/preview/`** path. No login — anyone who clears the IP gate sees it.
- The off-box **IIS/ARR** proxy terminates TLS, **strips the `/preview/` prefix**, and
  forwards to your product on the box at **`:5200`**.
- Direct-LAN access (`http://<host>:5200/preview/`) hits the same product with the prefix
  *not* stripped — so your product must tolerate the path arriving **both** ways.

## The five-rule contract

Local needs three rules; the public proxy adds two more. Miss any and the embed comes back
blank, 404s, 401s, returns `411`, or silently serves **stale** state.

1. **Bind `0.0.0.0:5200`.** Listen on **all interfaces**, not `localhost` — the off-box proxy
   dials the machine's address, so a loopback-only bind is unreachable. Launch the product
   **detached** (it must outlive the turn that started it) and **free the port** first.
2. **Serve at root.** `GET /` must return your page HTML. The proxy forwards the stripped
   request to `/`; serve only under a sub-path and the page is empty.
3. **Base + relative URLs for `/preview/`.** Every asset **and** runtime `fetch` URL must
   carry the `/preview/` base. Build-time: set the framework base (`Vite base:'/preview/'`,
   CRA `homepage`, Next `basePath`, Angular `--base-href`) or, for plain HTML, use `./…`.
   Runtime: derive the API base from that value (`import.meta.env.BASE_URL`) — setting the
   build base does **not** rewrite `fetch('/api/…')`. An absolute `/asset` escapes the prefix
   → blank/404; an absolute `/api/…` escapes to the harness → **401**.
4. **Body-ful POSTs.** Always send a body (even `{}`) with `Content-Type`. IIS+ARR rejects a
   `Content-Length`-less POST with **`HTTP 411 Length Required`** — so a body-less
   `fetch(url,{method:'POST'})` works on `:5200` directly but `411`s through the door.
5. **Defeat ARR's GET output cache.** ARR caches GET responses by exact URL and **ignores the
   backend's `Cache-Control: no-store`**. Cache-bust every GET (`?_=${Date.now()}`) and/or set
   `no-store` server-side; otherwise a GET after a mutating POST returns the **frozen** old
   body and the UI appears to "revert" a second later. Looks exactly like a client race — it
   isn't.

## No fallback — broken is visibly broken

There is no stand-in renderer. A product that isn't listening on `0.0.0.0:5200`, doesn't
answer `GET /`, ships absolute URLs, omits a POST body, or trusts `no-store` produces a blank
page, a 404/401, a 411, or stale state — never a masked half-success. **Verify the real public
hop**, not just `localhost`:

```
curl -I http://localhost:5200/                      # 200 text/html (root)
curl -I http://localhost:5200/preview/              # 200 text/html (direct-LAN, prefix present)
curl    https://<domain>/preview/api/<route>        # 200 real JSON, not the harness 401
# prove the cache, not a race — mutate, then GET bare vs cache-busted:
curl -X POST -H 'Content-Type: application/json' -d '{}' https://<domain>/preview/api/<mutate>
curl https://<domain>/preview/api/<state>           # may be STALE
curl https://<domain>/preview/api/<state>?_=1       # always FRESH
```

If the bare GET disagrees with the `?_=1` GET, you're hitting ARR's cache (rule 5).
