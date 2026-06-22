# Add the Global-exposure capability — convention, homepage explainer, worked example

## Why

Claude Web teaches two ways to expose a product, but only one was complete. **Local
exposure** has both an explainer AND a live worked example you can copy: `homepage/` is a
real product that binds `:5305` dual-stack, is served on the Local tab, and *practices* the
3-rule loopback contract it teaches.

**Global exposure** — getting a product onto the **public Homepage** (no login), fronted by
the off-box **IIS/ARR** door at `/preview/` → `:5200` — is a *different, trickier* contract:
it crosses a real public proxy and adds two traps loopback never had (body-less-POST `411`,
and ARR's GET output-cache serving stale state). An agent that internalized the Local
contract still breaks a public deploy. Yet global had no canonical contract, no homepage
explainer, and — the remaining gap — **no live worked example**: the explainer that did get
built lived *inside* `homepage/`, itself a *local* product, so the public contract was taught
by an exemplar that doesn't practice it.

This change closes the whole gap: a canonical contract, a homepage explainer topic, and a
minimal runnable product that practices all five rules.

## What Changes

- **Canonical contract** — `docs/global-exposure-convention.md`, the agent-agnostic single
  source of truth for the **five-rule** public-exposure contract (mirrors
  `docs/local-exposure-convention.md`), pointed at by paste-prompts.
- **Homepage explainer topic** — a "🌐 Global exposure, done right" topic on the homepage
  explainer SPA (`homepage/`), mirroring the Local topic: a lead, a **paste-into-another-agent
  pointer prompt**, a why-note, and the four shared, data-agnostic viz variants fed a global
  `ctx` (`global-data.js` + `global-topic.js`).
- **Worked-example product** — `global-example/`, the public twin of `homepage/`: a
  build-less, dependency-free product that binds `0.0.0.0:5200`, is reached through
  `/preview/`, and **practices all five rules** — exercising the two global-only rules
  (body-ful POST, cache-busted GET) live via a tiny counter API — and hosts its own
  paste-prompt.
- **Understanding app** — `understanding-app/index.html` overwritten with a local-vs-global
  companion visual.

## Impact

- **Affected specs:** `global-exposure` (new capability, seeded by this change's delta).
- **Affected artifacts (new):** `docs/global-exposure-convention.md`;
  `homepage/assets/global-data.js` + `global-topic.js`; `global-example/` (`serve.mjs`,
  `index.html`, `assets/{app,prompt}.js` + `styles.css`, `launch-detached.vbs`, `README.md`,
  `.gitignore`).
- **Affected artifacts (edited):** `homepage/index.html` (script tags),
  `homepage/assets/global-topic.js` (link to the runnable example),
  `understanding-app/index.html`.
- **Supersedes** the old `plans/global-apps-exposure.md` + `plans/global-exposure-example.md`
  (migrated into this change; both deleted and their `plan.md` dashboard rows dropped per
  `docs/openspec-migration.md`).
- **Out of scope:** no harness (`ClaudeWeb.App/`) changes; not wired into `swap.ps1`/live
  deploy (a demonstrator you run on `:5200`); browser-render of the live page + the real
  public `https://<domain>/preview/` hop remain to eyeball (no sandbox browser).
