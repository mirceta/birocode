# Multiple local-app buttons on the agent dock

> Editing this plan? First read [doc principles](doc-principles.md).

> **Status (2026-06-16): DESIGN → building.** On `feature/dock-multi-local-app`.
> Realizes the "per-app dock awareness" **follow-up** from
> [multiple-local-apps](multiple-local-apps.md). Frontend-only.

## Problem

The dashboard agent dock's local-app affordance ([dock-local-app](dock-local-app.md)
slice 2) is a **single** toggle that always renders the repo's **default** app at the
bare `/api/localview/{repoId}/`. Since [multiple-local-apps](multiple-local-apps.md), a
repo can expose **several** local apps (plus the always-on Understanding app), and the
Local tab already has a switcher for them — but the dock can still only reach one.

## Goal

Give each dock **one button per local app the repo defines** (mirroring the Local
tab's switcher). Click an app → it renders inside the dock; click the active one →
back to chat. One app shown at a time.

## Plan (frontend-only)

- **`Dashboard.jsx`** — pass each dock the repo's full `localApps` list (from
  `/api/repos`, which already includes repo apps + the synthetic Understanding app),
  not just the single `localPort`. Liveness probe stays best-effort (repo apps may be
  offline; the Understanding/harness app is always available).
- **`PinnedAgent.jsx`** — replace the single toggle row with a **button row**, one per
  app (label + port for repo apps). The selected app renders via `ProductFrame` at
  `/api/localview/{repoId}/app/{appId}/`; clicking the active app returns to chat.
- **CSS + i18n** — styles for the button row; any new labels.

## Decisions / assumptions

- Include the **Understanding** (harness) app as a button too (parity with the Local
  tab).
- **One app at a time** per dock; default view stays the chat.
- Offline repo apps stay clickable (ProductFrame shows their state), like the Local
  tab.
- Gating unchanged: Advanced + `localAppTab`.

## Out of scope

- Multiple app frames at once in one dock.
- Backend changes (per-app proxy + `localApps` API already exist).

## Verification

Browser ([browser-testing](../docs/claude-web/browser-testing.md)): a dock for a repo
with ≥2 apps shows a button per app; clicking each swaps the dock to that app at
`…/app/{appId}/`; clicking the active one returns to chat; a repo with only the
Understanding app shows just that button.
