# Per-project Basic/Advanced visibility

> **Status (2026-06-11):** In progress on branch `feature/project-visibility`.

## Why

The Projects tab is now visible in Basic mode (see `plans/projects-tab.md`),
but every registered project was listed there. The End User wants Basic mode
to be a curated view: projects are **advanced-only by default** and only the
ones explicitly promoted to **basic** appear for Basic-mode devices.

## What

- Each project carries a server-side `visibility`: `"basic"` (listed in both
  modes) or `"advanced"` (listed in Advanced mode only). Stored per repo in
  `%APPDATA%\ClaudeWeb\repositories.json`; entries without the field (all
  pre-existing projects) default to `"advanced"`.
- The Projects list filters client-side: Basic mode shows only `basic`
  projects; Advanced shows all.
- In Advanced mode each project card gets a pill toggle (`Basic` /
  `Advanced only`) that flips the visibility via
  `POST /api/repos/{id}/visibility`. Basic mode has no toggle.
- New projects are stamped with the creating device's mode: created in Basic
  mode → `basic`, created in Advanced mode → `advanced` (user-specified rule).
- A Basic device whose active project is advanced-only keeps it selected
  (chat and chip still work) — it just isn't listed to switch back to.
- Empty Basic list shows a hint (`projects.noneBasic`).

## How

- `Models/RepositoryConfig.cs` — `Visibility` property, default `"advanced"`.
- `Services/Repositories/RepositoryRegistry.cs` — `Visibility` on
  `RepositoryInfo`, `NormalizeVisibility` (anything but `basic` →
  `advanced`), `Add(path, name, visibility)`, `SetVisibility(id, visibility)`.
- `Controllers/RepoController.cs` — `visibility` in list/add payloads;
  `POST /api/repos/{id}/visibility` `{ visibility }`.
- `client/src/pages/Projects.jsx` — mode filter, toggle pill
  (`.project-card__vis`), stamps `visibility` on add.
- i18n: `projects.visBasic|visAdvanced|visToggleHint|visError|noneBasic`.

## Verification

`.claudeweb-preview/playwright/verify-project-visibility.mjs` on the :5201
preview. NOTE: the preview shares `%APPDATA%\ClaudeWeb\repositories.json`
with live — the test must restore any visibility it flips and remove any
project it creates (registry entry + created folder).
