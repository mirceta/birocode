# Design: add-claude-usage

## Context

The Claude chip (`AccountChips.jsx` + `ClaudeAccountService`) shows identity
(installed / authenticated / account / plan) by *reading* the CLI's persisted
login files — deliberately never touching the token. Usage numbers (weekly
quota, 5-hour window) exist nowhere on disk; the CLI's `/usage` panel fetches
them live from Anthropic's OAuth usage endpoint. Verified on this machine
(claude 2.1.200, 2026-07-06): `GET https://api.anthropic.com/api/oauth/usage`
with `Authorization: Bearer <accessToken from ~/.claude/.credentials.json>`
and `anthropic-beta: oauth-2025-04-20` returns `200` with:

- `limits[]` — the generalized list; each entry:
  `{ kind: "session" | "weekly_all" | "weekly_scoped", group, percent,
     severity: "normal" | …, resets_at, scope?: { model: { display_name } },
     is_active }`. The scoped entry carries the per-model weekly cap (observed:
  "Fable" at 54% while weekly_all was 28%).
- `five_hour` / `seven_day` — legacy convenience mirrors
  `{ utilization, resets_at }` of the session/weekly_all entries.
- `extra_usage`, `spend`, plus a tail of nullable experimental fields that
  visibly churn (`tangelo`, `nimbus_quill`, …) — confirmation that this is a
  **CLI-internal, undocumented** endpoint whose schema drifts.

## Goals / Non-Goals

**Goals:**
- Weekly quota + 5-hour window (percent, reset time, severity; per-model
  scoped weekly rows when present) inside the existing Claude chip.
- Zero regression to the identity probe: usage failing (offline, 401, schema
  drift) must leave the chip's existing content intact.
- Token stays un-loggable and un-surfaceable: read → header → discard.

**Non-Goals:**
- No spend/extra-usage purchasing surface (render at most a severity hint).
- No historical usage tracking/charting; this is a live gauge only.
- No second UI surface (settings page, per-agent view) — chip only.
- Not replacing the identity probe's file-based approach with API calls.

## Decisions

1. **Data source: the OAuth usage endpoint, not TUI scraping.**
   No `claude usage` subcommand exists; `stats-cache.json` has activity
   counts, not quota. Driving the interactive `/usage` panel through a PTY on
   Windows and scraping ANSI output is the only alternative and is rejected
   as fragile and slow. The endpoint is what the panel itself uses.

2. **Parse `limits[]` first, legacy fields as fallback.** `limits[]` is the
   generalized shape (it alone carries model-scoped weekly rows and
   `severity`). If absent, fall back to `five_hour`/`seven_day`. Everything
   is optional-tolerant: unknown `kind`s are passed through with their
   `group`/`percent`/`resets_at` untouched; unknown top-level fields ignored.

3. **Separate `ClaudeUsageService` + separate `GET /api/claude-usage`.**
   Not merged into `/api/claude-account`: the account probe is a cheap local
   file read on a 5 s TTL; usage is a network round-trip on a minutes TTL and
   can fail independently. Separate endpoints keep both cadences and failure
   modes honest. The frontend joins them in the chip.

4. **Token handling boundary (the convention relaxation).** The service reads
   `claudeAiOauth.accessToken` from `~/.claude/.credentials.json` into a
   local, sends it as the bearer header to `api.anthropic.com` only, and
   discards it. Hard rules: never assign it to a field, never include it in
   logs or error strings (log status codes and exception *types* only), never
   echo it through any harness API. `/api/claude-usage`'s response is built
   exclusively from the parsed usage numbers.

5. **Caching: 5-minute TTL + single-flight, serve-stale-on-error.** Quota
   moves slowly; the dashboard polls every few seconds. Memoise like
   `ClaudeAccountService` (same lock pattern) with `CacheTtl = 5 min`, one
   in-flight upstream call max, and on upstream failure return the last good
   payload marked `stale: true` (or `available: false` if never fetched).

6. **Response contract (camelCase, fail-soft `200` always):**
   `{ available, stale, fetchedAt, session: { percent, resetsAt, severity },
      weekly: { percent, resetsAt, severity },
      scopedWeekly: [ { label, percent, resetsAt, severity } ], error? }`
   `session` ≙ kind "session", `weekly` ≙ "weekly_all", `scopedWeekly` from
   "weekly_scoped" entries (label = `scope.model.display_name`, fallback
   "Model"). Any missing piece is null — the UI renders what exists.

7. **UI: usage rows inside the expanded Claude chip.** Collapsed chip is
   untouched (identity dot + account). Expanded, below plan: up to three
   compact meter rows — "5h", "Week", and one per scoped entry — each a small
   percent bar + reset time ("resets 15:50"). Severity ≠ normal tints the row
   (reuse existing chip warn/err styles). `available:false` renders a single
   muted "usage unavailable" line. No new UiMode capability entry — it rides
   the chip's existing Advanced-mode gate.

## Risks / Trade-offs

- [Undocumented endpoint drifts or vanishes] → tolerant parsing + fail-soft
  `available:false`; the chip's identity content never depends on it. A
  schema change degrades to "usage unavailable", not an exception.
- [Token exposure through logs/errors] → the boundary in Decision 4 is a spec
  requirement with a scenario; code review gate: no token value ever leaves
  the probe method.
- [Endpoint requires the `anthropic-beta` header value to change someday] →
  header value kept as a single constant next to the URL.
- [401 when the session expired mid-TTL] → treat as `available:false` with
  reason "session expired"; the account probe independently flips the chip to
  not-authenticated on its own cadence.
- [Rate/abuse concerns calling an internal endpoint] → 5-min TTL +
  single-flight means ≤ 12 calls/hour per harness, far below the CLI's own
  panel usage pattern.

## Open Questions

- None blocking. (Whether to also show `extra_usage`/spend when enabled is
  deferred until an account actually has it enabled — the fields were null on
  the probe machine.)
