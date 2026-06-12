# Claude Web — root plan

This is the **home file** of the Plan tab (repo-root `plan.md`).

## Active feature plans

- [Auth IP filter](plans/auth-ip-filter.md) — IP allowlist gate in front of
  password login (merged to main, deployed).
- [Files tree view](plans/files-tree-view.md) — VS Code-style folder
  expand/collapse in the Files tab (merged to main, deployed).
- [Plan tab navigation](plans/plan-tab-navigation.md) — subplan navigation in
  the Plan tab (merged to main, deployed).

## Reference docs

- [Module conventions](plans/INTEGRATION.md) — how controllers/services plug in.
- [Design rationale](ANALYSIS.md) — why this app exists.
- [Proxy guide](docs/claude-web/proxy.md) — reverse-proxy traps of /preview/.
- [Threat model](plans/threat-model.md) — remaining attack vectors after the
  auth IP filter, with severity/likelihood ratings.
