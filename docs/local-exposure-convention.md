# The Local-exposure convention

This is the **canonical, agent-agnostic statement** of how an app gets onto the Claude Web
**Local tab**. It is meant to be read directly off disk by any agent on this box — including
agents working in *other* repos. Point an agent here once and it can expose its own product
on the Local tab correctly.

> The Claude Web harness and its own `CLAUDE.md` reference this file as the single source of
> truth. If the convention changes, change it **here** — don't re-describe it elsewhere.

## What this is (and how it differs from the Understanding app)

The [Understanding-app convention](understanding-app-convention.md) is for static explainer
SPAs the **harness serves for you** — you never run a server. This is the opposite case: a
**real product that you, the agent, run yourself** (a dev server, an API, a SPA with a
backend). You start it; the harness reverse-proxies it into the Local tab. Your job is to
make the running product satisfy the three-rule contract below so the proxy hop works.

## How the Local tab reaches your product

```
📱 phone/browser ──GET /api/localview/<repo>/app/<appId>/──▶ 🧩 harness (Kestrel :5099)
                                                              │ dials loopback
                                                              ▼
                                                        🚀 your product (its own port)
```

- The browser asks the **harness** for your product under the per-app proxy sub-path
  `/api/localview/<repo>/app/<appId>/`.
- A repo can expose **several apps**, each at `…/app/<appId>/`; the bare
  `/api/localview/<repo>/` is a shortcut to the **default (first)** app.
- The harness forwards the request to your product on **loopback** and streams the response
  back, living under that sub-path.
- Registering your product's port as a Local app for the repo is the **operator's**
  deliberate step (the Local setup form). You make the product conform; the operator wires
  the port.

## The three-rule contract

Get these three right and the embed works. Miss one and the tab comes back blank or 404s.

1. **Dual-stack bind.** Listen on **`127.0.0.1` AND `[::1]`**. The harness dials `127.0.0.1`
   and its health check also probes `[::1]`, so binding only one stack makes the embed come
   back blank. Binding `0.0.0.0` plus `[::]` (or your framework's "all interfaces" on both
   families) satisfies this.
2. **Serve at root.** `GET /` must return your page HTML. The harness forwards the request to
   `/` on your product — if you only serve under your own sub-path, the root returns nothing
   and the tab is empty.
3. **Relative URLs only.** Reference assets as `./assets/app.js`, never `/assets/app.js`. The
   browser resolves them **under** the proxy sub-path; a leading slash escapes the sub-path
   and 404s.

## No fallback — broken is visibly broken

There is no stand-in renderer. A product that isn't listening, doesn't answer `GET /`, or
ships absolute URLs produces a blank tab or a plain 404 — never a masked half-success. So
verify the real hop (load the Local tab, watch the asset requests resolve under the
sub-path), don't just assume the proxy will paper over a mistake.
