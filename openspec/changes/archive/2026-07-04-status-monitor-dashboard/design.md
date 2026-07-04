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

1. **Render on the events-app primary page, with a display mode — no separate
   board page.** (REVERSED 2026-07-03: the first cut shipped `board.html` as a
   separate sibling page on the "log vs wallboard" argument; the operator,
   seeing it live, ruled the split artificial — the Sources panel already IS
   fleet administration, so the board duplicated the fleet one click away.)
   The primary page gains the attention strip, per-source agent status, and
   GitHub tiles; a URL-flagged **display mode** (`?display=1`) hides the admin
   form, action buttons, and merged log and enlarges the status sections —
   preserving the wallboard rules (zero interaction, alert-first, readable
   across the desk) *within* the single page instead of via a second one. One
   page, one data path; `board.html` is deleted.
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
5. **Running agents come from `turn.start`/`turn.ended` pairing.** The feed
   gains `turn.start` published at the same single chokepoint style as
   `turn.ended` (best-effort, never disrupts the run), carrying a fresh
   `turnId` that `turn.ended` echoes. The status-monitor projection derives
   "agents running now" per source = `turn.start` events in the collector's
   retained aggregate with no matching `turn.ended` (paired by `turnId`),
   guarded by a max-age cutoff so a trimmed or lost `turn.ended` cannot pin a
   ghost agent forever. Derivation lives in `StatusBoardService` (a
   projection), NOT in the collector — the collector stays a dumb aggregator
   and needs no spec change. Known bounds, accepted for v1: the merged
   aggregate is capped (very old `turn.start`s trim away → long runs undercount)
   and old-build remotes emit no `turn.start` (their cards show no agents).
6. **Staleness comes from the collector's existing per-source state** —
   `Alive` / `Status` / `lastPolledAt` on `GET /api/collector/sources` (code
   audit confirmed these exist; the poller maintains them). One nuance:
   `lastPolledAt` marks the last *attempt*, not the last success, so "dark
   for N minutes" is computed by the board service tracking state-transition
   times in memory. In-memory is acceptable for a wallboard: after a harness
   restart a dark source shows "unreachable, duration unknown" until the next
   transition. No collector change. (Operator decision, 2026-07-03.)
7. **Display-mode presentation is a spec'd requirement, not styling taste**:
   in `?display=1` every interactive element is hidden, attention items get
   the largest text, ordering is alert-first, refresh is flicker-free
   (poll + diff-render), and a staleness banner appears when the page can't
   reach the harness — a status display that silently freezes is worse than
   none.

## Risks / Trade-offs

- [GitHub rate limits with many repos] → explicit repo list, 60s cache,
  conditional requests (ETag) if needed.
- [Board trusted blindly while frozen] → visible "last updated" clock +
  full-bleed staleness banner when polls fail (mirrors dashboard-host-clock
  lesson).
- [Feed doesn't yet carry awaiting-input] → the attention queue is
  source-level plus running-agent presence; "agent asks: …" rows await the
  follow-up change.
- [Events-app identity widens from "feed viewer" to "fleet mission control"]
  → accepted and now deliberate (operator decision): one page administers the
  fleet and shows its status; renaming the app id is a cosmetic follow-up.
- [Everything on one page risks the wallboard rules eroding] → the display
  mode is spec'd, not styling: `?display=1` MUST hide every interactive
  element and enlarge attention/fleet/GitHub; the display-mode variant is the
  thing on the third monitor.
- [Ghost "running" agents if turn.ended is trimmed/lost] → turnId pairing +
  max-age cutoff; an unmatched start older than the cutoff is dropped from
  the count.

## Open Questions

- Sound/notification on new attention items: events-app has a sound endpoint —
  reuse or keep the status rendering silent. Operator: doesn't matter for now,
  decide later; v1 ships silent. (The other two original questions — repo list
  and staleness source — were resolved into Decisions 3 and 6.)
