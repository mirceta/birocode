# Claude Web — working plan

> Editing any plan? First read
> [doc principles](plans/doc-principles.md) — cohesion by unit,
> progressive disclosure, reference-don't-duplicate.

> **Status (2026-06-12):** One feature in flight.

## Active feature plans

- [Docs viewer](plans/doc-viewer.md) — sliced: 1) mermaid label wrapping
  (branch `feature/doc-viewer`, in progress), 2) doc links + history in
  the Files viewer (next), 3) cross-repo links + 4) HTML webview
  (deferred).

## Recently shipped

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

- Git tab upgrades (user request, not yet planned): merge-main-into-branch,
  pull/push origin, refresh buttons — and compare against **origin/main**,
  not local main (today's lesson: the tab said "ahead of main" while origin
  had moved).

## Reference docs

- [Module conventions](plans/INTEGRATION.md) — how controllers/services plug in.
- [Design rationale](ANALYSIS.md) — why this app exists.
- [Proxy guide](docs/claude-web/proxy.md) — reverse-proxy traps of /preview/.
- [Threat model](plans/threat-model.md) — remaining attack vectors after the
  auth IP filter, with severity/likelihood ratings.
- [Doc principles](plans/doc-principles.md) — how to structure plans/docs
  (cohesion, progressive disclosure, no duplication).
