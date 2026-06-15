# Claude Web — working plan

> Editing any plan? First read
> [doc principles](plans/doc-principles.md) — cohesion by unit,
> progressive disclosure, reference-don't-duplicate.
>
> New doc-viewer capabilities, shown live:
> [doc-viewer examples](plans/doc-viewer-examples.md) — open it in the
> Files tab to see wrapping mermaid labels etc. in action.

> **Status (2026-06-15):** **Deployed & confirmed, merged to main:**
> [remove projects](plans/remove-projects.md) — the Projects tab can now
> unregister a project (🗑 on each card; folder kept on disk). **Just merged
> (not yet deployed):** per-dock
> [chat refresh](plans/dock-chat-refresh.md) on the agent dashboard. **In
> flight:** Agent dashboard — a top-bar full-screen grid overview of every agent
> on this machine, on `feature/agent-dashboard` (slice 1 built + browser-verified;
> redirected from a tab to a top-bar overlay). **Deployed &
> confirmed (cf75052):** the
> [stale-copy warning banner](plans/stale-version-banner.md) and the Local-tab
> "how to expose a web app" instructions are live on :5099. The same deploy
> also shipped Understanding panel **slice 2** and the Git tab **PR preview**
> (slices 1 & 2) — now deployed & confirmed. Already merged &
> deployed: Understanding panel slice 1, Deployments tab slice 1, the
> product-onboarding Exposure check (slices 1-3), and per-tab agent spaces.
> [Chat windowing](plans/chat-windowing.md) slice 1 — render only the recent
> tail of long conversations so the app stays fast — is deployed & confirmed on
> `feature/chat-windowing` (not yet merged). Proposed: a
> [spec-baseline](plans/spec-baseline.md) DESIGN plan — what to borrow from
> OpenSpec — on `feature/spec-baseline`. Parked: a
> [PWA "older version" warning](plans/pwa-webapk-warning.md) plan on
> `feature/pwa-webapk-warning` (set aside, not started).

## Active feature plans

- [Ideas go global, pinned left of the dashboard](plans/ideas-pinned-dashboard.md)
  — make Ideas a single **global** master list (no longer per-project; reverses
  ideas-tab.md), keep the Ideas tab showing all of them, and pin that list left
  of the agent-dashboard overlay. Design set (backend de-keying + migration +
  shared component); not built. On `feature/ideas-pinned-dashboard`.
- [Feature kickoff & closeout](plans/feature-kickoff.md) — a seamless feature
  lifecycle for BOTH ends: starting the next feature (branch, plan, understanding)
  AND finishing one per our flow (keep-it bookkeeping, mark shipped, merge, tidy)
  — so the user doesn't re-describe the ritual and the agent doesn't drop steps.
  Approach decided: composer-prefill buttons (Understanding-panel pattern) that
  fill the chat box with the kickoff/closeout ritual. On `feature/feature-kickoff`.
- [Agent dashboard](plans/agent-dashboard.md) — a mission-control grid showing
  every agent on this machine at once (status + what it's doing). Opened from a
  top-bar button (Advanced + 2+ agents) as a full-screen overlay, not a tab;
  click a cell to open that agent in the normal `/studio` view. Removes the
  "open one → look → navigate back" dance. Mostly a new view over existing
  plumbing (`DockContext`, `/api/runs`, the open-agent flow). Slice 1 = static
  grid + open-agent (built & browser-verified), slice 2 = liveness, slice 3
  (later) = live tail.

## Proposed / design (not building yet)

- [Spec baseline](plans/spec-baseline.md) — borrow OpenSpec's one missing
  idea (a living "what the system does today" baseline + change-as-delta)
  into our existing plan convention, without adopting its tooling. Slice 1 =
  `docs/capabilities.md` + a delta stanza in each plan + a ritual step.

## Recently shipped

- [Side "Ask" conversation per repo](plans/repo-ask-chat.md) — a persistent,
  always-available **Ask** chat (3rd segment next to Project / Claude Web), a
  **read-only side conversation** that runs on its own lane so you can ask about
  a repo **while the builder is running** (no 409) and **without polluting the
  builder's context** (own session). Backend re-keyed the run gate to per-`(repo,
  lane)`; the ask lane spawns `claude --permission-mode plan` (reads/answers,
  can't mutate — verified). Browser- + API-verified on isolated :5210 and on live
  :5099 (`verify-ask-lane.mjs`, `verify-ask-surface.mjs`); **deployed to live
  :5099 & confirmed 2026-06-15** (not yet merged to main). On
  `feature/repo-ask-chat`.
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
