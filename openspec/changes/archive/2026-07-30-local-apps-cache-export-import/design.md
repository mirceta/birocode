# Design: local-apps-cache-export-import

## Context

The dock's Local apps panel (`client/src/components/dashboard/DiscoverAppsPanel.jsx`)
already has three actions — Load cache, Check, Import — driven by
`useLocalAppDiscovery.js`. The findings live in the hook's `discovery.apps` state,
populated from `GET /api/local-apps/cache` (or a completed discover job). Each
finding is `{ name, port, folder, evidence, startCommand, running, discoveredAt }`,
where `running` and `discoveredAt` are server-side projections
(`LocalAppsController.CacheBody`), not part of the on-disk finding model.

Import (`POST /api/local-apps/cache/import`) parses with
`LocalAppExposureReport.ParseImport`, which accepts `{ "apps": [...] }` or a bare
array of findings with fields `name, port, folder, evidence, startCommand`, and
union-merges by port into the cache. The clipboard helper `client/src/lib/copyText.js`
(secure-context API + hidden-textarea fallback) and the copied-state UI pattern in
`CopyPath.jsx` already exist.

## Goals / Non-Goals

**Goals:**
- One-click view of the current cache as JSON inside the Local apps panel.
- One-click copy to clipboard, with a manual-select fallback that works on
  plain-HTTP phone browsers (no secure clipboard context).
- Exported JSON is byte-for-byte importable via the existing Import action on
  another machine (round-trip guarantee).

**Non-Goals:**
- No new backend endpoint (the client already has the findings).
- No file download (clipboard copy is the requested transport; the Import side
  already accepts pasted text — file download can be added later if needed).
- No changes to import, discovery, merge semantics, or the on-disk cache format.
- No transfer of per-port `discoveredAt` timestamps: the on-disk sidecar
  (`DiscoveredAtByPort`) is deliberately not part of the finding model, and
  `ParseImport` has no way to carry it. Imported findings get fresh timestamps
  on the target machine, same as today's import.

## Decisions

1. **Client-side export, no new API.**
   `GET /api/local-apps/cache` already returns everything exportable. A dedicated
   `GET /api/local-apps/cache/export` endpoint would duplicate that response minus
   two fields — strip the two fields in the client instead.
   *Alternative considered*: serving the raw cache file from the backend — rejected
   because the on-disk `CachedDiscovery` wrapper (PascalCase `Report`/`CachedAt`/
   `DiscoveredAtByPort`) is NOT what `ParseImport` accepts, so it would break the
   round-trip promise.

2. **Export shape = import shape.**
   Serialize exactly `{ "apps": [ { name, port, folder, evidence, startCommand } ] }`,
   pretty-printed (`JSON.stringify(..., null, 2)`). Strip `running` and
   `discoveredAt` from the projection: `running` is a live probe result and
   `discoveredAt` is machine-local. `System.Text.Json` would ignore unknown fields
   on import, but exporting only contract fields keeps the payload honest and
   stable. Omit `startCommand` key when null (import treats missing and `""` alike).

3. **UI: Export toggles a read-only textarea + Copy button, mirroring Import.**
   A fourth header button `📤 Export` toggles an export section styled like the
   existing import section: a read-only textarea holding the JSON and a Copy
   button using `copyText()` with the `CopyPath.jsx` copied-state pattern
   (✓ swap, brief revert). The visible textarea doubles as the manual fallback:
   if `copyText` returns false, the panel selects the textarea content and shows
   a "copy manually" hint instead of an error. Export and Import sections are
   mutually exclusive toggles (opening one closes the other) to keep the small
   dock overlay usable.
   *Alternative considered*: copy-only button without showing the JSON — rejected;
   seeing the payload is the "view current state of the cache" half of the ask and
   is the only reliable path on insecure contexts.

4. **Export reflects the panel's current findings list** (`discovery.apps`), i.e.
   cache after any in-session discover/delete — the same list the user sees as
   rows. If the list is empty (no cache), the Export button is disabled.

5. **Round-trip regression test on the backend.**
   Add a test in `tests/ClaudeWeb.Tests` feeding a client-shaped export payload
   (including the null-`startCommand` case) through
   `LocalAppExposureReport.ParseImport` to pin the contract. Frontend behavior is
   verified with the repo's Playwright headless flow per
   `docs/claude-web/browser-testing.md`.

## Risks / Trade-offs

- [Clipboard API unavailable on plain-HTTP phones] → `copyText`'s `execCommand`
  fallback, then visible-textarea manual select as the final fallback; the JSON
  is always visible so the feature degrades to select-all + Ctrl+C, which is the
  user's stated workflow anyway.
- [Projection drift: a future field added to `CacheBody` but not to the export
  whitelist silently stops round-tripping it] → the export builds from an explicit
  field whitelist next to a comment pointing at `LocalAppFinding`; the round-trip
  test pins the current contract.
- [Large caches in a small dock overlay] → textarea is capped-height and scrollable
  (same as import's); payloads are tiny in practice (a handful of findings).

## Migration Plan

Frontend-only change; ships with the normal branch deploy (`swap.ps1`), no data
migration. Rollback = rollback the build; the cache file is untouched.

## Open Questions

- None blocking. (If the user later wants file-based transfer, `apiGetBlob` +
  object-URL download is the established pattern — out of scope here.)
