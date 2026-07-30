# Proposal: local-apps-cache-export-import

## Why

The dock's "Discover local apps" feature works well, but its cache is per-machine
(`%APPDATA%\ClaudeWeb\local-app-cache\<repoId>.json`). Moving the findings to
another machine today means finding that file on disk by hand. The panel already
has an **Import** action (paste JSON / pick a file → `POST /api/local-apps/cache/import`),
but there is **no matching Export**: nothing in the UI shows the current cache as
JSON or copies it to the clipboard. Adding an export view closes the loop: copy on
machine A (Ctrl+C), paste into the same panel's Import on machine B.

## What Changes

- The Local apps panel (`DiscoverAppsPanel`) gets an **Export** action alongside
  Load cache / Check / Import: it shows the current cache as formatted JSON and
  offers one-click **Copy** to the clipboard.
- The exported JSON is exactly the shape `ParseImport` accepts
  (`{ "apps": [ { name, port, folder, evidence, startCommand } ] }`), so an
  export from one machine round-trips through Import on another with no editing.
- Export is client-side: the panel already holds the findings from
  `GET /api/local-apps/cache` / discover status; no new backend endpoint is
  needed. Copy uses the existing `copyText` helper (secure-context clipboard API
  with hidden-textarea fallback), with the JSON visible in a read-only textarea
  as the manual-select fallback for plain-HTTP phones.
- No change to import, discovery, merge semantics, or the cache file format.

## Capabilities

### New Capabilities

- `local-app-discovery`: seed spec for the discover-local-apps panel, covering
  the new export requirement (view cache as import-compatible JSON, copy to
  clipboard) and the existing import round-trip contract it pairs with.
  (Seed-and-grow: this capability has no baseline spec yet.)

### Modified Capabilities

_None — `chat`, `files`, and `autopilot-loops` are untouched._

## Impact

- **Frontend only**: `client/src/components/dashboard/DiscoverAppsPanel.jsx`
  (new Export section), `client/src/lib/copyText.js` (reused, not changed),
  `client/src/i18n/en.json` + `tr.json` (new keys),
  `client/src/pages/dashboard.css` (minor styles).
- **Backend**: none (`GET /api/local-apps/cache` already returns the findings).
- **UI modes**: the panel is already gated behind the `localAppDiscovery`
  Advanced-mode feature; Export inherits that gate, no new capability-map entry.
- **Tests**: a round-trip check that the exported shape parses via
  `LocalAppExposureReport.ParseImport` (guards against the projection drifting
  from the import contract).
