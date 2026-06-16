# Understanding app → host a full SPA, not just a Mermaid diagram

> Editing this plan? First read [doc principles](doc-principles.md).

> **Status (2026-06-16): DESIGN — blocked on a reference-stack decision.** On
> `feature/understanding-spa`. Extends the Understanding app from
> [multiple-local-apps](multiple-local-apps.md) Slice 2.

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

## Reference stack — COPY FROM birokrat-architecture (BLOCKED)

The chosen direction is to **copy the stack / architecture** of the web app at
`C:\Users\Administrator\Desktop\playground\birokrat-architecture` so the
Understanding SPA uses a known-good, familiar setup.

> ⚠️ **Blocker:** that path is on the **Administrator** profile and is **not
> reachable from this dev box** (this is the `km` profile; per
> [self-dev](../docs/claude-web/self-dev.md)/[deployments-tab](deployments-tab.md),
> the Administrator box is the off-box production server). The accessible
> `birokrat-*` siblings here (`birokrat-ai-platform`, `birokrat-command-center`,
> `birokrat-common`) are mostly .NET solutions, not the SPA referenced.
>
> **Need from the user (one of):** copy `birokrat-architecture` onto this box (e.g.
> under `…\playground\`), grant access, or confirm which accessible app carries the
> intended stack. Until then the "copy the stack" step can't be executed; the rest
> of the design can still firm up.

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
