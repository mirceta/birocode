# Claude Web — working plan

> Editing any plan? First read
> [doc principles](plans/doc-principles.md) — cohesion by unit,
> progressive disclosure, reference-don't-duplicate.
>
> New doc-viewer capabilities, shown live:
> [doc-viewer examples](plans/doc-viewer-examples.md) — open it in the
> Files tab to see wrapping mermaid labels etc. in action.

> **Status (2026-06-13):** One feature in planning (plan-tab stretch -- not
> yet built, on `feature/plan-tab-stretch`). Ideas tab deployed & confirmed;
> its branch awaits the merge word.

## Active feature plans

- [Plan-tab stretch](plans/plan-tab-stretch.md) -- Plan/doc content width
  tracks the pane (tiered via container query); wider pane = wider diagrams,
  prose stays readable.

## Recently shipped

- [Ideas tab](plans/ideas-tab.md) — per-project notes stored on the
  backend; create/edit/delete, scoped by project like Files/Git. Deployed
  & confirmed 2026-06-13; on `feature/ideas-tab`, not yet merged to main.
- [Tab visibility](plans/tab-visibility.md) — per-tab show/hide toggles on
  the Settings cards drop tabs from the advanced nav (claude/settings always
  shown). Merged to main, deployed & confirmed 2026-06-13.
- [Local tab](plans/local-app-tab.md) — preview any local port per project
  with a direct iframe; LAN-only, none of the /preview/ proxy machinery.
  First consumer: the web-flow-autodev web pilot on :5300. Deployed &
  confirmed 2026-06-13; on `feature/local-app-tab`, not yet merged to main.
- [Pane widths](plans/pane-widths.md) — per-tab span (1-4 slot units) for
  the desktop multi-pane strip, set on the Settings tab cards. Merged to
  main, deployed & confirmed 2026-06-13.
- [Projects folder picker](plans/projects-folder-picker.md) — navigable
  folder picker replaces the chip wall; folder creation is explicit only
  (typos no longer create folders). Merged to main, deployed & confirmed
  2026-06-13.
- [Dual chat](plans/dual-chat.md) — two persistent chat tabs: a Project
  chat that follows the active project and an always-on Claude Web chat
  pinned to the Harness's own repo. Deployed & confirmed 2026-06-13; on
  `feature/dual-chat`, not yet merged to main.
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

- [Module conventions](plans/INTEGRATION.md) — how controllers/services plug in.
- [Design rationale](ANALYSIS.md) — why this app exists.
- [Proxy guide](docs/claude-web/proxy.md) — reverse-proxy traps of /preview/.
- [Threat model](plans/threat-model.md) — remaining attack vectors after the
  auth IP filter, with severity/likelihood ratings.
- [Doc principles](plans/doc-principles.md) — how to structure plans/docs
  (cohesion, progressive disclosure, no duplication).
