## Why

Local-app discovery is expensive — every "Discover local apps" click spends a
full read-only **agent** scan of the repository — yet today its result is thrown
away the moment it stops being useful. `LocalAppDiscoveryJobs` holds only the
**most recent job per repo, in memory**: a harness restart drops it to "no recent
discovery", and each dock that wants the list has no choice but to re-run the
agent. The repository's set of local apps changes rarely (only when someone adds
a new app), so paying for a fresh agent scan on every load is wasteful. Finco
wants a **cache**: persist a completed discovery to disk and reuse it, while
keeping the agent scan available for when the repo actually gained new apps.

## What Changes

- **Write-through to disk on success.** When a discovery completes successfully,
  the harness serializes the typed report to a per-repo JSON cache file so it
  survives a harness restart. This is a harness-side write of a *separate* cache
  artifact — the agent scan itself stays strictly read-only over the scanned repo
  (the existing "discovery never mutates a scanned repo" requirement is
  preserved). The cache lives in the **harness's own data area, keyed by repo
  id**, NOT inside the scanned repository (see `design.md` — this is the one
  decision worth a look; it keeps the scanned repo's git tree clean and honours
  the read-only contract).
- **A cache-load path that never calls an agent.** A new read-only endpoint reads
  the caller's repo cache file and returns the same body shape as
  `GET /discover/status` (`status: done`, `apps`, timings) — with each app's live
  `running` flag recomputed at read time as usual — plus the age of the cache. If
  no cache exists for the repo it returns an explicit "no cache" state so the dock
  can tell the operator to run Discover first. It runs **no** agent scan.
- **A new "Load cache" button in the agent dock**, next to "Discover local apps".
  It loads the saved list from disk instantly; "Discover local apps" is unchanged
  and remains the way to **re-run the agent** when the repo may have gained new
  apps. Same Advanced-mode gating as the existing discover action.
- **A successful fresh discovery refreshes the cache**, so "Discover" then "Load
  cache" are consistent, and the newest agent result is what a later load returns.

## Capabilities

### New Capabilities
<!-- none — this extends the existing discover-local-apps capability -->

### Modified Capabilities
- `discover-local-apps`: a completed discovery is now **persisted to a per-repo
  on-disk cache** and reused. The capability gains a cache-load path (return the
  saved apps without running an agent) and a dock affordance to trigger it, while
  the agent scan remains the explicit way to rediscover. The read-only scan
  policy, the discovered-apps payload shape (`name`, `port`, `folder`,
  `evidence`, `startCommand`), the live `running` flag, and single-repo-per-call
  scoping are unchanged.

## Impact

- **Backend (`ClaudeWeb.App`)**:
  - `LocalAppDiscoveryJobs` — on `MarkDone`, write-through the report to the
    per-repo cache file (best-effort; a cache-write failure must not fail the
    discovery).
  - A small `LocalAppDiscoveryCache` service that owns the cache file location
    (harness data dir, keyed by repo id), serialization, load, and "no cache"
    signalling.
  - `LocalAppsController` — a new `GET /api/local-apps/cache` endpoint that loads
    from disk and returns the `JobBody`-shaped result (live `running` recomputed),
    or an explicit no-cache state. No agent, no repo mutation.
- **Frontend (`client/`)**: `PinnedAgent.jsx` gains a "Load cache" button beside
  the discover button that GETs the cache endpoint and populates the same
  discovery view (register / Run / Check rows work identically on cached apps);
  an i18n string in `en.json` + `tr.json`; the button is Advanced-mode per the
  UI-modes convention.
- **Understanding app**: refresh `understanding-app/index.html` to show the
  cache write-through + load-vs-rediscover flow (per the repo convention).
- **No breaking change**: `GET /api/local-apps/discover` and `/discover/status`
  keep their contract; the cache endpoint and the write-through are additive.

## Open coordination note

The `discover-local-apps-resilient` change is **still unarchived** and also
modifies the `discover-local-apps` capability. Both deltas are additive
(non-overlapping requirements), but they should be archived in order so the
living baseline folds cleanly. Flagged for the operator; not a blocker for
drafting or implementing this change.
