# Claude Web — working plan

> Editing any plan? First read
> [doc principles](plans/doc-principles.md) — cohesion by unit,
> progressive disclosure, reference-don't-duplicate.
>
> New doc-viewer capabilities, shown live:
> [doc-viewer examples](plans/doc-viewer-examples.md) — open it in the
> Files tab to see wrapping mermaid labels etc. in action.

> **Status (2026-06-14):** **Deployed & confirmed (cf75052):** the
> [stale-copy warning banner](plans/stale-version-banner.md) and the Local-tab
> "how to expose a web app" instructions are live on :5099. The same deploy
> also carried Understanding panel **slice 2** and the Git tab **PR preview**
> (slices 1 & 2) live — their owners to mark confirmed. Already merged &
> deployed: Understanding panel slice 1, Deployments tab slice 1, the
> product-onboarding Exposure check (slices 1-3), and per-tab agent spaces.
> Proposed: a
> [spec-baseline](plans/spec-baseline.md) DESIGN plan — what to borrow from
> OpenSpec — on `feature/spec-baseline`. Parked: a
> [PWA "older version" warning](plans/pwa-webapk-warning.md) plan on
> `feature/pwa-webapk-warning` (set aside, not started).

## Active feature plans

- [Files tab absorbs the Plan tab](plans/plan-files-merge.md) — the Files tab
  is the single file surface: opens a remembered/default file (`plan.md`),
  return-to-tree in the corner, per-project backend-synced **pins**
  (`plan.md`/`CLAUDE.md`, 📌-toggle any file), and a 5 s poll of the open file.
  Retires the Plan tab + its duplicate renderer. Slices 1 & 2 built &
  browser-verified; pending deploy.
- [Understanding panel](plans/understanding-panel.md) **— slice 2** — make the
  panel work in Product Repos, not just the Harness. A composer-prefill button
  drops the "write your understanding first" instruction into the chat box (no
  extra `claude -p` cost). Built & browser-verified 6/6; live via the cf75052
  deploy, owner to confirm.
- [Git tab — branch PR preview](plans/git-pr-preview.md) — for the current
  feature branch, show where it branched off, the commits since, and the
  cumulative `base...HEAD` file diff — what a GitHub pull request shows, which
  is distinct from the existing working-tree `git status` view. Read-only;
  reuses `GitService.RunGit`/`DetectBases`. Slice 1 = summary (commits +
  changed-file counts), slice 2 = lazy per-file patch. Built & browser-verified;
  pending deploy.

## Proposed / design (not building yet)

- [Spec baseline](plans/spec-baseline.md) — borrow OpenSpec's one missing
  idea (a living "what the system does today" baseline + change-as-delta)
  into our existing plan convention, without adopting its tooling. Slice 1 =
  `docs/capabilities.md` + a delta stanza in each plan + a ritual step.

## Recently shipped

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
