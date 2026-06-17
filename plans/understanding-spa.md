# Understanding app → host a full SPA, not just a Mermaid diagram

> Editing this plan? First read [doc principles](doc-principles.md).

> **Status (2026-06-16): BUILT — pending browser verification.** On
> `feature/understanding-spa` (`b6d9d34`). `UnderstandingApp` now serves an
> agent-authored static SPA from `understanding-app/` at the repo root (stack
> copied from `birokrat-architecture/viz/`); the single-Mermaid renderer + bundled
> `mermaid.min.js` are removed, with **no Mermaid fallback** (missing index → an
> explicit empty state; missing asset → 404). Deployed to live :5099; awaiting an
> authed browser check (the proxy needs the password, which the agent lacks).

## Problem

The [Understanding app](multiple-local-apps.md) (harness-provided, always-on,
served at `/api/localview/{repoId}/app/understanding/`) renders **only** a single
rolling-latest **Mermaid** diagram the agent writes to `understanding-diagram.mmd`
(`Services/Understanding/UnderstandingApp.cs` — one server-rendered page that polls
`./diagram` and calls `mermaid.render`).

A Mermaid diagram isn't expressive enough for many complex ideas. Sometimes the
clearest way to explain a hard task — or to give the user a bespoke visualization —
is a **full single-page app**: interactive, animated, stateful, multi-view. We want
the Understanding surface to be able to host an agent-authored **SPA**, dedicated
purely to *understanding / visualization* (not a product, not exposed to the
internet — same always-on, behind-the-password local surface).

## Goal

Let an agent author a real SPA for the Understanding app, which the harness builds
(or serves) and shows in the Local tab's Understanding surface — while keeping the
zero-effort Mermaid path as the simple default for quick diagrams.

## Reference stack — birokrat-architecture `viz/` (captured)

Copied to `C:\Users\km\Desktop\playground\birokrat-architecture`. The visualization
app lives in `viz/` and is deliberately built to **our Local-tab contract**
(`docs/constraint-local-tab.md` mirrors our exposure-example rules). The stack:

- **Host:** ASP.NET Core minimal web app (`Microsoft.NET.Sdk.Web`, **net9.0**),
  Kestrel `ListenAnyIP(PORT)` (dual-stack IPv4+IPv6, port via `PORT` env, default
  5080), `UseDefaultFiles` + `UseStaticFiles` serving `wwwroot/` at root, with
  aggressive **no-store** headers (actively-edited tool, never serve stale assets).
  ~25 lines of `Program.cs`; no controllers, no DB, no WebSockets.
- **Frontend:** a **self-contained, build-less SPA** in `wwwroot/` — `index.html` +
  vanilla `app.js` / `mapcore.js` / `styles.css`, data as `data.js` / `model.json`,
  and a **vendored** `lib/cytoscape.min.js` (offline graph-viz lib). Relative URLs
  only. A `versions/` folder keeps prior map snapshots.
- **Tooling:** Node scripts in `viz/tools/` (`gen-model.js`, `snap-map.js`) that
  generate the model/snapshots — authoring helpers, not part of serving.

**Why it fits us:** it's the same "harness serves static content at the Local-tab
path" shape as our current Understanding app — but a **folder of SPA assets**
(HTML + JS + vendored libs + data) instead of one hardcoded Mermaid page, and **no
build step** (vanilla JS + vendored lib), which sidesteps the build-pipeline open
question entirely.

## Design tension to settle (flagged)

`multiple-local-apps.md` deliberately chose **Mermaid, rolling-latest, generic
renderer** for simplicity and said to "escalate to richer surfaces only if it proves
unreliable." This feature is that escalation — a conscious expansion of the
Understanding app from a fixed renderer to an **SPA host**. Keep the Mermaid mode as
the lightweight default; the SPA is the opt-in richer path.

## Sketch (to firm up once the stack is known)

- **Where the SPA lives:** an agent-authored source dir at the repo root (e.g.
  `understanding-app/`), mirroring how `understanding-diagram.mmd` is the rolling
  artifact today. Open: source-to-serve pipeline (build step vs prebuilt `dist/`).
- **How the harness serves it:** `UnderstandingApp.Serve` grows a mode — if an SPA
  build/`dist` is present, serve it (SPA fallback to `index.html` for client
  routing); else fall back to the Mermaid renderer (and the empty-state message).
  Relative-URL contract under `…/app/understanding/` is unchanged.
- **Freshness:** keep the rolling-latest ethos — a rebuild/overwrite shows up live
  (the harness self-dev already builds Vite for `client/`, so a build step is
  precedented).
- **Security:** today the renderer uses Mermaid `securityLevel: 'strict'`. An
  agent-authored SPA = arbitrary JS served under the authed proxy — decide
  sandboxing / that this is acceptable for an operator-only, password-gated,
  LAN/over-the-proxy surface.

## Open questions

- Framework & build from `birokrat-architecture` (React + Vite? something else?) —
  pending access.
- One SPA per repo (rolling latest) vs named/multiple understanding SPAs.
- Build-on-the-harness vs agent commits a prebuilt `dist/`.
- Does the SPA **replace** or **coexist with** the Mermaid diagram in the same
  Understanding surface (lean: coexist — Mermaid default, SPA when present).

## Out of scope

- Exposing the Understanding SPA to the internet (stays a local/understanding-only
  surface, like today).
- Auto-generating the SPA *for* the agent — the agent authors it; the harness
  builds/serves it.
