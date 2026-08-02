## Context

The mechanics are all in place already — the change is wiring, not architecture:

- **Dock tabs are backend-owned and device-synced** (`GET/POST/PATCH/DELETE
  /api/dock`, `DockContext.jsx`): any tab created via the API shows up in every
  browser's DOCKS strip within one 10-second reconcile, and tab ids double as
  conversation keys.
- **The dashboard shows every synced tab** (default `dashboard !== false`), and
  **backend-started runs are auto-discovered**: `ChatContext.reconcile()` polls
  `GET /api/runs` every 5 s (fix-loop-conversation-identity, D6) and attaches the
  repo's dock to a loop-driven run — streaming its turns live with zero extra
  plumbing.
- **The arm pin**: driven loops arm pinned to a conversation session
  (`AutopilotController.Loop`, `SessionId` on the request; fallback = the repo's
  newest transcript, i.e. the seed turn).
- **What's missing**: `goal.mjs` never creates a dock tab (only `queue.mjs`'s
  `createTabWithStash` does), so a goal run has no dock to attach to; and neither
  scenario sets the tab's `sessionId`, so a freshly opened dock shows an empty
  conversation until the first engine send is discovered. `GET /api/runs` already
  returns `sessionId` per repo (`RunSessionService.cs:293`), and `seedTurn()`
  already returns that run object — the session id is on hand at exactly the
  right moment.
- Live teardown and keep-mode instructions already handle a dock tab
  (`liveTabId` in `lib.mjs` / `downLive`).

## Goals / Non-Goals

**Goals:**
- A live-mode eval run — goal or queue, started from the Tests tab or a terminal
  — always produces a visible agent dock for the fixture repo whose conversation
  is the one the loop drives.
- Opening that dock shows the seed turn immediately (bound session), then the
  loop's turns as they run.
- The Tests tab offers a one-click way to get to that dock while a run is
  active.

**Non-Goals:**
- No engine (`AutopilotService`) or dock-model changes; no new endpoints.
- No auto-navigation: the run does NOT yank the operator's browser to the dock
  on arm — a button is offered, the operator clicks it. (Start is often pressed
  on a phone mid-something-else; stealing focus is hostile.)
- Isolated mode gains the same tab creation for mode-blindness but no new
  assertions about it — nobody watches an isolated run.

## Decisions

**D1 — The suite creates and binds the dock tab; the harness stays untouched.**
The alternative (harness-side: LoopEvalRunService or the engine creates/binds a
tab when a loop arms) reimplements scenario knowledge in the harness and breaks
the ui-runner's founding rule that the committed suite is the single source of
truth. The suite already talks to `POST /api/dock` (queue scenario) and already
tracks/cleans `liveTabId`; goal.mjs simply joins in. `createTabWithStash` is
split into `createTab(repoId, repoName)` + the existing stash loop so goal.mjs
can create a stashless tab.

**D2 — Bind by seed session, explicitly, in this order: seed → create/patch tab
(sessionId = seed run's sessionId) → arm (SessionId = same id).** The seed
turn's completed run carries `sessionId` in `GET /api/runs` — no new surface
needed. Passing it explicitly on arm (instead of relying on the newest-transcript
fallback) makes tab, pin, and seed provably the same conversation and removes a
race with any other writer to the repo's transcript folder. Queue.mjs gets the
same PATCH + explicit arm pin.

**D3 — The watch button finds the dock client-side; the run snapshot is not
extended.** The runner UI already lives inside DockProvider; while a run is
active it looks up `tabs.find(t => /^loopeval-.*-live$/.test(t.repoName))` and
renders "▶ Watch its agent dock" → `setActiveTab(id)` + navigate to the chat
surface. Alternative — putting repoId/tabId into the run snapshot the service
streams — means the service parsing suite output or new coupling, for
information the browser already has in its synced dock list. Until the tab
appears (creation happens after preflight + seed, ~1–2 min in), the existing
passive hint text remains as the fallback state.

**D4 — Tab creation is mode-blind (both isolated and live).** Keeps goal.mjs
free of `if (live)` forks and keeps verdict counts identical across modes (the
live-mode design rule since add-loop-eval-live-mode). In isolated mode the tab
is just registry state in a throwaway datadir — torn down with the instance.

## Risks / Trade-offs

- [Seed run's `sessionId` missing/null on some path] → the PATCH is skipped with
  a warning `say()`, arm falls back to the newest-transcript pin exactly as
  today; the dock still attaches via run discovery on the first loop send. The
  binding is an upgrade, not a new hard dependency.
- [Regex-by-repoName lookup in the UI could match a stale tab] → live preflight
  already fails fast on leftover `loopeval-*-live` repos, so at most one such
  repo (and tab) exists during a run; teardown deletes the tab.
- [Goal fixture drift: an extra dock tab changes isolated-mode behavior] → a
  dock tab is inert registry state; the engine only reads stashes for queue
  loops. The eval's own assertions (audit outcomes, loop resolution) are
  unaffected — verified by running the isolated goal scenario once before
  shipping.

## Migration Plan

Suite + frontend change only; deploy via the normal branch → `swap.ps1` → user
verifies → keep → merge flow. No data or config migration. Rollback = the
dead-man switch or redeploying main.

## Open Questions

None.
