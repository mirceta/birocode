# Claude Web — working plan

> Editing any plan? First read
> [doc principles](plans/doc-principles.md) — cohesion by unit,
> progressive disclosure, reference-don't-duplicate.
>
> New doc-viewer capabilities, shown live:
> [doc-viewer examples](plans/doc-viewer-examples.md) — open it in the
> Files tab to see wrapping mermaid labels etc. in action.

> **Status (2026-06-20):** **Enlarge a dock to two horizontal spaces** is
> **merged to main** (built, not yet browser-verified). In flight:
> **Chat system tests** on `feature/systest-interactive` (steppable hub +
> per-suite interactive diagrams).

## ⚠️ Known risks to mitigate

- **Autopilot is a confused-deputy / prompt-injection risk — mitigate before we
  ever trust it to *act* unattended.** Both the agent that *authors* the
  autopilot's surfaces and the autopilot *brain* itself are Claude, and Claude
  ingests untrusted input (files, web, PRs, dependency text) as normal work — so
  a steered session is a realistic vector, not a hypothetical stranger. The
  feature's whole job is to *send prompts to agents*, i.e. to act, which is
  exactly the authority an injection would want to borrow.
  - **Eventual mitigation (NOT done):** a **scoped capability token held by the
    engine, never by the brain** — the brain only *proposes*, the deterministic
    engine *executes* under a narrow, expiring token after the gate
    (threshold + risky-action deny-list). Never expose a send/act primitive that
    skips that gate. Token authority must be strictly *less* than the operator's
    own session (don't reuse `claudeweb_session`). The token bounds the *category*
    of action; the gate bounds *each* action. See
    [loop-autopilot safety](plans/loop-autopilot-safety.md).
  - **Interim guard (done):** the autopilot API is **gated operator-side only**,
    mirroring guest approval — the host (WinForms) turns the `/api/autopilot`
    endpoints off/on; **the web can never turn them on** (it can only see + shrink).
    Default **off**. So even a steered web/brain can't enable acting; the operator
    must physically opt in at the host. Suggest-only for now; no unattended
    auto-advance until the token mitigation above lands.

## Active feature plans

- [System tests for the Chat feature](plans/chat-system-tests.md) — discover
  **every** exercisable Chat behaviour, then run them **all** as black-box system
  tests against the real HTTP/SSE surface (and the real Claude CLI where it
  matters) to surface bugs. Token spend on real runs is explicitly authorised —
  goal is coverage, not frugality. Covers auth/validation/409/stop/reattach/
  sessions plus end-to-end turns (basic, resume, tools, model, ask read-only).
  Discovery only; fixes spin out per one-feature-per-branch. On
  `feature/systest-interactive` (steppable hub + per-suite interactive diagrams).
- [Hide inactive agents — "Show only important" dashboard toggle](plans/hide-inactive-agents.md)
  — a single dashboard-level **toggle** ("Show only important agents") that, when
  on, **hides every dock that isn't starred ★ important**, leaving just the
  important ones; toggle off to show all again. Pure **view filter** on the
  existing backend-synced `important` flag ([important-agents.md](plans/important-agents.md))
  — device-local pref, no new dock state. **Built** (frontend compiles); not yet
  browser-verified/deployed. On `feature/hide-inactive-agents`.

## Proposed / design (not building yet)

- [Ideas go global, pinned left of the dashboard](plans/ideas-pinned-dashboard.md)
  — make Ideas a single **global** master list (no longer per-project; reverses
  ideas-tab.md), keep the Ideas tab showing all of them, and pin that list left
  of the agent-dashboard overlay. Design set (backend de-keying + migration +
  shared component); **not built** — shelved here off the active list pending a
  decision to build. On `feature/ideas-pinned-dashboard`.
- [Spec baseline](plans/spec-baseline.md) — borrow OpenSpec's one missing
  idea (a living "what the system does today" baseline + change-as-delta)
  into our existing plan convention, without adopting its tooling. Slice 1 =
  `docs/capabilities.md` + a delta stanza in each plan + a ritual step.

## Recently shipped

- [Enlarge a dock to two horizontal spaces](plans/dock-double-width.md) — a
  per-dock **toggle** (the ⤢ control, beside the ★ important / 🔗 depends-on
  controls) makes an agent dock span **two horizontal grid spaces** (double
  width); press again to shrink, multiple may be wide at once. Mirrors the
  `important` flag end-to-end (backend-synced `Wide` bool on `DockTab`; CSS
  `grid-column: span 2` with an aspect-ratio override so only width doubles; the
  span also rides the `dash__group` wrapper so a wide primary widens its
  "together" group). i18n en+tr. **Merged to main 2026-06-20** (`8cd9630`);
  built, not yet browser-verified. On `feature/dock-double-width`.
- [Local app fills the dock — hide git while it's open](plans/dock-local-app-full-height.md)
  — in each agent dock, opening a **local app** now renders it **over** the git
  section (hide `phone__git`) so the `ProductFrame` gets the **full dock height**,
  mirroring the Files tab's existing git-hide. Frontend-only one-liner in
  `PinnedAgent.jsx` (the git gate is now `git && !showFiles && !openApp`).
  **User-confirmed working; merged to main 2026-06-19.** On `feature/dock-local-app-full-height`.
- [Render Files-tab functionality in the agent dock](plans/agent-dock-files-tab.md)
  — the **Files tab**'s browse-and-view surface now lives **inside each agent dock**
  (the per-agent "phone"): a **📁 Files** tab beside the Builder/Ask lanes swaps
  `phone__screen` to the shared `FilesBrowser` scoped to **that agent's repo**
  (tree · viewer · markdown/HTML/image · pins · 5s live poll · doc-links). Extracted
  `FilesBrowser` from `Files.jsx` so the routed tab and the dock can't drift (the
  "one shared component, two surfaces" `AutopilotConsole` pattern). **Corrected
  mid-build** from a first attempt that put a standalone Files dock beside
  Ideas/Autopilot — that `FilesPanel`/`files-panel.css`/`dash__files` dock was
  removed. Follow-ups in the same branch: the in-dock surface **scrolls within the
  phone**, and the **git block is hidden while Files is open** so the browser fills
  the dock. Frontend-only (reuses `FileController` via `X-Repo-Id`). **User-confirmed
  working; merged to main 2026-06-19.** On `feature/agent-dock-files-tab`.
- [Feature kickoff & closeout](plans/feature-kickoff.md) — a seamless feature
  lifecycle for both ends of a feature's life. **Kickoff half shipped:** an
  advanced-gated composer button prefills the "start the next feature" ritual
  (branch, plan, understanding) into the chat box — no auto-send, hidden in Basic;
  deployed & confirmed on live :5099, browser-verified (`verify-feature-kickoff.mjs`
  6/6). **Closeout half dropped** (the finishing ritual was never built).
  Merged to main. On `feature/feature-kickoff`.
- [Task-graph machine groups](plans/taskgraph-machine-groups.md) — added a **grouping box**
  (rectangle) to the task graph that **contains** step nodes and represents **one machine** on
  which agents run; a **cross-machine dependency** is a depends-on edge between nodes in different
  boxes, styled to stand out. Built on React Flow's parent/group-node feature (drag a box → its
  nodes follow; drop a node in → it joins). Backend added a `Machine` record on the board + an
  optional `MachineId` on each node (additive, no migration) and `/api/taskgraph/machines`.
  **User-confirmed working; merged to main 2026-06-19.** On `feature/taskgraph-machine-groups`.
