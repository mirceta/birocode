# Design: import-discovery-findings

## Context

Findings can be produced outside the harness: the operator prompts another agent,
which replies with a JSON array of findings in the same shape the discovery agent
emits (`name`, `port`, `folder`, `evidence`, `startCommand`). Today the only cache
writer is a completed harness scan (`LocalAppDiscoveryCache.Save`, union-by-port).
The panel (`DiscoverAppsPanel.jsx` + `useLocalAppDiscovery.js`) already renders
cache snapshots and applies updated snapshots returned by cache edits (delete).

Two existing pieces make import cheap:

- `LocalAppExposureReport.Parse(json)` validates a report all-or-nothing (non-empty
  name/folder, port 1..65535; throws on any bad finding).
- `Save(repoId, report, at)` performs the union merge, stamps
  `DiscoveredAtByPort`, and returns the merged record.

## Goals / Non-Goals

**Goals:**
- Paste (or pick a `.json` file containing) a JSON array of findings in the panel
  and merge it into the current repo's cache with scan-identical union semantics.
- All-or-nothing validation: any malformed finding rejects the whole import and
  leaves cache + job state untouched.
- After import, cache loads, status reads, and Run/Check see the merged set.

**Non-Goals:**
- No probing/verification of imported ports beyond shape validation (`running` is
  computed live at render time anyway, like every other snapshot).
- No import of per-finding timestamps from the payload; import time is authoritative.
- No multi-repo or bulk import; the import targets the caller's repo like every
  other `/api/local-apps` endpoint.

## Decisions

- **D1 — Accept both a bare array and the report object.** Other agents hand back
  a raw `[ {...}, ... ]`; the harness's own contract is `{ "apps": [...] }`. The
  endpoint trims the body and, when it starts with `[`, wraps it as
  `{"apps": <body>}` before handing it to `LocalAppExposureReport.Parse`. One
  validator, one error surface (Parse's message is returned in the 400), no second
  schema to maintain. Duplicate ports inside one payload behave exactly as in a
  scan: first occurrence wins.
- **D2 — Merge by calling the existing `Save`.** `POST` handler calls
  `_cache.Save(repo.Id, report, DateTimeOffset.UtcNow)` — identical union
  semantics as a finishing scan (new ports added, matching ports replaced,
  unmatched kept), and each imported finding's `discoveredAt` becomes the import
  time. No new merge code. Note `Save`'s disk write stays best-effort by design
  (scan path requires it); for import the handler re-checks by `Load`ing after a
  failed-looking state is unnecessary — the merged record returned is applied to
  the in-memory job (D3) and returned to the panel either way, matching the scan's
  existing behavior when the disk is unwritable.
- **D3 — In-memory job update mirrors the cache-load path, but never clobbers a
  running scan.** When no scan is in flight, the handler seeds the job registry
  from the merged record (`SeedFromCache`) so status polls, Run-by-port, and Check
  immediately see the union. When a scan IS running, import writes the disk cache
  only and leaves the job alone: the scan's own completion calls `Save`, which
  loads the just-imported cache and unions on top — the imported findings surface
  when the scan finishes, and nothing races the running job.
- **D4 — Endpoint `POST /api/local-apps/cache/import`, raw JSON body, snapshot
  response.** Body read as a string (bounded, e.g. 1 MB) rather than model-bound,
  because the payload's shape is variable (D1) and Parse owns validation. On
  success it returns the same `CacheBody` snapshot as `GET /cache` / `DELETE
  /cache/{port}`, so the panel applies it without a second fetch. Errors: 400 with
  Parse's message (malformed), 404 no-repo — cache untouched in every error path.
  Emits a `cache` event to the Event Console ("imported N findings (M new)").
- **D5 — Panel UI: one Import affordance, textarea-first.** An Import button in
  the panel toggles an inline import area: a textarea for pasting, a file input
  whose chosen `.json` is read client-side (FileReader) into the same textarea,
  and a submit. Submit calls a new `importFindings(json)` action on
  `useLocalAppDiscovery`, which POSTs and applies the returned snapshot (same
  pattern as `deleteCached`). Per-import error text renders inside the import
  area; the findings list stays actionable. Advanced-mode via the existing
  `localAppDiscovery` capability — no new capability entry.

## Risks / Trade-offs

- [Imported findings are unverified — a wrong `startCommand` or folder comes from
  an outside agent] → Run already validates folder-inside-repo server-side and
  surfaces launch failures per row; `running` is always a live port check. Import
  adds no new execution path.
- [Import during a running scan is not visible until the scan ends (D3)] → The
  panel already shows the scan as running; the union on completion includes the
  import. Documented in the spec scenario.
- [Bare-array wrapping (D1) could mask a payload that is neither array nor object]
  → Parse still rejects it; the 400 carries the parse error verbatim.
