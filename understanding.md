# Understanding — Multiple local apps per repo (Understanding app as first consumer)

## The goal (reframed)
The headline feature is now a **platform upgrade**: let a repository expose **more
than one local app** (several ports), with a **switcher in the Local tab**, instead
of today's single-`LocalPort` / one-`/api/localview/{repoId}/`-per-repo model.

The **diagram/explain idea becomes the first consumer**: a dedicated, always-on
**Understanding app** (harness-provided) that the agent feeds a **diagram whenever
it explains something** — so we get the diagram surface *without* polluting the
deliberately-minimal [[local-exposure-example]].

## Why this shape
- Keeps separation of responsibilities: the exposure-example stays a tiny tutorial;
  the Understanding app is its own thing.
- "Multiple local apps" is a real, reusable capability (multi-service repos), not a
  one-off — so the platform cost buys more than this feature.
- The Understanding app is **harness-provided + always-on** because it must be up
  whenever an agent explains; this does NOT contradict the earlier "don't bake the
  *example* into the harness" call (that was about authenticity; a generic renderer
  has no such requirement).

## Slices
- **Slice 1 — Multi-local-app platform:** data model (`LocalApps` list +
  back-compat), proxy path with an app segment + default, Local-tab switcher, and
  the dock/Exposure-check ripple. Proven with exposure-example + a throwaway 2nd app.
- **Slice 2 — Understanding app:** harness-provided always-on diagram renderer as a
  second app + the prompt nudge + lifecycle.

## Status
**Slice 1 — SHIPPED & verified.** Built the multi-local-app platform:
- Data model: `RepositoryConfig.LocalApps` list; legacy `LocalPort` read as one app
  and migrated on first mutation; back-compat `localPort` = default (first) app.
- Proxy: `…/{repoId}/app/{appId}/` (named) + bare `…/{repoId}/` → default app.
- API: add/remove-app endpoints; `/api/repos` returns `localApps`.
- Local-tab UI: app switcher (chips + "+ Add app" + remove).

Verified end-to-end against an isolated preview on :5210 (live store backed up and
restored byte-for-byte): both proxy routes, relative-asset resolution per app, bad
appId → 404, the add/remove endpoints, and the Local-tab switcher in a real
browser (clicking "App Two" swaps the embed). Live :5099 untouched.

**Slice 2 — NOT started:** the harness-provided always-on Understanding app +
the explain-time nudge.

## Open decisions before Slice 2
- Nudge delivery: prompt-build injection vs. CLAUDE.md vs. a tool (A vs. D vs. E in
  the plan table).
- Diagram format & lifecycle (rolling latest vs. small history).
