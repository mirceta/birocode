# Add a harness-native OpenSpec Cockpit tab (alongside the standalone Control Room)

## Why

The OpenSpec Cockpit today lives only in the standalone Control Room app
(`openspec-port-app/`), which the `openspec-cockpit` baseline describes. That app is
repo-flexible (its target is configurable from the UI), and we are **keeping it** — it is
the decoupled, run-on-its-own surface.

But there is a second, complementary need: while working **inside the Harness**, the
Operator wants to see the OpenSpec state of the **currently selected repo/agent** without
leaving for a separate app. The Harness already resolves "the selected repo" for every
per-repo endpoint (`X-Repo-Id`), so a harness-native Cockpit tab gets correct scoping for
free and re-scopes when the Operator switches repositories — no per-repo copy of the
Cockpit.

This was built once and removed (the standalone-only call); the Operator has since decided
they want **both** surfaces. This change re-homes the read-only Cockpit into the Harness as
an additional surface, leaving the standalone Control Room cockpit untouched.

## What Changes

- **Harness Cockpit tab (frontend)** — an Advanced-mode `Cockpit` tab
  (`client/src/pages/Cockpit.jsx`) showing read-only OpenSpec state for the selected repo:
  legend, in-flight changes with completion ring, shipped (archived) changes, the living
  baseline, the change↔baseline cross-link, and safe-name-gated drill-in. Auto-scopes to
  the selected repo and re-scopes on switch. Registered in `tabRegistry.jsx`, `App.jsx`,
  the `cockpitTab` capability flag, `SettingsController.KnownTabs`, and i18n.
- **Read-only OpenSpec endpoint (backend)** — `OpenspecController` (`/api/openspec/*`),
  scoped by the same `X-Repo-Id`/`?repo=` resolution as every other per-repo endpoint,
  backed by `OpenspecCockpitService` (a C# port of the Control Room's aggregation: `openspec
  list`/`spec list`/`validate --json` + `archive/` + `tasks.md` + delta touches, spawning
  `openspec` via the npm shim). No mutating verb is exposed; drill-in ids are safe-name
  gated. A readiness preflight reports openspec-on-PATH + `openspec/`-present so an
  uninitialised repo shows an explicit state, not stderr noise.
- **No change to the standalone Control Room cockpit** — `openspec-port-app/` and its
  existing baseline requirements are untouched; this adds a second surface, it does not
  replace the first.

## Impact

- Affected specs: `openspec-cockpit` (ADDED: harness-native Cockpit tab requirement).
- Affected code: new `ClaudeWeb.App/Controllers/OpenspecController.cs`,
  `ClaudeWeb.App/Services/OpenspecCockpit/*`, `client/src/pages/Cockpit.jsx` +
  `cockpit.css`; wiring in `EmbeddedApi.cs`, `SettingsController.cs`, `App.jsx`,
  `tabRegistry.jsx`, `UiModeContext.jsx`, `i18n/{en,tr}.json`.
- Read-only: introduces no mutating OpenSpec verb in the Harness.
