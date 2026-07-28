# Design: discover-apps-panel

## Context

Discover Local Apps grew feature-by-feature inside the agent dock
(`client/src/components/dashboard/PinnedAgent.jsx`): a Discover button, a Load cache
button, and an inline findings list with per-row register / Run / Check. On a repo with
many apps the list eats the dock. Backend-side, `LocalAppDiscoveryCache.Save`
(`ClaudeWeb.App/Services/StructuredAsk/LocalAppDiscoveryCache.cs`) overwrites the
per-repo cache file wholesale on every successful scan, so a later partial scan (agents
routinely miss apps and get re-run) erases previously found apps, and the operator has
no way to curate the cache.

Constraints: the discovery agent, its read-only tool policy, and the structured-ask
mechanism stay untouched — this change is harness UI + cache semantics only. The cache
stays in the harness data dir keyed by repo id (read-only-scan guarantee, prior change's
D1). New UI is Advanced-mode per the UI-modes convention.

## Goals / Non-Goals

**Goals:**
- Dock footprint shrinks to exactly two buttons: run discovery, open panel.
- A panel, opened as an overlay on the agent dock, hosts everything else: findings with
  the existing per-row affordances, discovery job state, cache state and age.
- Cache save becomes union-by-port so repeated partial scans accumulate.
- The operator can delete a single cached record from the panel.

**Non-Goals:**
- No change to the agent prompt, scan policy, or validating parse.
- No manual import endpoint for hand-assembled findings (union-by-scan covers the
  accumulation need; import can be a later change).
- No in-place editing of a record's fields (name/port/command) — delete only.
- No cross-repo panel; the panel is per-dock, same as discovery itself.

## Decisions

### D1 — Panel is a dock overlay component, not a route or global modal

A new `DiscoverAppsPanel.jsx` renders as an absolutely-positioned overlay inside the
dock container, the same containment pattern the dock already uses for its file/console
views. Rationale: discovery is per-dock (per-repo) state; an overlay keeps the repo
context implicit and needs no routing. The existing discovery state, polling, and
actions in `PinnedAgent.jsx` move into a shared hook (`useLocalAppDiscovery`) so the
dock buttons (spinner on the Discover button) and the panel render from one state — no
duplicated polling. Alternative considered: a dashboard-level modal — rejected because
it would need explicit repo plumbing and breaks the "everything about this dock's repo
lives in the dock" model.

### D2 — Dock keeps two independent buttons

"Discover" starts the scan (button shows the running state); "Local apps" opens the
panel. Clicking Discover does NOT auto-open the panel — the user asked for one button
per function, and a scan takes minutes, so the natural flow is: kick it off, come back
via the panel. The panel is also openable while a scan runs and shows the job state.
The inline findings list and the Load cache button leave the dock entirely.

### D3 — Union merge lives in `LocalAppDiscoveryCache.Save`, keyed by port

`Save` loads the existing cache, merges, and writes: findings from the new scan win
per-port; previously cached ports the scan missed are kept. Port is the key because it
is already the identity everywhere else (register dedup, Run-by-port, running checks).
`Save` returns the merged report, and `LocalAppDiscoveryJobs` stores that merged report
as the job result (`MarkDone(merged)`), so the status endpoint, Run-by-port resolution,
and running checks all see the union — otherwise Run would fail for a cached app the
latest scan missed. Alternative considered: merging at read time (keep raw per-scan
files) — rejected: every reader would need the merge logic and the file stops being the
truth.

### D4 — Per-finding `discoveredAt`, backward-compatible cache file

With union, "the cache's age" is no longer one number: rows can come from different
scans. Each cached finding gains a `discoveredAt` timestamp (set to its scan's finish
time when merged); the top-level `CachedAt` stays as "latest successful scan" for the
existing header line. Old cache files (no per-finding timestamp) load fine: absent
`discoveredAt` defaults to the file's `CachedAt`. The panel shows per-row age so the
operator can spot stale records worth deleting.

### D5 — Delete is a harness endpoint that edits cache AND in-memory job

`DELETE /api/local-apps/cache/{port}` (repo from the current-repo context, same as the
sibling endpoints) removes the matching finding from the cache file and, if an
in-memory job holds a result for that repo, from the job result too — so a deleted
record cannot be relaunched via Run or resurface on the next status poll. Deleting the
last record leaves a valid cached-empty file (distinct from "no cache", matching the
existing empty-list semantics). Errors are explicit: no cache / port not found. The
response returns the updated snapshot so the panel re-renders without a second fetch.

### D6 — Union makes removal explicit (BREAKING semantics change)

Previously a rescan implicitly dropped disappeared apps; under union they persist until
deleted. This is deliberate: implicit drop is exactly the data loss the change fixes,
and the panel's per-row delete is the new, explicit removal path. The delta spec
rewrites the persistence requirement accordingly.

## Risks / Trade-offs

- [Stale records accumulate — an app deleted from the repo stays cached forever] →
  per-row `discoveredAt` age makes staleness visible; per-row delete removes it; a row
  whose folder no longer exists still fails loudly on Run (spawn fails) rather than
  silently.
- [Two different apps reuse one port across scans] → union keeps the newer finding for
  that port, which is the correct "latest truth" for the port-keyed model.
- [Splitting dock state into a shared hook regresses the dock's existing
  reattach/polling behavior] → the hook is a mechanical extraction of state that
  already lives in `PinnedAgent.jsx`; verify with the browser-testing doc's headless
  Playwright pass before claiming done.
- [Old cache files after upgrade] → loader defaults missing `discoveredAt` from
  `CachedAt`; no migration step needed.

## Open Questions

- None blocking. (Panel visual layout — list density, where job state sits — is
  implementer's discretion within the existing dashboard CSS language.)
