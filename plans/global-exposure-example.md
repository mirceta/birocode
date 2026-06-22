# Global-exposure example — a real product that teaches public-Homepage exposure

> **Status (2026-06-21): Built + server-verified.** A standalone product under
> `global-example/` — **not** a harness change, so there is nothing to "deploy". It runs on
> the Preview Port `:5200` the normal way and is reached through the public IIS/ARR `/preview/`
> door. **Verified headlessly:** all JS parses (`node --check`), and the running server passes
> every rule probe — `GET /` 200 html, `/preview/` strip both ways, relative assets 200,
> body-ful `POST /api/bump` → cache-busted `GET /api/state` round-trip, `no-store` on `/api`,
> real 404 for missing asset + unknown `/api`, bound `0.0.0.0`. **Not yet browser-rendered**
> (no Playwright in the sandbox) — the live page (counter increments, prompt copy, no console
> errors) and the *real* public `https://<domain>/preview/` hop (true ARR `411`/cache behavior)
> need an eyeball on the host. On `feature/global-apps-exposure`.

## The problem

`plans/global-apps-exposure.md` shipped the **explainer** for global exposure — the canonical
`docs/global-exposure-convention.md` plus the homepage "🌐 Global exposure, done right" topic +
paste-prompt. But that topic is taught from **inside `homepage/`**, which is itself a *local*
product (`:5305`, behind login, Local tab). So the public contract is taught by an exemplar
that doesn't practice it.

Local doesn't have this gap: `homepage/` (the `plans/local-exposure-example.md` product) is a
**live, correct specimen** — it binds `:5305` dual-stack, serves on the Local tab, and an agent
reproduces it by doing what the page does. **Global had no equivalent live specimen.** The one
real product that crosses `/preview/`→`:5200` for real (the `game-arcade` repo) lives in a
*different* repo and is a whole arcade, not a minimal reference.

## What shipped — `global-example/` (the public twin of `homepage/`)

A real product that **is** the five-rule contract; an agent reproduces a globally-exposed app
by doing what it does. Build-less, dependency-free, vanilla — the ~7 files that matter are
readable end to end.

- **`serve.mjs`** — dependency-free (`node:http`/`fs`) server modeled on `homepage/serve.mjs`
  plus the public-proxy survival tricks from `game-arcade/minesweeper/server.js`. It *is* the
  rule-1/2/4/5 demonstration: binds `0.0.0.0:5200` (r1); `GET /` → `index.html`, real 404 for
  anything missing (r2); **strips a leading `/preview/`** so one code path serves both the
  ARR-stripped request and direct-LAN where the prefix is intact; a tiny stateful API —
  `POST /api/bump` (reads a body, mutates an in-memory counter, r4) + `GET /api/state` (r5) —
  with `Cache-Control: no-store` on every `/api` response (r5 server half).
- **`index.html` + `assets/styles.css`** — served at root, **all `./` relative URLs** (r3): the
  page *is* the relative-URL demonstration. A live panel (counter + Bump/Refresh) and a
  per-rule "how this app satisfies it" list.
- **`assets/app.js`** — the client half: `bump()` POSTs `JSON.stringify({})` with a
  Content-Type (r4); `getState()` cache-busts every GET with `?_=Date.now()` (r5 client half);
  both fetch `./api/…` relative (r3). Renders the five-rule list (4 & 5 badged *global-only*).
- **`assets/prompt.js`** — the paste-into-the-other-agent prompt (lifted text + copy-button UX
  from `homepage/assets/global-topic.js`), a **pointer** to `docs/global-exposure-convention.md`
  (repo-relative — avoids the stale absolute `Administrator` path the local topic hardcodes).
- **`launch-detached.vbs`** — detached launch (r1: outlive the turn), resolving its **own**
  directory via `FileSystemObject` so it's portable (the homepage twin hardcodes `C:\Users\km\…`
  — not copied).
- **`README.md`**, **`.gitignore`**.

## Why vanilla, not a framework

Same reason as `local-exposure-example.md`: the value is being the smallest copyable example. A
build step would bury the meaningful files and — ironically — fight the very relative-URL trap
(rule 3) the page teaches.

## Cross-links (convention stays single-sourced in `docs/`)

- `docs/global-exposure-convention.md` — add a short **"Worked example"** pointer naming
  `global-example/` (and `game-arcade` as the larger real specimen). Contract text unchanged.
- `homepage/assets/global-topic.js` — one line in the why-note pointing to the runnable example.
  The homepage stays the animated explainer hub.
- `plan.md` Active-feature list — add this entry; `plans/global-apps-exposure.md` cross-links here.
- `understanding-app/index.html` — overwritten with the local-vs-global companion visual
  (per the CLAUDE.md Understanding-app convention).

## Verification

Server probes all pass (see status header). Outstanding: browser-render the live page and prove
the **real** public hop (`https://<domain>/preview/`), where ARR's actual `411` and GET
output-cache behavior — only approximated by `:5200` direct + the in-page demo — can be observed.

## Out of scope

- No harness (`ClaudeWeb.App/`) changes — standalone product, like the local example.
- No new visualization engine — the animated viz lives in the homepage hub; this app's value is
  *being a real, runnable, minimal globally-exposed product*.
- Not wired into `swap.ps1`/live deploy — it's a demonstrator you run on `:5200`, not the harness.
