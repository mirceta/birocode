# Global apps — "Global exposure, done right" homepage topic

> **Status (2026-06-21):** **BUILT** — the "🌐 Global exposure, done right" topic ships:
> canonical `docs/global-exposure-convention.md` (5-rule public contract), `homepage/assets/
> global-data.js` (public-path NODES/MESSAGES/RULES) + `global-topic.js` (mirrors
> `exposure-topic.js`, **reuses** the four viz variants via a global `ctx`), wired into
> `index.html`. **Verified headlessly:** scripts parse (`node --check`), the topic registers,
> the data is internally consistent (valid node refs, every `message.rule` matches a real
> rule, every rule used), and all assets serve `200`. **Not yet browser-rendered** — the
> sandbox has no Playwright; the live tab-render/animation needs an eyeball on `:5305` (or the
> Local tab). Interpretation locked: global = **public Homepage exposure of the `:5200` App
> product via `/preview/`**. On `feature/global-apps-exposure`.

## Goal

The homepage explainer SPA (`homepage/`, served build-less on `:5305`) has a topic
**"Local exposure, done right"** (`exposure-topic.js`) that teaches how to get a product
onto the **Local tab** (behind login, via the harness proxy). It has **no companion for
the public surface.** Add a parallel topic — **"Global exposure, done right"** — that
teaches how to expose a product **globally**: on the **public Homepage `/`** (no login,
the one surface a stranger can see — see `docs/networking/surfaces.md`), i.e. as the
**App product on the Preview Port `:5200`**, fronted by off-box **IIS/ARR** at `/preview/`
through the public HTTPS door.

## Why it's a real gap

Local and global are **different contracts**, and only local is taught. Local is a
3-rule loopback proxy. Global crosses a **public reverse proxy (IIS+ARR)** and adds traps
that don't exist locally — absolute-URL escaping, body-less-POST `411`s, and ARR's GET
**output cache** serving stale state. An agent that's internalized the Local contract will
still break a public deploy. This topic closes that gap with the same animated treatment.

## The global contract (to be canonicalized)

Distilled from `docs/claude-web/preview.md` + `proxy.md` + `networking/surfaces.md`:

1. **Bind `0.0.0.0:5200`** (all interfaces, not localhost) — launch **detached**, free the
   port first. The phone/LAN and the proxy must both reach it.
2. **Serve at root.** `GET /` returns the page.
3. **Base / relative URLs for the `/preview/` sub-path.** Built-time asset base **and**
   runtime fetch base must carry the prefix (Vite `base:'/preview/'` + derive the API base);
   plain HTML uses `./…`. An absolute `/asset` escapes the prefix → blank / 404 / 401.
4. **Body-ful POSTs.** Always send a body (even `{}`) — IIS+ARR rejects `Content-Length`-less
   POSTs with `HTTP 411`.
5. **Defeat ARR's GET output cache.** It ignores backend `no-store`; cache-bust GETs
   (`?_=Date.now()`) and/or set `no-store` so state mutations don't "revert".

## Implementation (mirror `exposure-topic.js`)

- **`docs/global-exposure-convention.md`** — NEW canonical, agent-agnostic statement of the
  contract above (mirrors `docs/local-exposure-convention.md`): the single source of truth a
  paste-prompt points other on-box agents at. Change the convention **there**, not in the JS.
- **`homepage/assets/global-data.js`** — `window.GlobalExposureViz` holding global
  `NODES` / `MESSAGES` / `RULES`: actors are **phone → public HTTPS door (IIS/ARR) →
  harness `:5099` → product `:5200`**; messages surface each rule-hop plus the POST-411 and
  ARR-cache traps.
- **`homepage/assets/global-topic.js`** — registers the topic
  `{ id:'global', label:'🌐 Global exposure, done right', tabDesc:'reach the public homepage', mount }`.
  Same shape as `exposure-topic.js`: a lead, a **paste-into-the-other-agent pointer prompt**
  (→ `global-exposure-convention.md`), a why-note, and the **reused** `ExposureViz.variants`
  fed a **global-data `ctx`**.
- **`homepage/index.html`** — add `<script>` tags: `global-data.js` then `global-topic.js`,
  before `home.js` (load order: data → topic → shell).

## Reuse — confirmed

The four viz variants (`viz-pipeline/sequence/layers/stepper.js`) read their data from the
`ctx` object passed to `mount(container, ctx)` (`ctx.nodes/messages/rules`), **not** the
shared global. So the global topic reuses all four renderers unchanged by passing a
global-data `ctx`. **No new visualization engine.**

## Decisions to confirm at playback

1. **Interpretation:** "Global apps" = **public Homepage exposure of the `:5200` App product
   via `/preview/`** (the public, no-login surface). Confirm this is the intended meaning.
2. **New convention doc:** author `docs/global-exposure-convention.md` as the canonical
   contract (yes — mirrors local).
3. **Reuse the four visualizations** with global data (yes — confirmed data-agnostic).

## Open questions / risks

- `exposure-topic.js` hardcodes an absolute doc path with username **`Administrator`**
  (this box is `admin`) — a portability quirk. Resolve the correct on-disk path (or a
  repo-relative reference) for the global doc pointer rather than copying the bug.
- The global story has **more than 3 rules** — the `stepper` legend (`ctx.rules`) and the
  pipeline/sequence pacing may need light tuning to stay readable with 5 rules + 2 traps.

## Convention chores (per `CLAUDE.md`)

- Build **`understanding-app/index.html`** for this explanation (the live companion).
- Keep this plan's status header current; add the `plan.md` Active-feature entry.
- New homepage UI is build-less + self-contained + **relative URLs only** (the homepage
  practices the very contract it teaches).
