# Make the Exposure check app-aware

> Editing this plan? First read [doc principles](doc-principles.md).

> **Status (2026-06-16): building.** On `feature/expose-check-app-aware`. Realizes
> the "per-app Exposure-check awareness" **follow-up** of
> [multiple-local-apps](multiple-local-apps.md).

## Problem (bug)

The Local tab's **"Verify exposure"** always checks the repo's **default** app, not
the app selected in the switcher. After the multi-app upgrade the check was never made
app-aware:

- `ExposeController.Check` took no `appId` and `ExposeService.RunAsync(repo)` probed
  `repo.LocalPort` (the first/default app) on `127.0.0.1`; `BuildFixPrompt` too.
- `ExposeCheck.jsx` called `/api/expose/check` with no app id, and its client-side
  freshness probe hit the **bare** `/api/localview/{id}/` (default app) while the
  iframe showed the *selected* app — a mismatch.

So selecting a non-default app and hitting Verify still reported on the default app
(e.g. always `:5300`).

## Fix

- **Backend** — `ExposeController.Check([FromQuery] string? appId)` resolves the app
  against `RepositoryRegistry.EffectiveApps(repo)` (repo apps only; the synthetic
  Understanding app isn't a product), defaulting to the first app when omitted, and
  passes that app's port. `ExposeService.RunAsync(repo, int? appPort, ct)` and
  `BuildFixPrompt(repo, int? appPort, checks)` use the passed port instead of
  `repo.LocalPort`. Response echoes `appId`/`appName`.
- **Frontend** — `LocalApp.jsx` passes the selected app to `ExposeCheck`;
  `ExposeCheck.jsx` sends `appId` to `/api/expose/check` and points its freshness
  probe at `/api/localview/{id}/app/{appId}/` (matching the embedded iframe).

## Scope / notes

- Repo-apps only (the Local tab already hides Verify for the harness/Understanding
  app); now scoped to the *selected* repo app.
- Backend change → needs a harness rebuild + restart to go live.

## Verification

Local tab: select a non-default app and Verify — the checklist + fix-prompt name that
app's port (not `:5300`); the freshness row compares the selected app's bundle.
