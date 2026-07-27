## Context

Discovery is backend-owned (`LocalAppDiscoveryJobs`) but **in-memory, latest-only
per repo** — a restart loses it and every dock re-runs a costly agent scan. This
change adds a durable per-repo cache and a cache-load path that skips the agent,
keeping the agent scan as the explicit "rediscover" action.

## Decision 1 — Where the cache file lives (the one that matters)

**Decision:** the cache lives in the **harness's own data directory, keyed by repo
id** (e.g. `<harness-data>/local-app-cache/<repoId>.json`), NOT inside the scanned
repository.

**Why:** the baseline capability guarantees *"no file in that repository is
created, edited, or deleted by the discovery"*. Even though the harness (not the
agent) would do the writing, dropping a JSON file into the scanned repo would
dirty the operator's git tree and blur that read-only contract. A harness-owned
store keeps the scanned repo pristine and makes per-repo keying explicit. The repo
id is already the stable key used throughout `LocalAppDiscoveryJobs` and the
controller.

**Alternative considered:** an in-repo `.claudeweb/local-apps.json`. Rejected as
default (git-tree noise, contract tension), but it is a small config swap if the
operator later wants the cache travelling with the repo — noted so the choice
isn't silently closed.

## Decision 2 — Cache shape and the live `running` flag

The cache stores the *typed report* (`apps[] { name, port, folder, evidence,
startCommand }`) plus the discovery finish time — i.e. everything except the
`running` flag. `running` is deliberately **not** cached: it is recomputed from a
live port check whenever the state is read (existing "report live running state"
requirement), so a stale cache never claims an app is up. Load reuses the
controller's existing `JobBody` projection so cached and live results are
byte-for-byte the same shape to the frontend.

## Decision 3 — Load is explicit, write-through is automatic

Write-through happens automatically on `MarkDone` (best-effort; a write failure is
swallowed so discovery never fails because of caching). Load is an explicit
operator action (the new button + `GET /api/local-apps/cache`), matching the
user's ask for a button rather than silently preferring cache on mount. Auto-load
on mount is a possible later refinement (design-noted, not built here).

## Decision 4 — Endpoint and "no cache" signal

`GET /api/local-apps/cache` returns the `JobBody`-shaped body on a hit (with
`running` recomputed and a `cachedAt`/age field), and an explicit `status:
"no-cache"` (distinct from `idle` and from a successful empty `done`) on a miss so
the dock can say "run Discover first" rather than showing an empty list.

## Risks / trade-offs

- **Staleness:** a cache can lag reality (new app added, app folder moved). Handled
  by keeping "Discover local apps" one click away and surfacing the cache age.
- **Cross-repo leakage:** avoided by keying strictly on repo id and never falling
  back to another repo's file.
- **Coordination:** `discover-local-apps-resilient` is unarchived and also edits
  this capability; deltas are additive but should archive in order (flagged in the
  proposal).
