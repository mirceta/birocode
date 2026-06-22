# global-example — a minimal product that *is* the Global-exposure contract

The **public twin of `homepage/`**. Where `homepage/` is a real product that practices the
**3-rule Local** contract (loopback, behind login, on `:5305`), this is a real product that
practices the **5-rule Global** contract: the public **Homepage** surface, *no login*, reached
through the off-box **IIS/ARR** door at `/preview/` → **`:5200`**.

It teaches by **being correct**: an agent reproduces a globally-exposed app by doing what this
one does. The canonical, agent-agnostic contract is
[`docs/global-exposure-convention.md`](../docs/global-exposure-convention.md) — this is the
worked example that points at it.

## Run it

```sh
node serve.mjs                         # binds 0.0.0.0:5200 (foreground)
# or, detached so it outlives the turn that started it (rule 1):
wscript launch-detached.vbs
```

Then open `http://localhost:5200/` (direct) — or, fronted by IIS/ARR,
`https://<domain>/preview/`. Press **Bump** and watch the counter: it fires a body-ful
`POST ./api/bump` then a cache-busted `GET ./api/state?_=…`, the two calls that only *global*
needs.

## How it satisfies each of the five rules

| # | Rule | Where |
|---|------|-------|
| 1 | **Bind `0.0.0.0:5200`** (all interfaces, detached, port free) | `serve.mjs` — `server.listen(PORT,'0.0.0.0')`; `launch-detached.vbs` |
| 2 | **Serve at root** (`GET /` → page; missing file → real 404) | `serve.mjs` static handler |
| 3 | **Base + relative URLs** (`./assets/…`, `fetch('./api/…')`) | `index.html`, `assets/app.js` |
| 4 | **Body-ful POSTs** (send `{}` or ARR 411s) | `assets/app.js` `bump()`; `serve.mjs` `/api/bump` |
| 5 | **Beat ARR's GET cache** (cache-bust `?_=…` + server `no-store`) | `assets/app.js` `getState()`; `serve.mjs` `sendJson` |

Plus the proxy-survival trick both sides need: `serve.mjs` **strips a leading `/preview/`** off
the URL, so one code path serves both the ARR-stripped request and direct-LAN access where the
prefix arrives intact.

## Verify the real hops (not just localhost)

```sh
curl -I http://localhost:5200/                 # 200 text/html  (rule 2)
curl -I http://localhost:5200/preview/         # 200 text/html  (direct-LAN, prefix present)
curl    http://localhost:5200/api/state        # {"count":0}
curl -X POST -H 'Content-Type: application/json' -d '{}' http://localhost:5200/api/bump
curl    http://localhost:5200/api/state?_=1    # {"count":1}  (rules 4 + 5)
curl -I http://localhost:5200/api/state        # Cache-Control: no-store present
```

Through the **real** public door, also prove rule 5 the way the convention doc shows — mutate,
then compare a bare GET against a cache-busted one; if they disagree you're seeing ARR's cache.
Browser-verify the live page (counter increments, no console errors) before claiming it works.

## Want another agent to do this to *its* product?

Open the running page — the **"Expose your own product globally"** card builds a copy-paste
prompt (a pointer to `docs/global-exposure-convention.md`) you drop into another on-box agent's
chat. Same move `homepage/` makes for local exposure.