- [Merge Ideas + Task graph](plans/ideas-taskgraph-merge.md) — folded the **Task graph** into the
  **Ideas** surface so the graph lives in one home. It became a **third tab** inside `IdeasPanel`
  (Ideas | Plan | 🧩 Task graph), remounting fresh each open; the standalone **dashboard task-graph
  dock was removed** (its drag-layout citizen + dead CSS deleted). Each **active idea** gained a
  **🧩 Send to graph** button — decided as **Convert**: it creates a task-graph node
  (`POST /api/taskgraph/nodes`, `title = idea.text`, project carried into the node note), **keeps the
  idea but clears its Active flag** (`PATCH /api/notes/{id}`), and jumps to the Task-graph tab. Bundled
  in (at the user's request, against one-feature-per-branch): the **Ideas dashboard dock is now
  drag-resizable** via a bottom-right grip (free width+height, remembered per device, double-click to
  reset; the ⇥/⇤ wide-toggle clears a custom size), switched to inner-scroll so the grip stays pinned.
  Frontend-only (reuses existing endpoints); built & deployed to live :5099. On
  `feature/ideas-taskgraph-merge`.
- [Task dependency graph](plans/task-dependency-graph.md) — a first-class dashboard section (sibling
  of **Ideas** / **Autopilot**) for the prerequisite chains that used to live only in the operator's
  head. Built with **React Flow**, a **single global board**, **repo label/colour only** (no live
  agent telemetry): add step nodes (each optionally attached to an agent), drag **"waits-on"** edges,
  cycle status (todo/doing/done), rename/delete, see **do-next** (green ring on unblocked steps) and
  click a step to trace **why** (the chain up to the goal it serves). Backend-synced global store
  like Ideas (`/api/taskgraph`, `taskgraph.json`, cycle/self/dup-edge guarded); a drag-layout dock
  citizen gated on a new Advanced flag and **drag-resizable** like Autopilot. Clicking a step opens a
  **detail/edit view on the bottom half** — title, agent, status and a **per-node notes** box
  backend-synced via `PATCH /api/taskgraph/nodes/{id}`. (The bottom half first held a *global
  scratchpad* foil experiment; repurposed into per-node notes 2026-06-18 — the old
  `/api/taskgraph/scratch` endpoint is now orphaned, pending cleanup.) Core board + node-detail
  enhancement deployed to live :5099 & **merged to main 2026-06-18**
  (`feature/task-dependency-graph`, `feature/taskgraph-node-detail`).
- [Autopilot goes to the harness](plans/autopilot-to-harness.md) — the autopilot dashboard was
  **DUPLICATED** (a routed harness tab `Autopilot.jsx` **and** a build-less local app
  `autopilot-app/`, both over `/api/autopilot`). Shipped in three steps: **(1) de-dup** — Intercepted
  feed + deny-list ported, operator-**gate-off state** folded in (a 403 now explains "turn it on at
  the host"), and **`autopilot-app/` deleted** with all its wiring; **(2)** the dashboard section
  redesigned into a **free-floating, resizable, top-z dock** (a third citizen of the dashboard drag
  layout); **(3) full parity** — the entire UI is now **one shared `AutopilotConsole`** rendered by
  BOTH the routed tab (mobile-first) and the dock (anywhere), so the two surfaces can't drift (the
  "dock = control / tab = detail" split was retired). Cross-agent backend already existed (pure
  surfacing); gate stays off by default. Deployed to live :5099 & confirmed; **merged to main
  2026-06-18**. On `feature/autopilot-to-harness`.
- ["Paste this into the other agent's chat" for the Local-exposure topic](plans/exposure-paste-pointer.md)
  — gave the homepage's **"🛰️ Local exposure, done right"** topic the same
  **🚀 Paste this into the other agent's chat** affordance the **"📦 Use the
  Understanding app in any agent"** topic has, so the operator can bootstrap *another*
  on-box agent into exposing its Product on the Local tab correctly. Task-framed (a
  one-shot reconfigure of a real Product the other agent runs), pointing at a new
  agent-agnostic [docs/local-exposure-convention.md](docs/local-exposure-convention.md)
  modelled on `docs/understanding-app-convention.md`. Because a repo can run **several**
  web apps, the paste card carries a **"Which service should it expose?"** field that
  injects the named service into the prompt live (empty → generic fallback); Copy copies
  the customized prompt. Build-less; browser-verified on an isolated homepage port
  (service injection + clipboard match, no console errors). On
  `feature/exposure-paste-pointer`; **merged to main 2026-06-18**.
- **Homepage tabbed explainers + same-box Understanding-app convention pointer** —
  renamed `exposure-example/` → `homepage/` (kept `serve.mjs`/`:5305`) and added a
  **topic-tab shell** (`home-core.js` + `home.js`) above the existing variant layer.
  **Tab 1** wraps the existing animated request-flow viz as the "Local exposure, done
  right" topic; **Tab 2** is a new "Use the Understanding app in any agent" tutorial
  whose copyable paste is a **2-line pointer** to the new agent-agnostic
  [docs/understanding-app-convention.md](docs/understanding-app-convention.md) — the
  single source of truth any on-box agent reads off disk (no HTTP, no drift), instead
  of a self-contained copy. CLAUDE.md updated to name that doc as the source of truth.
  Build-less static folder; browser-verified on an isolated port; **deployed to live
  :5099 & confirmed working 2026-06-17; merged to main**. On
  `feature/understanding-convention-pointer`.
- [Dock git actions — sync buttons in each agent dock's git row](plans/dock-git-actions.md)
  — the Git tab's inward-sync actions (**merge main**, **pull main**, **pull branch**)
  now live in each agent dock's git-status row on the dashboard, scoped per-dock via
  `X-Repo-Id`, so you can sync an agent's repo without opening its Git tab. Eligibility
  logic extracted to `components/git/gitActions.js` and shared with `Git.jsx` (no drift);
  reuses the Git tab's `act()` flow; gated behind a new `dockGitActions` (Advanced) flag.
  Push deferred (publishing stays a deliberate Git-tab action). Built + **user-confirmed
  working**; merged to main 2026-06-17. On `feature/dock-git-actions`.
- [Dependent agents — "together" groups on the dashboard](plans/dependent-agents.md)
  — tag a dock as **dependent on a specific primary agent**; the dashboard renders
  the pair as a **"together" group** with the dependent **a bit smaller** (~0.82×)
  than the primary, so it reads at a glance that the primary must finish before the
  dependent's work can continue. Backend-synced `DependsOn` (primary tab id) on
  `DockTab` + a header picker + grouping/shrink in `Dashboard.jsx`; dangling/cyclic/
  self links self-heal to independent. Distinct from the free-text
  [waiting-on toggle](plans/agent-waiting.md) (this links the two docks
  structurally). Built + browser-verified on isolated `:5200` (incl. coexistence
  with the dock-colour wash); deployed to live :5099 & confirmed; **merged to main
  2026-06-17**. On `feature/dependent-agents`.
- [Ideas — an "Active" section](plans/ideas-active-section.md) — move an idea into
  an **Active** group pinned at the top of the Ideas surface, so "what are we
  working on now" is answerable at a glance; toggle it back out to the backlog. An
  optional `Active` flag on each idea (same no-migration pattern as `project` /
  `priority`), shown in both the Ideas tab and the dashboard panel via the shared
  `IdeasPanel`. Built + browser-verified on an isolated port; rode into the live
  `:5099` build with the cache-hardening deploy (not separately keep-it-confirmed);
  **merged to main 2026-06-17**. On `feature/ideas-active-section`.
- [Stop stale code: no-store shell + Force-refresh](plans/cache-hardening.md) —
  kills the recurring "I deployed but my browser shows the old version": the SPA
  `index.html`/`version.json` are now served `no-store` (hashed `/assets/*` stay
  immutable) so a reload always lands on the latest build, a **Force refresh**
  button in Settings ▸ Maintenance wipes caches + service workers on demand, and
  the stale-version banner's Reload reuses that thorough clear. Built + verified on
  isolated `:5210`; **deployed to live :5099 & confirmed**; **merged to main
  2026-06-17**. On `feature/ideas-active-section`.
- [Dock colour background](plans/dock-color-background.md) — a coloured agent's dock is now
  **washed in its colour**, not just bordered. Started as a header-bar tint (so the colour
  survives the **important** star repainting the border red), then extended to wash the
  **whole dock incl. the embedded chat** by re-tinting `--color-surface`/`--color-bg` on
  `.phone[data-colored]` (the regions + same-DOM chat all read those tokens). Tuned to a
  lively 16%/24% so hues are distinguishable. CSS-only; deployed to live :5099 & confirmed;
  **merged to main 2026-06-17**. On `feature/dock-color-background`.
- [Basic mode never shows the dashboard](plans/basic-mode-no-dashboard.md) — **bug fix**:
  Basic (Simple) mode is always the plain tabbed view. The `agentDashboard: 'advanced'`
  gate only blocked *opening* the overlay; it renders from `dashOpen` local state, so
  opening it in Advanced then switching to Basic left it showing. Now `Layout.jsx` gates the
  render on `dashEnabled && dashOpen` and resets `dashOpen` when the feature goes away.
  Frontend only; deployed to live :5099 & confirmed; **merged to main 2026-06-17**. On
  `feature/basic-mode-no-dashboard`.
- [Loop autopilot — auto-advance agents through my routine replies](plans/loop-autopilot.md)
  — autopilot mines the user's history for recurring **routine prompts**, then at
  each idle agent turn classifies the situation into one of the user's **editable
  custom prompts** (the brain's label space) or **`escalate`**, looping the agent
  forward and pausing at the hard decisions. Slices (1) discover, (2) suggest-only,
  (3) auto-advance all built; gated operator-side (**off by default**) + kill switch +
  confidence threshold + risky-action deny-list, with an append-only audit log
  (`autopilot-audit.jsonl`). The dashboard is the build-less local app at
  `autopilot-app/`; its **editable Routine-prompts tab** (add/edit/delete the
  recommendable set + one-click adopt of mined drafts) is **browser-verified on live
  :5099**. Remaining: swap the keyword **stub** brain for the real LLM classifier +
  its accuracy gate before trusting unattended auto-advance. On `feature/loop-autopilot`.
- [Agent dashboard](plans/agent-dashboard.md) — a mission-control, full-screen
  **top-bar overlay** (Advanced + 2+ agents) showing every agent on this machine at
  once; click a cell to open that agent in the normal `/studio` view. Slice 1 (static
  grid + open-agent), slice 2 (liveness: per-cell status/activity/git on a 5s timer)
  and slice 4 (the Chat-only "wall of phones") built & browser-verified; slice 3
  (live tail) deferred. On `feature/agent-dashboard`, not yet merged.
- [Dashboard drag layout](plans/dashboard-drag-layout.md) — arrange the **Ideas** and
  **agents** panels on the dashboard, both participating, with a **mode switch** in the
  top-right: **free mode** (desktop default) drags either panel anywhere by its `⠿` handle
  (absolute `{x,y}`, pointer-events, `↺` reset, edge-clamped); **grid mode** (mobile
  default, since touch-drag is unreliable) keeps the responsive flow and a `⇄` tap-flips
  order. Device-local; default follows `max-width: 700px` until the operator picks one.
  Started as a side-swap toggle → snap-zones → this. Frontend only (`Dashboard.jsx` +
  `dashboard.css` + i18n); deployed to live :5099 & confirmed; **merged to main
  2026-06-17**. On `feature/dashboard-drag-layout`.
- [Queued prompts](plans/queued-prompts.md) — **merged with [prompt-stash](plans/prompt-stash.md)**:
  the per-agent stash list *is* the queue. While the agent is busy (a normal send would
  409) you line up the next prompts; **nothing auto-runs** — each chip has **Send**
  (approve → send as the next turn, disabled while busy), **×** (delete), and tap-to-edit.
  Works on **all three surfaces**, each correctly scoped: the main chat (tab-independent
  **global queue** in `dock-stash.json` via `GET/POST/DELETE /api/dock/stash`), the active
  agent tab (per-tab `stash` in `dock.json`), and each **dashboard dock** (its own agent
  via a `stashTabId` threaded `PinnedAgent → Chat → ChatInput`). Durable across
  refresh/redeploy. Backend (`DockRegistry`/`DockController`) + frontend; deployed to live
  :5099 & confirmed; **merged to main 2026-06-17**. On `feature/queued-prompts`.
- [Make the Exposure check app-aware](plans/expose-check-app-aware.md) — **bug fix**:
  the Local tab's "Verify exposure" always checked the repo's default app
  (`repo.LocalPort`, e.g. `:5300`), ignoring the switcher. Now `/api/expose/check`
  takes an `appId` and probes the **selected** app's port (default = first app);
  `ExposeService.RunAsync`/`BuildFixPrompt` use it, and `ExposeCheck.jsx` sends the
  id + points its freshness probe at `/api/localview/{id}/app/{appId}/`. The per-app
  Exposure-check follow-up of [multiple-local-apps](plans/multiple-local-apps.md).
  Backend + frontend; deployed to live :5099 & confirmed; **merged to main
  2026-06-17**. On `feature/expose-check-app-aware`.
- [Understanding app → host a full SPA](plans/understanding-spa.md) — the always-on
  Understanding app now serves an **agent-authored static SPA** from
  `understanding-app/` at the repo root (build-less folder: `index.html` + JS/CSS +
  vendored libs + data; stack copied from `birokrat-architecture/viz/`), instead of a
  single Mermaid diagram. **No Mermaid fallback** — a missing SPA shows an explicit
  empty state and missing assets 404, so a broken/absent SPA can't masquerade as
  working. Removed the old renderer + bundled `mermaid.min.js`. Compiles, deployed to
  live :5099 & confirmed; **merged to main 2026-06-16**. On `feature/understanding-spa`.
- [Multiple local-app buttons on the agent dock](plans/dock-multi-local-app.md) — the
  dashboard dock's single default-app toggle is now **one button per local app** the
  repo defines (incl. the always-on Understanding app), mirroring the Local-tab
  switcher; click one to render it inside the dock at
  `/api/localview/{repoId}/app/{appId}/`, click the active one to return to chat.
  Dropped the now-unused single-port liveness probe. Frontend-only; browser-verified
  on live :5099; **merged to main 2026-06-16**. On `feature/dock-multi-local-app`.
- [Reflect multi-app exposure in the local-exposure example](plans/exposure-example-multiapp-note.md)
  — a **light accuracy touch**: the example's animated request-flow explainer
  taught only the bare `/api/localview/<repo>/` path, predating the
  [multiple-local-apps](plans/multiple-local-apps.md) upgrade. `core.js` +
  `index.html` now show the per-app `…/app/{appId}/` form (bare = default app) and
  note a repo can expose several apps, each following the same contract.
  Wording-only — **not** a multi-app demo (the example stays
  single-responsibility); the live Local-tab switcher already demos multi-app.
  Browser-verified across all four explainer variants; **merged to main
  2026-06-16**. On `feature/exposure-example-multiapp-note`.
- [Multiple local apps per repo](plans/multiple-local-apps.md) — a **platform
  upgrade**: a repository can now expose **more than one local app**, each on its
  own port, with a **switcher in the Local tab**
  (`/api/localview/{repoId}/app/{appId}/`; the bare path stays the default/first
  app for back-compat). First consumer: a harness-provided, **always-on
  Understanding app** that renders a rolling-latest Mermaid diagram the agent
  writes to `understanding-diagram.mmd`. Both slices built, browser-verified,
  **live on :5099 & merged to main 2026-06-16 (`6721113`)**. Follow-ups remain:
  per-app dock/Exposure-check awareness. Was on `feature/multiple-local-apps`.
- [Local-exposure example](plans/local-exposure-example.md) — a **real product**
  under `exposure-example/` that runs on the self-repo's Local port (`:5305`) the
  normal way and reaches the Local tab through the **existing**
  `/api/localview/<repo>/` proxy — **zero harness changes**. It teaches Local-tab
  exposure by *being* a correctly-exposed app (dependency-free dual-stack
  `serve.mjs`; plain HTML/CSS/JS). Centerpiece: an **animated request-flow
  explainer** (Browser → harness proxy → `127.0.0.1:5305` → app → back) with
  **four switchable styles** (Pipeline / Sequence / Layers / Step-through) over one
  shared data source. Replaces an abandoned baked-into-the-harness attempt
  (archived on `origin/feature/serving-model-clarity`). Verified dual-stack +
  root + relative assets, directly and through the proxy; all four variants render
  clean. On `feature/local-exposure-example`.
- [Scoreboard / analytics](plans/scoreboard-analytics.md) — a collapsible
  **analytics panel above the agent docks** that quantifies agent usage from a
  new append-only `activity.jsonl` run ledger (`/api/analytics?window=…`). After
  a **v2 redesign**: a **Today / 7 days / All** timeframe toggle scopes every
  stat; the hero is a **concurrency-over-time** step-area chart (agents running
  at once, with its shape), beside a **last-7-days** prompts-per-day strip and a
  **per-agent leaderboard** (runs · work · longest · last used). Per-run **cost**
  rides the `finish` event. Dropped v1's misleading work-vs-idle. Hand-rolled
  SVG/CSS (no chart lib); backfill + token counts deferred. Verified across all
  three windows on an isolated :5201 preview; deployed to live :5099 & confirmed
  2026-06-16. On `feature/scoreboard-analytics`.
- [Ideas filter: substring, not subsequence](plans/ideas-substring-filter.md) —
  the Ideas filter box (Ideas tab + dashboard panel) did a **subsequence** match,
  so it kept ideas where the query's letters merely appeared in order across
  unrelated words. Replaced it with a plain case-insensitive **substring** match
  (multi-word query = AND of substrings) — an idea is hidden unless the typed
  term actually appears within it; the `project` label is still searched, empty
  query still shows everything. Frontend-only, one function in the shared
  `IdeasPanel`. Browser-verified on an isolated :5210 instance
  (`verify-ideas-substring-filter.mjs` 9/9, incl. the bug repro); deployed to
  live :5099 & confirmed 2026-06-15, merged to main. On
  `feature/ideas-substring-filter`.
- [Agent "waiting on" toggle](plans/agent-waiting.md) — a second dock-header
  toggle (⏳, sibling of the ⭐ important button) marks a **dashboard dock** as
  **waiting for another agent to finish**, with an optional inline free-text field
  for **which** agent it's waiting on. Distinct **amber** waiting cue that
  **coexists** with important's red border (an agent can be both); toggling off
  clears the state and its text. Persisted as backend-synced `Waiting` +
  `WaitingOn` on `DockTab` (same path as `color`/`dashboard`/`important`).
  Advanced-mode. Browser-verified on an isolated :5210 instance
  (`verify-agent-waiting.mjs` 13/13); deployed to live :5099 & confirmed
  2026-06-15, merged to main. On `feature/agent-waiting`.
- [Priority for ideas](plans/idea-priority.md) — each idea gets an optional
  **priority** with **five levels**; a **1–5 picker** on the composer, the edit
  form, and each card sets it, and the idea card's **background reddens as the
  priority rises** (faint at 1 → strong bright red at 5). Applies to **both** the
  Ideas tab and the dashboard Ideas panel (one shared `IdeasPanel`). Backend adds
  an optional `Priority` (0–5, clamped, no migration — like `project`); frontend
  adds `data-priority` tints in `ideas.css`. Visual only (no reordering).
  Browser-verified on an isolated :5201 preview (levels 1→5 redden monotonically,
  persist across reload + via the API, dashboard panel mirrors the tint);
  **deployed to live :5099 & confirmed 2026-06-15, merged to main**. On
  `feature/idea-priority`.
- [Important agents](plans/important-agents.md) — a ⭐ toggle in each **dashboard
  agent dock** (phone docks + cards) marks an agent **important**: the dock gets
  a **bright-red, thicker (6px) border** and is **pinned at the front** of the
  dashboard in stable dock order (the recency rearrangement rule no longer
  shuffles important agents amongst themselves; unimportant ones still reorder by
  recency below them). A toggle — settable back to normal; multiple may be
  important. Persisted as a backend-synced `important` flag on `DockTab` (same
  path as `color`/`dashboard`). Advanced-mode. Browser-verified on an isolated
  :5210 instance (cards + phones + the ordering rule via injected recency);
  deployed to live :5099 & confirmed 2026-06-15, merged to main. On
  `feature/important-agents`.
- [Local app on the agent dock](plans/dock-local-app.md) — a Repo's Local-tab
  product (its `localPort` app) is now visible **and renderable** inside the
  agent dock that hosts it. **Slice 1:** a row **above the git section** on each
  dock states whether the agent serves a local app — "serving on :PORT",
  ":PORT · not serving", or "none" (probed via the same-origin
  `/api/localview/{repoId}/` proxy). **Slice 2:** when a port is set that row is
  a **toggle** that swaps the dock screen between the chat and the product
  (iframed via `ProductFrame`, off by default — the iframe only mounts once
  revealed). Frontend-only; browser-verified on an isolated :5201 preview and on
  live :5099; deployed & confirmed 2026-06-15, merged to main. On
  `feature/dock-local-app`.
- [Pin my last prompt at the top of the chat](plans/pin-last-prompt.md) — the
  user's **most recent sent prompt** stays pinned in a non-scrolling banner above
  the transcript (clamped, click-to-expand), so a long agent response doesn't
  bury "what did I ask?". Shows in the main chat tab **and** the dashboard docks;
  the message still appears normally below. Frontend-only (`Chat.jsx` +
  `chat.css`); browser-verified on an isolated :5210 instance; merged to main
  2026-06-15. On `feature/pin-last-prompt`.
- [Custom-prompts button on the dashboard docks](plans/dock-prompts-button.md) —
  the custom-prompts **⚙ button** (plans/custom-prompts.md) is now in the
  dashboard agent docks' embedded composer, not just the main chat tab (dropped
  the `!embedded` gate in `ChatInput.jsx`; the modal already portals to `<body>`,
  so the small dock doesn't shrink it, and "Use" prefills that dock's composer).
  Frontend-only; browser-verified on an isolated :5210 instance; merged to main
  2026-06-15. On `feature/dock-prompts-button`.
- **Multiline prompts no longer truncated** (bug fix) — a chat message containing
  newlines reached the agent **only up to its first line**: launching the npm
  `claude.cmd` shim from .NET routes the command line through `cmd.exe`, which
  ends the command at the first newline, so the `-p "<prompt>"` argument was cut
  off. Now resolves to the real `claude.exe` (native installer on PATH, else the
  npm install's exe under `node_modules`); `claude.cmd` kept only as a last
  resort. Proven with a dummy-launcher repro (`.cmd` dropped everything after the
  first `\n`, a real `.exe` preserved it) plus an end-to-end echo test on an
  isolated :5210 instance; deployed to live :5099 & confirmed 2026-06-15, merged
  to main. On `fix/multiline-prompt-truncation`.
- [Zoom the content inside the agent docks](plans/dashboard-zoom.md) — a header
  **A−/A+** control zooms the **content rendered inside** each dashboard dock (the
  embedded chat's text + controls) smaller/bigger via CSS `zoom` on the phone
  docks' `.phone__screen`, remembered per device — distinct from the existing
  dock-*window*-size stepper. Frontend-only; browser-verified on an isolated
  :5210 instance; merged to main 2026-06-15. On `feature/dashboard-zoom`.
- [Copyable agent repo path on the dashboard](plans/dock-copy-path.md) — each
  agent's repository folder path on the dashboard (cards + phone docks) is now
  **copyable** via a 📋 control with a "Copied!" confirmation, so a path can be
  handed to another agent without retyping. The copy click is isolated from the
  card/dock's open-agent button; `copyText()` has an `execCommand` fallback for
  non-secure HTTP/LAN contexts. Frontend-only; browser-verified on an isolated
  :5210 instance; merged to main 2026-06-15. On `feature/dock-copy-path`.
- [Side "Ask" conversation per repo](plans/repo-ask-chat.md) — a persistent,
  always-available **Ask** chat: a **read-only side conversation** that runs on
  its own lane so you can ask about a repo **while the builder is running** (no
  409) and **without polluting the builder's context** (own session). Two
  surfaces: a 3rd **Ask** segment next to Project / Claude Web, and a
  **Builder | Ask** toggle on every dashboard dock (one Ask per repo, many at
  once). Backend re-keyed the run gate to per-`(repo, lane)`; the ask lane spawns
  `claude --permission-mode plan` (reads/answers, can't mutate — verified).
  Browser- + API-verified on isolated :5210 and on live :5099
  (`verify-ask-lane.mjs`, `verify-ask-surface.mjs`, `verify-ask-dock.mjs`); all
  three slices **deployed to live :5099 & confirmed 2026-06-15** (not yet merged
  to main). On `feature/repo-ask-chat`.
- [Architectural plan in Ideas + expandable dashboard dock](plans/ideas-arch-plan.md)
  — the shared `IdeasPanel` is now **tabbed** (Ideas | Architectural plan); the
  Architectural-plan tab is a single user-written, **very tall** doc (new global
  `GET/PUT /api/arch-plan`) you keep by hand to drive the agent grid — the view
  **renders Markdown** (shared GFM renderer) and Edit drops to the raw plain
  text. The **dashboard Ideas dock** also gets an **expand toggle** (300→620px).
  Shows in both the Ideas tab and the dashboard dock. Browser-verified on an
  isolated :5210 instance; deployed to live :5099 & merged to main 2026-06-15
  (markdown follow-up on `feature/archplan-markdown`). On `feature/ideas-arch-plan`.
- [Dashboard opens from the header title](plans/dashboard-title-button.md) — the
  agent-dashboard entry point moved from the standalone top-bar **Dashboard**
  button onto the top-left `machine · project · branch` label, now a button
  (same text; accent-filled while the dashboard is open). Keeps the existing
  Advanced-mode + 2-agent gating. Frontend-only (`Layout.jsx` + `global.css`).
  Browser-verified; deployed to live :5099 & confirmed, merged to main
  2026-06-15. On `feature/dashboard-title-button`.
- [Taller agent docks](plans/taller-agent-cards.md) — the agent-dashboard "wall
  of phones" docks were locked **square** (`aspect-ratio: 1/1`), so each embedded
  chat showed only a few lines. Made the phones **portrait (3:4)** — height ≈
  1.33× width, ~⅓ more transcript — without getting wider; cards stay square and
  the size stepper still scales overall. One-line CSS change, no JS (the embedded
  chat's flex sizing fills the taller frame, composer stays reachable).
  Browser-verified on an isolated :5210 instance and on live :5099
  (`verify-taller-agent-cards.mjs`: ratio 1.333, composer in-frame); merged to
  main and deployed to live :5099 2026-06-15 (rode along in the b9a0914 deploy
  alongside dashboard-title-button). On `feature/taller-agent-cards`.
- [Remove projects](plans/remove-projects.md) — the Projects tab can now
  **remove (unregister)** a project, mirroring its add action: a confirm-guarded
  🗑 control on each card (hidden for the self repo, shown in both UI modes) hits
  a new `DELETE /api/repos/{id}`. It drops the `repositories.json` entry only —
  the folder stays on disk — and `RepoContext` self-heals the active selection.
  Browser-verified on an isolated :5210 instance; deployed to live :5099 &
  confirmed, merged to main 2026-06-15. On `feature/remove-projects`.
- [File size warnings](plans/file-size-warnings.md) — get refactoring under
  control: each file row in the **Files tab** shows a **line-count badge** that
  turns red (⚠️) when the file is over **500 lines**. Backend adds `Lines` to the
  `/api/files` listing (streaming newline count; skips binaries and files over a
  5 MB cap). Browser-verified; deployed to live :5099 & merged to main
  2026-06-15. On `feature/file-size-warnings`.
- [Dock chat refresh](plans/dock-chat-refresh.md) — each dashboard agent dock
  gets a **refresh `↻` for its conversation**, in the chat header next to "New"
  (shown only on docks). It runs a single-key reconcile (`refreshOne`):
  reattaches a live run or re-pulls the finished transcript — for when a dock's
  embedded chat looks stale and you don't want to maximize it or reload.
  Browser-verified on an isolated :5210 instance; merged to main 2026-06-15 (not
  yet deployed). On `feature/dock-chat-refresh`.
- [Custom prompts](plans/custom-prompts.md) — a single ⚙ composer button opens a
  centered modal (portaled to `<body>`) holding the built-in understanding/kickoff
  prompts plus user-defined custom ones; each row shows the prompt text and a
  **Use** button that prefills the composer, with Add/Edit/Delete for custom ones.
  Global backend-synced (`PromptsService` + `/api/prompts`). Deployed to live
  :5099, browser-verified (`verify-unified.mjs` 9/9); merged to main 2026-06-15.
- [Ideas — fuzzy filter + optional project field](plans/ideas-filter-project.md)
  — a client-side **fuzzy filter** (subsequence search box) over the Global
  Ideas list and an **optional free-text `project` field** on each idea (chip on
  the card, persisted; old projectless ideas unaffected). Both flow through the
  shared `IdeasPanel`, so the Ideas tab and the dashboard's pinned-left panel got
  them together. Browser-verified on an isolated :5210 instance; merged to main
  2026-06-15 (not yet deployed). On `feature/ideas-filter-project`.
- [Dashboard git status on docks](plans/dashboard-git-status.md) — the Git tab's
  branch + "n ahead · m behind" position rows (vs base main/master, origin/main,
  upstream) now render on the dashboard **phone docks** too, and the **cards**
  were switched to the same rows — all via a shared `GitStatusSummary` component
  so the three surfaces can't drift. Deployed & confirmed 2026-06-14 on
  `feature/dashboard-git-status`; not yet merged.
- [Dashboard chat cut off](plans/dashboard-chat-scroll.md) — **bug fix:** in the
  dashboard "wall of phones," the embedded chat overflowed its cell (clipped, no
  reachable composer) because `height:100%` couldn't resolve against a
  flex-derived frame height. Fixed by sizing the embedded chat via flexbox
  (`.phone__screen` flex column; chat `flex:1; min-height:0`). Deployed &
  confirmed 2026-06-14 (1488dc9); not yet merged.
- [Chat windowing](plans/chat-windowing.md) — long chats were slow because
  `Chat.jsx` rendered every message (heavy markdown bubble per turn) and we
  almost never scroll up. **Slice 1** renders only the recent tail (last 50)
  with a "Show earlier" reveal; full transcript stays in state, frontend-only.
  Deployed & confirmed 2026-06-14 on `feature/chat-windowing`; not yet merged.
- [Dashboard shortcut](plans/dashboard-shortcut.md) — `Ctrl/Cmd+Shift+D` toggles
  between the agent dashboard overlay and the normal tab view (Escape still
  closes; ignored while typing). Deployed & confirmed 2026-06-14 (77aa0ae).
- [Understanding panel](plans/understanding-panel.md) **— slice 2** — a
  composer-prefill button that makes the panel work in Product Repos, not just
  the Harness; drops the "write your understanding first" instruction into the
  chat box (no extra `claude -p` cost). Deployed & confirmed 2026-06-14.
- [Git tab — branch PR preview](plans/git-pr-preview.md) — for the current
  feature branch, shows where it branched off, the commits since, and the
  cumulative `base...HEAD` file diff (what a GitHub PR shows) — distinct from the
  working-tree `git status` view. Slices 1 (summary) & 2 (lazy per-file patch).
  Deployed & confirmed 2026-06-14.
- [Image preview](plans/files-image-preview.md) — image files
  (`.png/.jpg/.svg/...`) render as pictures in the Files viewer via a new
  whitelisted `/api/files/raw` endpoint + an `<img>` (blob-fetched, 5 s
  live-refresh). "Agent saves a screenshot to the repo → view it in Files."
  Screen tab kept. Deployed & confirmed 2026-06-14 (bf81848); not yet merged.
- [HTML preview](plans/html-preview.md) — `.html`/`.htm` files render as a page
  in the Files viewer via a sandboxed `srcDoc` iframe (scripts inert), with the
  same raw/rendered toggle Markdown has. Realizes the deferred doc-viewer "HTML
  webview" slice. Live on :5099 + merged to main 2026-06-14. Try it:
  [html-preview-demo.html](plans/html-preview-demo.html).
- [Files tab absorbs the Plan tab](plans/plan-files-merge.md) — the Files tab is
  the single file surface: remembered/default open (`plan.md`), return-to-tree,
  5 s live-poll of the open file, back/forward history, and per-project
  backend-synced **pins** (📌-toggle any file; seeded `plan.md`/`CLAUDE.md`).
  Retired the Plan tab + its duplicate renderer. Deployed & confirmed
  2026-06-14 (8e5e4fc); not yet merged to main.
- [Stale-copy warning banner](plans/stale-version-banner.md) — after a redeploy,
  an open browser running the old cached bundle gets a dismissible "new version
  — Reload" banner (build-stamp compare via `version.json`). Closes the gap that
  stranded open windows on stale code after the per-tab-spaces deploy. Deployed
  & confirmed 2026-06-14 (cf75052).
- Local tab — "how to expose a web app" instructions in the setup form: open an
  agent in the Claude Web repo, give it the path to the target app, and ask it
  to reconfigure it for Local-tab exposure (one loopback port, relative URLs).
  Extends [Local tab over the internet](plans/local-app-proxy.md). Deployed &
  confirmed 2026-06-14 (cf75052).
- [Per-tab agent spaces](plans/per-tab-spaces.md) — two browser tabs on one
  machine no longer share a single "currently open agent". The active agent,
  chat surface, and selected project moved from shared `localStorage` to per-tab
  `sessionStorage` (with a `localStorage` seed for fresh tabs/restarts). Refines
  [dock-sync](plans/dock-sync.md)'s Active Tab to tab-local. Reproduced
  before/after on an isolated harness. Merged to main, deployed & confirmed
  2026-06-13.
- [Exposure check — freshness](plans/expose-freshness.md) — slice 3 of product
  onboarding. "Verify exposure" was server-side and couldn't see that the
  operator's own browser was rendering a stale/blank cached embed (real
  incident: all-green check, blank tab, fixed only by incognito). Added a
  client-side "embed is current" check + one-click Reload-embed, made Refresh
  cache-bust, and set `Cache-Control: no-store` on the proxy's HTML. Merged to
  main, deployed & confirmed 2026-06-13.
- [Product onboarding](plans/product-onboarding.md) — make product exposure
  harness-driven + verifiable instead of hand-copied instructions that drift.
  **Slice 1 (Exposure check)** — a "Verify exposure" panel on the Local tab
  that probes the product and names what's wrong — deployed & confirmed
  2026-06-13. **Slice 2 (Fix with an agent)** — composes a fix task from the
  failures + the current contract and pre-fills the Project chat — deployed &
  confirmed 2026-06-13.
- [Understanding panel](plans/understanding-panel.md) — a collapsible panel
  at the top of the chat window that renders Claude's own restatement of the
  request (written to a file), so the user can confirm "you understood me"
  before work proceeds. Reuses the Plan tab's render+poll machinery. Merged
  to main, deployed & confirmed 2026-06-13.
- [Deployments tab](plans/deployments-tab.md) — make deploys observable and
  safe: shows what's live (commit, contains-origin/main), a live
  armed-rollback countdown with Keep-it / typed-confirm Roll-back-now, and
  deploy history from a new `deploys.jsonl` ledger. Slice 1 (incl. the
  Keep-it end-state robustness fix) merged to main, deployed & confirmed
  2026-06-13; slice 2 (one-button deploy + lock) later.
- [Plan-tab stretch](plans/plan-tab-stretch.md) — Plan/doc content width
  tracks the pane (tiered via container query); wider pane = wider diagrams,
  prose stays readable. Merged to main, deployed & confirmed 2026-06-13.
- [Local tab over the internet](plans/local-app-proxy.md) — the harness
  reverse-proxies the project's local port under an authenticated
  `/api/localview/{repoId}/` path so the Local tab works over the internet
  (behind the password), not just the LAN. Also fixes the IPv6/HTTPS issue.
  Merged to main, deployed & confirmed 2026-06-13.
- [Ideas tab](plans/ideas-tab.md) — per-project notes stored on the
  backend; create/edit/delete, scoped by project like Files/Git. Merged to
  main, deployed & confirmed 2026-06-13.
- [Tab visibility](plans/tab-visibility.md) — per-tab show/hide toggles on
  the Settings cards drop tabs from the advanced nav (claude/settings always
  shown). Merged to main, deployed & confirmed 2026-06-13.
- [Local tab](plans/local-app-tab.md) — preview any local port per project
  with a direct iframe; LAN-only, none of the /preview/ proxy machinery.
  First consumer: the web-flow-autodev web pilot on :5300. Merged to main,
  deployed & confirmed 2026-06-13. (Superseded by the proxy version above.)
- [Pane widths](plans/pane-widths.md) — per-tab span (1-4 slot units) for
  the desktop multi-pane strip, set on the Settings tab cards. Merged to
  main, deployed & confirmed 2026-06-13.
- [Projects folder picker](plans/projects-folder-picker.md) — navigable
  folder picker replaces the chip wall; folder creation is explicit only
  (typos no longer create folders). Merged to main, deployed & confirmed
  2026-06-13.
- [Dual chat](plans/dual-chat.md) — two persistent chat tabs: a Project
  chat that follows the active project and an always-on Claude Web chat
  pinned to the Harness's own repo. Merged to main, deployed & confirmed
  2026-06-13.
- [Settings tab](plans/settings-tab.md) — rearrangeable nav-tab order with
  live preview; extracted the one canonical tab registry. Deployed &
  confirmed 2026-06-12.
- [Docs viewer](plans/doc-viewer.md) — sliced: 1) mermaid label wrapping +
  2) doc links + history in the Files viewer (both deployed & confirmed
  2026-06-12, merged to main); 3) cross-repo links + 4) HTML webview
  remain deferred.
- [Multi-pane: five panes](plans/multi-pane-five.md) — desktop pane cap
  raised 4 -> 5 for 4K monitors. Merged to main, deployed 2026-06-13.
- [IP intelligence](plans/ip-intel.md) — country/ISP/datacenter enrichment
  in the Guests tab. Deployed & confirmed 2026-06-12.
- **Git tab suite** (merged to main 2026-06-12 evening, deployed & confirmed):
  [origin visibility](plans/git-origin-visibility.md) (honest origin/main
  comparisons + drift warning), [actions](plans/git-actions.md)
  (merge-main/pull-main/pull-branch/push-branch with busy-guard and
  conflict auto-abort), [other-branches overview](plans/git-branches.md)
  (cross-computer WIP memory, dead branches hidden) and the
  [history graph](plans/git-graph.md) (mermaid, newest at top, HEAD
  marked). Also enforced: deploys must contain origin/main
  (docs/claude-web/self-dev.md + swap.ps1 guard).
- [Auth IP filter](plans/auth-ip-filter.md) — IP allowlist gate in front of
  password login. Merged to main, deployed & field-tested 2026-06-12.
- [Terminal sessions](plans/terminal-sessions.md) — Chat/Term in one nav
  slot, multiple PTYs, interactive `claude --resume`. Deployed & confirmed
  2026-06-12 (includes the deploy-tooling post-mortem).
- [Files tree view](plans/files-tree-view.md) — VS Code-style folder
  expand/collapse in the Files tab. Merged to main, deployed.
- [Terminal tab](plans/terminal-tab.md) — the ConPTY foundation the
  sessions feature builds on (PR #7).

## Next up

- Housekeeping (offered, awaiting the user's word): delete the merged local
  branches (4× feature/git-* + 17 older ones — the Git tab's dead-branch
  filter already hides them).

## Reference docs

- [Networking map](docs/networking.md) — how the homepage / App tab / Local
  tab are served, the gates, and a "won't serve" decision tree
  ([plan](plans/networking-doc.md)).
- [Module conventions](plans/INTEGRATION.md) — how controllers/services plug in.
- [Design rationale](ANALYSIS.md) — why this app exists.
- [Proxy guide](docs/claude-web/proxy.md) — reverse-proxy traps of /preview/.
- [Threat model](plans/threat-model.md) — remaining attack vectors after the
  auth IP filter, with severity/likelihood ratings.
- [Doc principles](plans/doc-principles.md) — how to structure plans/docs
  (cohesion, progressive disclosure, no duplication).
