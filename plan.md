# Claude Web — example root plan

> **Status (2026-06-11):** DEMO — this file and `plans/example-subplan.md`
> exist only to show off the Plan tab's subplan navigation. Safe to delete.

This is the **home file** of the Plan tab (repo-root `plan.md`). Links below
demonstrate every kind of link the tab handles.

## Subplans (internal links — open in-place)

- [Example subplan](plans/example-subplan.md) — a demo subplan written for
  this walkthrough; it links back here and sideways to a real plan.
- [Plan tab navigation](plans/plan-tab-navigation.md) — the real plan for the
  feature you are using right now.
- [Module conventions](plans/INTEGRATION.md) — how controllers/services plug in.
- [Design rationale](ANALYSIS.md) — a root-level doc, also navigable.
- [Proxy guide](docs/claude-web/proxy.md) — works for nested folders too.

Click any of these: the content swaps in-place, the path appears in the
header bar, and the **⌂ plan.md** button lights up to bring you home.

## Links that are NOT intercepted

- [Anthropic](https://anthropic.com) — external (has a protocol), opens in a
  new tab as before.
- [Jump to subplans](#subplans-internal-links--open-in-place) — anchor-only,
  scrolls within this page.
- Ctrl/Cmd-clicking any link above still opens it in a new browser tab.

## Missing file behavior

- [A subplan that does not exist](plans/no-such-plan.md) — shows the empty
  state, with the home button still available.
