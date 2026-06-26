## Why

The OpenSpec Cockpit already detects when the selected repo is not OpenSpec-ready
(no `openspec` CLI on PATH, or no `openspec/` directory) and shows a
"Prepared for OpenSpec?" section — but its remediation is only static text telling
the operator to "Run `openspec init`" by hand. To use OpenSpec in another repo
(e.g. `prg-copy1`), the operator must leave the harness, open a shell in that repo,
and run the CLI manually. The standalone Control Room already documents this as the
**Operate → Workflows → "Set up the tool"** workflow; we want that one-click
port-to-OpenSpec capability inside the cockpit, scoped to the repo already selected
in the harness.

## What Changes

- Make the cockpit's existing "Prepared for OpenSpec?" readiness section
  **actionable**: when `openspec/` is absent (but the CLI is present), offer a
  **"Set up OpenSpec"** button that runs `openspec init --tools claude` in the
  currently-selected repo's working directory, then re-runs the readiness check and
  refreshes the cockpit.
- Offer a secondary **"Update instruction files"** action (`openspec update`) for an
  already-initialized repo, mirroring the Control Room workflow's second step.
- Add a single new **gated, write** backend endpoint (e.g. `POST /api/openspec/setup`)
  that runs the fixed init/update verb in the resolved repo working dir. It is
  guarded to **never clobber** an existing `openspec/` directory on init, runs only
  the fixed verb (no arbitrary args), and returns the command result + refreshed
  readiness to the UI.
- **BREAKING (to the capability's own contract):** the `openspec-cockpit` baseline
  currently mandates the tab is strictly read-only with "no mutations" / "no new
  mutating verb". This change **modifies** that requirement to permit exactly one
  explicit, tightly-scoped setup action. All existing read-only views (in-flight,
  shipped, baseline, drill-in) are unchanged.

## Capabilities

### New Capabilities
<!-- none — this extends the existing cockpit capability -->

### Modified Capabilities
- `openspec-cockpit`: Relax the strict read-only requirement to allow one explicit,
  gated setup/init action; ADD a requirement (with scenarios) for the
  "Set up OpenSpec" / "Update instruction files" actions and the backend setup
  endpoint, including the no-clobber guard, fixed-verb constraint, repo scoping, and
  post-run readiness refresh.

## Impact

- **Frontend:** `client/src/pages/Cockpit.jsx` (readiness section → actionable),
  `client/src/pages/cockpit.css` (button states / running / result).
- **Backend:** `ClaudeWeb.App/Controllers/OpenspecController.cs` (new `POST setup`
  route), `ClaudeWeb.App/Services/OpenspecCockpit/OpenspecCockpitService.cs`
  (new init/update method reusing `RunOpenspec`, no-clobber guard, readiness re-check).
- **Repo scoping:** continues to use the existing `X-Repo-Id` → `RepositoryResolver`
  working-dir resolution; the action targets the selected repo (so `prg-copy1` is set
  up by selecting it, not by hardcoding a path).
- **No new external dependency:** relies on the `openspec` CLI already required by the
  cockpit's readiness check.
- **Security:** introduces the cockpit's first state-changing endpoint; scope is
  limited to the fixed `openspec init --tools claude` / `openspec update` verbs run in
  the resolved repo dir, with the init no-clobber guard preventing overwrite of an
  existing OpenSpec tree.
