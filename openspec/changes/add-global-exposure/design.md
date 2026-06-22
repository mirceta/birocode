# Design

## Approach — mirror the Local-exposure machinery, swap the data

The Local-exposure feature already established the shape: a canonical convention doc, a
homepage explainer topic, and `homepage/` as the live worked example. This change builds the
**public twin** of each, reusing as much as possible.

- **One contract doc, single-sourced.** `docs/global-exposure-convention.md` mirrors
  `docs/local-exposure-convention.md` and is the only place the five rules live. Both the
  homepage topic's prompt and the worked example's prompt are **pointers** to it (read off
  disk on this box), never copies — so the convention can't drift.
- **Reuse the four viz variants.** `viz-pipeline/sequence/layers/stepper.js` read their data
  from the `ctx` passed to `mount(container, ctx)`, not from a shared global. So
  `global-topic.js` reuses all four renderers unchanged by passing a `ctx` built from
  `global-data.js` (public-path `NODES`/`MESSAGES`/`RULES`). No new visualization engine.
- **The story carries five rules, not three.** `global-data.js` surfaces each rule-hop plus
  the two public-proxy-only traps (body-less-POST `411`, ARR GET-cache staleness); the stepper
  legend marks the two global-only rules.

## The worked example — why it needs a backend

A faithful *minimal* global example cannot be static: rules 4 (body-ful POST → no `411`) and
5 (cache-bust GET → beat ARR's cache) are exactly what makes global different from local, and
they can only be **demonstrated** by an app that mutates then reads. So `global-example/`
ships a tiny stateful API — a shared counter: `POST /api/bump` then `GET /api/state` — and the
page live-fires both, annotating which rule each call proves. Rules 1–3 are proven by the
server answering at `0.0.0.0:5200` root with relative URLs at all.

- **`serve.mjs`** is dependency-free (`node:http`/`fs`), modeled on `homepage/serve.mjs` plus
  the public-proxy survival tricks the `game-arcade` product uses: it **strips a leading
  `/preview/`** off the URL so one code path serves both the ARR-stripped request and
  direct-LAN access where the prefix arrives intact; it sets `Cache-Control: no-store` on
  `/api` and `index.html`; and a missing file is a **real 404**, never an HTML fallback
  (broken stays visibly broken — a JSON caller getting HTML back masks the real cause).

## Trade-offs

- **Vanilla, not a framework.** Same rationale as the Local example: the value is being the
  smallest copyable example. A build step would bury the meaningful files and — ironically —
  fight the very relative-URL trap (rule 3) the page teaches (a built SPA defaults to absolute
  `/assets/…` and 404s under the proxy until its base is set).
- **One change for topic + example.** They are one branch's deliverable and ship together;
  modeling them as a single OpenSpec change (not two) matches one-change-per-coherent-unit.
- **Portability fixes carried, not copied.** The example's paste-prompt uses a **repo-relative**
  doc path (the Local topic hardcodes an absolute path with a stale username), and
  `launch-detached.vbs` resolves its **own** directory via `FileSystemObject` (the homepage
  twin hardcodes `C:\Users\km\…`).

## Verification posture

Server-side is fully verifiable headlessly and passes (root, `/preview/` strip both ways,
relative assets, `POST`→`GET` round-trip, `no-store`, real 404, `0.0.0.0` bind). What remains
needs a host eyeball with a real browser: the live page render and the **real** public
`https://<domain>/preview/` hop, where ARR's actual `411` and GET output-cache behavior live
(only approximated by `:5200`-direct + the in-page demo).
