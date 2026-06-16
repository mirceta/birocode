# Reflect multi-app exposure in the local-exposure example (light touch)

> **Status (2026-06-16): DESIGN → building.** On
> `feature/exposure-example-multiapp-note`. Small, additive accuracy fix to an
> already-shipped app; **not** a multi-app demo (see Non-goals).

## Problem

The [multiple-local-apps](multiple-local-apps.md) platform upgrade (shipped,
`6721113`) changed the Local-tab proxy path: the canonical per-app route is now
`/api/localview/{repoId}/app/{appId}/`, with the **bare** `/api/localview/{repoId}/`
kept as the **default (first) app** for back-compat.

The [local-exposure-example](local-exposure-example.md)'s animated request-flow
explainer still teaches **only** the bare path — `assets/core.js` hardcodes
`GET /api/localview/<repo>/` and "dial 127.0.0.1:5305", and `index.html`'s note
references `/api/localview/<repo>/`. It isn't *wrong* (the bare path still resolves
to the default app), but it no longer mentions that a repo can expose several apps
or that each gets an `…/app/{appId}/` address.

## Scope — light accuracy touch only

Keep the example single-responsibility (teach the **per-app exposure contract** by
*being* one correct app). The per-app contract — dual-stack bind, serve at root,
relative URLs — is **unchanged** by multi-app, so no structural rewrite.

What to change:

- **`assets/core.js`** — the canonical step data every viz variant renders:
  - harness node `sub` and the request labels acknowledge the `…/app/{appId}/`
    segment (bare = the default app).
  - one short `detail` line noting a repo can expose **several** apps, each
    following this same contract.
- **`index.html`** — extend the existing relative-URL note to mention the
  `…/app/{appId}/` form (bare = default app).

The four `viz-*.js` variants render from `core.js`, so they inherit the wording —
no per-variant edits expected (their `:5305` port captions stay accurate).

## Non-goals (explicit)

- **No** second server / app switcher inside the example — that would break the
  documented minimalism (the very reason the Understanding app is harness-provided,
  per [multiple-local-apps](multiple-local-apps.md)). The **live Local-tab
  switcher** already demonstrates the multi-app capability.
- No change to the exposure contract or `serve.mjs` behaviour.

## Verification

Reload the example (`:5305`), play each of the four explainer variants: the proxy
step reads `…/app/{appId}/` with a "bare = default app" note; the multi-app line
appears; nothing else regressed; still one server, one port.
