# Claude Web — working plan

> **Status (2026-06-12):** No feature currently in flight. Two features
> shipped today from parallel sessions (and merged together on
> `feature/terminal-sessions`):

## Recently shipped

- [Terminal sessions](plans/terminal-sessions.md) — Chat/Term in one nav
  slot, multiple PTYs, interactive `claude --resume`. Deployed & confirmed
  2026-06-12 (includes the deploy-tooling post-mortem).
- [Files tree view](plans/files-tree-view.md) — VS Code-style folder
  expand/collapse in the Files tab. Merged to main, deployed.
- [Terminal tab](plans/terminal-tab.md) — the ConPTY foundation the
  sessions feature builds on (PR #7).

## Next up

- Git tab upgrades (user request, not yet planned): merge-main-into-branch,
  pull/push origin, refresh buttons — and compare against **origin/main**,
  not local main (today's lesson: the tab said "ahead of main" while origin
  had moved).
