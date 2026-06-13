# Local tab over the internet — harness-proxied, authenticated, not on the landing

> **Status (2026-06-13):** Implemented on `feature/local-app-proxy` and
> browser-verified on :5201 — `verify-local-app-proxy.mjs` 7/7 (401 unauth,
> 404 unknown repo, iframe uses the same-origin proxy path, pilot renders
> THROUGH the proxy incl. proxied api/forms, landing unaffected; screenshot
> read) + API checks (proxied api/forms = 408 forms). Pilot made sub-path
> aware on `feature/web-pilot` (Vite base './', relative fetch). Not yet
> deployed. Decisions locked (user said "start work", accepting the reversal):
> 1) the selected project's local product is **exposed to the internet
> behind the harness password** — LAN-only is reversed on purpose;
> 2) **proxy-only** — the LAN-direct iframe is replaced, not kept
> (also fixes the earlier IPv6/HTTPS/mixed-content failures);
> 3) gating is the **global session+IP gate** via the `/api/` path, no
> extra per-path restriction.
> One assumption still verified during testing, not blocking: the harness
> root is internet-reachable through `next5.birokrat.si` (Guests/IP-intel
> imply yes). The proxy design is correct over any origin that reaches the
> harness regardless; this only decides whether "internet" literally works.

## What the user wants

Make the Local tab's per-project product reachable **over the internet**,
not just the LAN. The contrast they drew:

- **App tab** → its product is the **public landing page** (`/`,
  `Landing.jsx`), shown to anyone with no login.
- **Local tab** → its product should be visible **only inside the harness,
  after clicking the Local tab** — gated by the harness login, never on the
  landing page.

## ⚠️ Convention + security reversal (must confirm first)

1. **Reverses LAN-only.** [local-app-tab](local-app-tab.md) deliberately
   served the local port by **direct iframe on the LAN**, with *none* of the
   `/preview/` proxy machinery, precisely so project data (e.g. the
   web-flow-autodev exposure database — internal VB6 form data) never leaves
   the LAN. This plan puts it on the internet. That data becomes
   internet-reachable — **behind the harness password**, but off-LAN. The
   user chose the opposite earlier; confirm the reversal.
2. **Re-introduces the five proxy traps.** Serving the product through the
   harness means serving it under a **sub-path**, which brings back exactly
   the base-href / asset-URL / API-URL / cache / HTTP-411 traps documented
   in [proxy guide](../docs/claude-web/proxy.md) — the thing the Local tab
   was built to avoid. The embedded product must become sub-path-aware.
3. **Unlike `/preview/`, this path will be AUTHENTICATED.** The off-box IIS
   forwards `/preview/`→:5200 ungated (a recorded, accepted hole). The new
   path rides the harness's own origin and sits **behind the session
   cookie** — strictly better for privacy.

## Why it must be a harness-side proxy (not an IIS rule)

The public proxy (`next5.birokrat.si` → off-box IIS at 89.212.3.156) is
**not editable from this box** (project memory). So we cannot add a
`/localpreview/`→:5300 forward there. The only way to expose the local port
over the internet is to ride the harness's **own** origin (:5099), which the
IIS already forwards. So the harness reverse-proxies the local port itself.

> **Assumption to confirm:** the harness UI (`:5099` root) is already
> reachable from the internet through `next5.birokrat.si`, behind the
> password + IP filter (the Guests/IP-intel features imply it is). If the
> root is *not* forwarded and only `/preview/` is, this approach can't reach
> the internet either and we'd need an off-box IIS change (impossible from
> here).

## Design

### Authenticated reverse proxy in the harness

`GET/POST/... /api/localview/{repoId}/{**rest}` →
`http://127.0.0.1:{repo.LocalPort}/{rest}`.

- **Under `/api/`** so the existing `PasswordAuthMiddleware` gates it with
  zero security-critical middleware edits — the same-origin iframe sends the
  session cookie automatically, so a logged-in operator sees it and a
  stranger gets 401.
- **SSRF-bounded:** the path carries a **repoId**, resolved to that repo's
  configured `LocalPort`; the proxy only ever connects to
  `127.0.0.1:<that port>`. No arbitrary host/port from the URL — only
  localhost ports the operator explicitly set.
- Streams request/response bodies and copies status + headers; drops
  hop-by-hop headers. `HttpClient` (registered singleton / `IHttpClientFactory`).

### Sub-path handling (the unavoidable cost)

The product is served under `/api/localview/{repoId}/`. To make relative
URLs resolve there without baking the repoId into the build:

- The proxy **injects `<base href="/api/localview/{repoId}/">`** into the
  product's `index.html` as it streams (single-pass, only on the HTML
  document). All **relative** asset/API URLs then resolve under the
  sub-path; the proxy strips the prefix before forwarding to the product.
- The product must use **relative URLs** (Vite `base: './'`, fetch via
  `document.baseURI`) — the [proxy guide](../docs/claude-web/proxy.md)
  playbook. The **web-flow-autodev pilot** (`feature/web-pilot`) gets this
  update as the first consumer.

### Frontend (Local tab)

`LocalApp.jsx` iframes the **same-origin** path
`/api/localview/{currentRepoId}/` instead of `http://<host>:<port>` directly.
Bonus: this also fixes the earlier **IPv6/localhost/mixed-content** failures
for free — the connection to `127.0.0.1:port` happens **server-side**, and
the iframe is same-origin/same-scheme as the harness. The LAN-only fallback
(today's direct iframe) can stay as an option or be dropped — see Q2.

### Landing page is untouched

`Landing.jsx` keeps showing only the App-tab product (:5200). The Local
product is never added to `/`, satisfying "only when I click the Local tab."

## Resolved (was: open questions)

1. Reversal **accepted** — internet-reachable behind the harness password.
2. **Proxy-only**; the LAN-direct iframe is removed.
3. Gating is the existing global session + IP-allowlist gate (the `/api/`
   path inherits it); no extra per-path restriction.

## Implementation

1. Backend: `LocalProxyController` (or middleware) at `/api/localview/...`,
   `HttpClient` wiring, repoId→LocalPort resolution, `<base>` injection,
   prefix strip, header/stream copy.
2. Frontend: `LocalApp.jsx` → same-origin iframe; tidy the port form copy
   (it's now an internet-reachable preview).
3. Pilot: make `web-flow-autodev/web` sub-path-aware (relative base + API).
4. i18n; plan/dashboard updates.

## Verification (planned)

`verify-local-app-proxy.mjs` on :5201: with a marker app on a test port and
a test repo's `LocalPort` set, the iframe at `/api/localview/{repoId}/`
renders it; an **unauthenticated** request to the same path gets **401**
(the gate works); a repoId with no LocalPort 404s; SSRF probe (path tricks)
can't reach a non-registered port; landing page still shows only the App
product. Then end-to-end with the pilot through the proxy path, screenshot
read.
