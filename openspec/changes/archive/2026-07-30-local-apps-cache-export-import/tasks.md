# Tasks: local-apps-cache-export-import

## 1. Export logic (frontend)

- [x] 1.1 Add an export builder in `DiscoverAppsPanel.jsx` (or a small helper
      module): map `discovery.apps` to `{ apps: [{ name, port, folder,
      evidence, startCommand }] }` with an explicit field whitelist (drop
      `running` / `discoveredAt`, omit `startCommand` when null) and
      `JSON.stringify(..., null, 2)`.

## 2. Panel UI

- [x] 2.1 Add an `📤 Export` header button next to Load cache / Check / Import
      in `DiscoverAppsPanel.jsx`; disabled when there are no findings; toggles
      an export section and closes the import section (and vice versa).
- [x] 2.2 Render the export section: read-only, capped-height scrollable
      textarea with the JSON, plus a Copy button using `copyText()` with the
      `CopyPath.jsx` copied-state pattern (✓ + transient confirmation).
- [x] 2.3 On `copyText()` returning false, select the textarea content and show
      a "copy manually (Ctrl+C)" hint instead of an error state.
- [x] 2.4 Add i18n keys to `client/src/i18n/en.json` and `tr.json`; add any
      needed `.phone__discover*` styles in `client/src/pages/dashboard.css`.

## 3. Round-trip guarantee

- [x] 3.1 Add a backend test in `tests/ClaudeWeb.Tests` that feeds a
      client-shaped export payload (including a finding with no
      `startCommand`) through `LocalAppExposureReport.ParseImport` and asserts
      all findings parse — pinning the export/import contract.

## 4. Verify

- [x] 4.1 `npm --prefix client run build` and `dotnet test` pass.
- [x] 4.2 Headless Playwright check per `docs/claude-web/browser-testing.md`:
      open the dock's Local apps panel on the isolated :5200 preview, Export
      shows import-shaped JSON, Copy confirms, and pasting the exported text
      into Import succeeds (round-trip on one machine).
