## Context

The operator runs agents on five machines; each runs a birocode harness whose
outbound event feed (`harness-event-feed`) this harness's collector
(`event-feed-collector`, `api/collector/sources` + `api/collector/events`)
already polls, including the split refusal taxonomy (ip-blocked /
needs-credential / bad-credential / throttled). The events-app precedent shows
the serving pattern: a build-less SPA in a folder at the repo root, served by
a dedicated service (`EventsApp.cs`) through `LocalProxyController` under a
fixed app id. GitHub auth exists via the `github-credentials` capability and
the `gh`-authenticated PAT on the box. The third monitor is small and viewed
from a distance: the design target is a *wallboard*, not an app.

Research consensus this design encodes (mission-control pattern): per-device
cards; awaiting-input is the attention queue and outranks everything; the
board must be readable without interaction; alert-first ordering; red/green
CI wallboard for repos.

## Goals / Non-Goals

**Goals:**
- One full-screen browser window that answers, from across the desk: who's
  working, who's blocked on me, what's red on GitHub.
- Zero interaction required; the board reorders itself (attention items first).
- Reuse: collector state as-is, github-credentials as-is, and the events-app's
  folder + serving service as-is (the board is a new file in it, not a new
  app).

**Non-Goals:**
- Not a control surface — read-only in v1 (no approve/dismiss/retry buttons).
- No changes to the harness feed schema (per-agent awaiting-input, current
  task, context % are a follow-up change to `harness-event-feed` +
  `event-feed-collector`).
- No usage/burn-rate panel in v1 (needs per-machine JSONL access — separate
  change).
- Not a phone surface; it targets a landscape monitor. (It still ships through
  the normal proxy path, so it *works* anywhere.)

## Decisions

1. **Serve as a sibling page inside the existing events-app
   (`events-app/board.html`)** — over a second build-less app folder with its
   own serving service, a React-client tab, or a standalone product repo.
   Rationale: `EventsApp.cs` already serves *every* file in `events-app/`
   (build-less, no-store), and the events-app is already the multi-machine
   surface — it renders the collector's source cards with the refusal
   taxonomy. A sibling page gets the wallboard served with **zero new serving
   code** and keeps one app-folder convention instead of two. The board stays
   a *separate page* from the feed log, never merged into it: the log is
   interactive and chronological, the wallboard is zero-interaction and
   alert-first — one page cannot honor both. A standalone repo (à la
   youtube-transcript) would drag in a second server + registration for what
   is fundamentally a harness view.
2. **One aggregation endpoint, `GET api/status-monitor/board`** returning the
   whole board model (fleet, attention, github) in a single JSON document —
   over the SPA fanning out to collector + GitHub itself. Rationale: the board
   polls every few seconds; one endpoint keeps ordering/derivation logic
   (what counts as "needs attention", staleness math) server-side and testable,
   and the SPA stays a dumb renderer (same philosophy as the youtube-transcript
   "backend is the state machine" rule).
3. **GitHub polling server-side with a dedicated `GitHubStatusService`**,
   cached (~60s TTL) — over client-side calls. Rationale: rate limits are
   respected in one place, the PAT never reaches the browser, and the board
   endpoint stays one round-trip. **Repo list = derived from the registered
   Repos' git remotes** (parse each registered repo's `origin` →
   `owner/name`, dedupe; skip repos with no GitHub remote) — over a settings
   list or org discovery. The board then automatically tracks what the
   operator actually works on, with API cost still bounded by the registry's
   size. (Operator decision, 2026-07-03.)
4. **Attention queue is derived, not stored**: refusal-state sources (blocked
   on the operator by definition) + dark sources in v1. The queue is a
   *projection* of collector state, so the follow-up feed enrichment
   (awaiting-input agents) slots in as more rows, not a schema change to this
   surface.
5. **Staleness comes from the collector's existing per-source state** —
   `Alive` / `Status` / `lastPolledAt` on `GET /api/collector/sources` (code
   audit confirmed these exist; the poller maintains them). One nuance:
   `lastPolledAt` marks the last *attempt*, not the last success, so "dark
   for N minutes" is computed by the board service tracking state-transition
   times in memory. In-memory is acceptable for a wallboard: after a harness
   restart a dark source shows "unreachable, duration unknown" until the next
   transition. No collector change. (Operator decision, 2026-07-03.)
5. **Wallboard presentation is a spec'd requirement, not styling taste**:
   dark, high-contrast, largest text for attention items, alert-first
   ordering, auto-refresh without flicker (poll + diff-render), and an
   explicit staleness banner when the board itself can't reach the harness —
   a wallboard that silently freezes is worse than none.

## Risks / Trade-offs

- [GitHub rate limits with many repos] → explicit repo list, 60s cache,
  conditional requests (ETag) if needed.
- [Board trusted blindly while frozen] → visible "last updated" clock +
  full-bleed staleness banner when polls fail (mirrors dashboard-host-clock
  lesson).
- [Feed doesn't yet carry per-agent awaiting-input] → v1 attention queue is
  source-level only; set expectations in the UI ("machine blocked", not
  "agent asks: …") until the follow-up change lands.
- [Events-app identity widens from "feed viewer" to "fleet app" — the board
  page brings GitHub data into an app named after events] → accepted; the two
  pages keep distinct jobs (log vs. wallboard), and renaming the app id is a
  cosmetic follow-up if it ever grates.
- [Feed-log UI changes could accidentally break the always-on board] → they
  can't share page-level code: `board.html` is self-contained, sharing only
  the folder and the serving contract with `index.html`.

## Open Questions

- Sound/notification on new attention items: events-app has a sound endpoint —
  reuse or keep the wallboard silent. Operator: doesn't matter for now, decide
  later; v1 ships silent. (The other two original questions — repo list and
  staleness source — were resolved into Decisions 3 and 5.)
