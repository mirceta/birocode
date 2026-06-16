# Local-exposure example — a real product that teaches Local-tab exposure

> Editing this plan? First read [doc principles](doc-principles.md).

> **Status (2026-06-16): Shipped.** Built, verified, merged to main. On
> `feature/local-exposure-example`. A standalone product — **not** a harness
> change — so there is nothing to "deploy"; it runs on the self-repo's Local port
> and is viewable on the Local tab as-is.

## The problem

We tell agents how to expose a web app on the Local tab (one loopback port,
dual-stack bind, serve at root, relative URLs — see
[the two serving paths](serving-model-paths.md) / [Local tab over the
internet](local-app-proxy.md)), but there was **no live, correct example** to
copy. An earlier attempt baked an "Exposure Helper" *into the harness* — which
made it harness chrome, not a reproducible example, and added ~300 lines of
harness surface. That approach was abandoned (archived on
`origin/feature/serving-model-clarity`).

## What shipped

A real product under `exposure-example/` that **runs on the self-repo's Local
port (5305)** the normal way and reaches the Local tab through the **existing**
`/api/localview/<repo>/` proxy — **zero harness changes**. It teaches by *being*
a correctly-exposed app: an agent reproduces it by doing what the page itself
does.

- **`serve.mjs`** — a dependency-free dual-stack static server (binds `::` with
  dualstack on → answers 127.0.0.1 *and* [::1]), serves at root, sets `no-store`
  on HTML. It is itself the contract demonstration.
- **`index.html` + `assets/`** — a plain HTML/CSS/JS app (no framework, no build,
  no `node_modules`) so the ~10 files that matter are readable end to end.
- **Centerpiece: an animated request-flow explainer** (Browser → harness proxy →
  `127.0.0.1:5305` → your app → back) with **four switchable visualization
  styles**, sharing one canonical data source (`assets/core.js`) so the story is
  identical and only the presentation differs:
  - **A · Pipeline** — a token rides the wire between three actors.
  - **B · Sequence** — UML-style lifelines; arrows draw top-to-bottom.
  - **C · Layers** — the request dives through the loopback boundary and the
    response climbs back (best at the dual-stack idea).
  - **D · Step-through** — click hop-by-hop with full per-step explanation + the
    contract-rule callout.

Each variant self-registers and exposes a uniform `play/pause/reset/destroy`
controller driven by the shell (`assets/app.js`).

## Why vanilla, not a framework

The value is being the smallest copyable example. A build step would bury the
meaningful files under dependencies and — ironically — fight the very
relative-asset trap the page teaches (a built SPA defaults to absolute
`/assets/...` and 404s under the proxy until `base: './'`). If we ever want to
*demonstrate* that trap, the move is an additive sibling demo, not a rewrite.

## Verification

Served dual-stack (127.0.0.1 + [::1]), at root; relative assets resolve **both**
directly and **under the harness proxy sub-path**; all four variants render with
no console errors (checked directly on :5305 and through a harness Local-tab
proxy).

## Deferred / archived

- The two genuinely-useful bits from the abandoned harness approach — a
  **repo-aware `/api/expose/check`** and an **SSRF port guard** — are real
  improvements but *are* harness changes, so they are left for their own planned
  task. Recoverable from `origin/feature/serving-model-clarity`.
- A framework "gotcha" sibling demo (the `base: './'` failure + fix). Not built.
