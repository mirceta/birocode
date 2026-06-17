# Loop autopilot — where the dashboard lives

> Subdoc of **[loop-autopilot.md](loop-autopilot.md)**. The **dashboard** is the
> surface you open to watch the looping agent — discovered routine prompts now,
> and later the live loop (current step, recent auto-advances, kill switch).
> This doc records *where* that surface lives and why.

## Decision — LOCKED (2026-06-16): extend the existing Autopilot tab (option A)

Build the running-loop dashboard **into the existing harness Autopilot tab**
(`client/src/pages/Autopilot.jsx`, already shipped for discovery). Deliberately
**not** the optimal-UX choice — it's the lowest-friction one. Rationale: the
priority is *getting agents running automatically*, not the dashboard's polish;
the tab already exists and has direct in-process access to autopilot state. If
the experience proves bad, move it later (the harness-provided-local-app
mechanism — a refinement of option B — stays the most likely next home).

The four options weighed before this call are kept below for that future move.

## Approaches compared

The four options weighed before the platform settled it. Kept to show the
trade-offs and what the chosen mechanism buys.

> **Legend.** ★ out of 5, **higher is always better** — even for "risk", where 5★
> means *least* risky. Ratings are relative to each other, not absolute.

| Approach | Ease of dev | Low dev risk | Fits "click-into a Local-tab app" | Architecture / convention fit | Live agent-data access | Maintainability |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **A · Extend the existing harness Autopilot tab** (React, `:5099`) | ★★★★☆ | ★★★★☆ | ★★☆☆☆ | ★★★★★ | ★★★★★ | ★★★★☆ |
| **B · New standalone Local-tab app** (own folder + port, via `/api/localview`) | ★★★☆☆ | ★★★☆☆ | ★★★★★ | ★★★★☆ | ★★★☆☆ | ★★★☆☆ |
| **C · A tab inside `exposure-example`** (`:5305`) | ★★★☆☆ | ★★☆☆☆ | ★★★★☆ | ★☆☆☆☆ | ★★★☆☆ | ★★☆☆☆ |
| **D · A live panel on the existing Dashboard** (beside `PinnedAgent`) | ★★★★☆ | ★★★★☆ | ★★☆☆☆ | ★★★★☆ | ★★★★★ | ★★★★☆ |

- **A — Extend the harness Autopilot tab.** The tab + `GET /api/autopilot/discover`
  already exist (Slice 1), so it's mostly UI growth. Same origin as the harness →
  direct, authenticated access to live `RunSession` state. The autopilot *is* a
  harness feature, so this is its natural home. Weak axis: it's a harness tab, not
  the "open a Local-tab app" experience. Adds a build-isolation cost (self-dev).
- **B — Standalone Local-tab app.** Nails the click-into-it vision and reuses the
  `exposure-example` shell style, but costs a new app + port, reaches live data only
  through API endpoints, and is a second framework-less codebase to keep in sync.
  *Superseded by the harness-provided-app mechanism above, which removes these costs.*
- **C — Tab inside `exposure-example`.** Already a clickable Local-tab app, so it
  looks cheap — but it **violates that product's zero-coupling design**, repeating
  the abandoned "Exposure Helper baked into the harness" mistake. Not recommended.
- **D — Panel on the existing Dashboard.** `PinnedAgent` already renders live agent
  state, so a loop-status panel slots in cheaply with full data access — but like A
  it's a harness surface, not a click-into app, and it crowds a busy page. Can
  **coexist** with the chosen app as a quick-glance entry point.

## Live local app — tabs (2026-06-17)

The shipped dashboard is the build-less local app at `autopilot-app/` (served by
the harness under `/api/localview/<repo>/app/autopilot/`), styled to the design
mock in `understanding-app/`. Its subtabs:

- **Agents** — per-repo state + arm/disarm, auto-advance switch, threshold, kill.
- **Intercepted** — live feed of every agent message the engine grabs and
  processes (`intercepts` in `/api/autopilot`). Each row shows the grabbed
  snippet and a status that moves `processing` (a rolling spinner) → outcome
  (`suggested`/`escalated`/`sent`). The spinner is real for an auto-advance send
  (held until the resumed run completes); suggest-only rows resolve instantly and
  get a brief reveal spinner on arrival. Backed by `InterceptEvent` in
  `AutopilotService` (ring buffer, dedup by repo+snippet).
- **Suggestion history** — the engine verdict log. **Auto-sent** — the
  append-only audit trail of real sends.
