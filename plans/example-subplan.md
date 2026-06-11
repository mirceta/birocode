# Example subplan

> **Status (2026-06-11):** DEMO — not a real feature plan. This file exists
> only so the root `plan.md` has something to navigate to. Safe to delete
> together with the root `plan.md`.

You navigated here from the root plan without leaving the Plan tab. The
header bar above now shows this file's path, and the **⌂ plan.md** button is
enabled.

## Relative links resolve against THIS file's directory

These hrefs have no `plans/` prefix — they resolve relative to where this
file lives:

- [Sibling plan: plan-tab-navigation](plan-tab-navigation.md) — `plan-tab-navigation.md`
  resolves to `plans/plan-tab-navigation.md`.
- [Back to the root plan](../plan.md) — `..` traversal works; this is the same
  as pressing the home button.
- [Up and into docs](../docs/claude-web/preview.md) — climb out of `plans/`
  and into another folder in one hop.

## Why no deeper nesting here

Subplans can link to sub-subplans arbitrarily deep — the home button always
returns to the root `plan.md` in one tap, so there is no back-stack to manage.
