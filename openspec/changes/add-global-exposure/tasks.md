# Tasks

## 1. Canonical contract

- [x] 1.1 Author `docs/global-exposure-convention.md` — the agent-agnostic five-rule
      public-exposure contract (mirrors `docs/local-exposure-convention.md`), as the single
      source of truth a paste-prompt points at.
- [x] 1.2 Add a "Worked example" pointer in the doc naming `global-example/` (and the
      `game-arcade` repo as the larger real specimen).

## 2. Homepage explainer topic

- [x] 2.1 Add `homepage/assets/global-data.js` — public-path `NODES`/`MESSAGES`/`RULES`
      (browser → IIS/ARR `/preview/` → product `:5200`), surfacing each rule-hop plus the
      `411` and ARR-cache traps.
- [x] 2.2 Add `homepage/assets/global-topic.js` — registers
      `{ id:'global', label:'🌐 Global exposure, done right' }`, mirroring `exposure-topic.js`:
      lead, paste-into-another-agent pointer prompt (→ the convention doc), why-note, and the
      four reused viz variants fed a global `ctx`.
- [x] 2.3 Wire `global-data.js` + `global-topic.js` into `homepage/index.html` (data → topic →
      shell load order).
- [x] 2.4 Link the topic's why-note to the runnable example (`global-example/` on `:5200`).
- [ ] 2.5 Eyeball the live tab render/animation on `:5305` (or the Local tab) — no sandbox browser.

## 3. Worked-example product — `global-example/`

- [x] 3.1 `serve.mjs` — dependency-free; binds `0.0.0.0:5200` (r1); `GET /` → `index.html`,
      real 404 (r2); strips a leading `/preview/` both ways; counter API `POST /api/bump` (r4)
      + `GET /api/state` with `no-store` (r5).
- [x] 3.2 `index.html` + `assets/styles.css` — served at root, all `./` relative URLs (r3);
      live counter panel + per-rule breakdown.
- [x] 3.3 `assets/app.js` — body-ful POST (r4) + cache-busted GET (r5), `./api/…` relative
      (r3); renders the five-rule list (4 & 5 badged global-only).
- [x] 3.4 `assets/prompt.js` — paste-into-another-agent pointer prompt (repo-relative doc
      path; copy-button UX with clipboard + `execCommand` fallback).
- [x] 3.5 `launch-detached.vbs` (portable, self-resolving dir), `README.md`, `.gitignore`.
- [x] 3.6 Server-verify every rule probe (root, `/preview/` strip, relative assets, POST→GET
      round-trip, `no-store`, real 404, `0.0.0.0` bind) — all pass.
- [ ] 3.7 Browser-verify the live page (counter increments, prompt copy, no console errors)
      and the real public `https://<domain>/preview/` hop (true ARR `411`/cache) — needs a
      host eyeball.

## 4. Understanding app

- [x] 4.1 Overwrite `understanding-app/index.html` with the local-vs-global companion visual
      (two animated paths, 3-vs-5 rule split, the gap, the example).

## 5. Migrate planning to OpenSpec

- [x] 5.1 Port `plans/global-apps-exposure.md` + `plans/global-exposure-example.md` into this
      change (proposal / design / tasks + delta spec).
- [x] 5.2 Drop both rows from the frozen `plan.md` dashboard; delete both `plans/*.md`; update
      the `understanding-app/` footer reference to this change.

## 6. Ship

- [ ] 6.1 Merge `feature/global-apps-exposure` into `main`.
- [ ] 6.2 `openspec archive add-global-exposure` — fold the delta into the `global-exposure`
      baseline.
