# Understanding — a dedicated Local app for the OpenSpec port

## Goal
Build a **new, dedicated Local app** (separate from the rolling, harness-served *Understanding*
app) whose job is to **explain, analyze, and control** the OpenSpec port — the large feature
tracked in `plans/openspec-flow.md`. Because the port is big and multi-phase, it earns its own
persistent control surface rather than living in the overwrite-each-time Understanding app.

## What I'll build
- A folder `openspec-port-app/` at the repo root holding a **self-contained, build-less SPA**
  (`index.html` + `app.js` + `styles.css`, relative URLs) with three pillars:
  - **Explain** — scope (OpenSpec = the *planning layer*; the harness stays), the lifecycle, and
    the five-phase spine.
  - **Analyze** — the "our system vs OpenSpec" comparison and the single-gap finding.
  - **Control** — an interactive, **localStorage-backed** tracker: per-phase task checklists with
    derived status, the four open decisions and their resolution, an overall progress bar.
- A tiny **dual-stack static server** `openspec-port-app/serve.mjs` (the `homepage/serve.mjs`
  pattern: listen on `::` dual-stack, serve at root, relative URLs), run **detached** on a free
  port so it survives the turn.

## How it fits the harness
- This is a **`kind: repo`** Local app (a product I run), not the harness-provided `kind: harness`
  Understanding app. Per the multiple-local-apps platform it's served at
  `/api/localview/<repo>/app/<appId>/` once the **operator registers its port** in the Local
  setup form. I'll run the server and report the port + the registration step.

## Assumptions
- Content is sourced from `plans/openspec-flow.md` (the DECIDED Path A port plan + the
  2026-06-19 scope refinement).
- "Control" = track/drive the porting work (phases, tasks, decisions) — client-side state via
  localStorage, since a static app has no backend.
- I leave the existing `understanding-app/` (the rolling comparison) untouched.
