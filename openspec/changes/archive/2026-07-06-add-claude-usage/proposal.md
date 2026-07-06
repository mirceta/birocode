# Proposal: add-claude-usage

## Why

The dashboard's Claude chip (add-account-status) shows *who* the harness runs
as — installed, logged in, account, plan — but not *how much of the plan is
left*. The Operator only learns the weekly quota or the 5-hour window is
exhausted when an agent run stalls; the `claude /usage` panel has exactly this
data (weekly quota consumed + current 5-hour window) but only inside an
interactive CLI session, invisible from the phone. Surfacing it in the Claude
section turns "why did my agent stop?" into a glanceable answer and lets the
Operator pace work before hitting a limit.

## What Changes

- Extend the Claude section of the dashboard (the `AccountChips.jsx` Claude
  chip) with a **usage block**: current **5-hour window** utilization + reset
  time, and **weekly** utilization + reset time (per-model split when the API
  reports one, e.g. an Opus sub-limit).
- Add a backend probe for usage: a sibling of `ClaudeAccountService` that
  calls the same Anthropic OAuth usage endpoint the CLI's `/usage` panel uses,
  authenticated with the already-stored CLI OAuth token. There is **no CLI
  subcommand and no local cache file** with these numbers (verified on
  claude 2.1.200: `claude usage` doesn't exist; `~/.claude/stats-cache.json`
  holds activity counts, not quota), so driving/scraping the interactive
  `/usage` TUI is the only alternative and is rejected as fragile.
- **Convention boundary (flagged):** the claude-account-status spec says its
  probe "SHALL NOT read … the authentication token itself" — that stays true;
  the account probe is untouched. But fetching usage requires reading the
  stored OAuth access token **in memory** to present it to **Anthropic's own
  API** — the exact flow the CLI itself performs. The new `claude-usage`
  capability therefore defines its own explicit token boundary: the token MAY
  be read and used solely as a bearer credential toward Anthropic's usage
  endpoint; it SHALL never be logged, persisted elsewhere, or surfaced
  through any harness API response. This is the first harness code that
  touches the token value at all — called out for review.
- Usage refreshes on the dashboard's existing poll cadence, but the backend
  memoises with a longer TTL (minutes, not seconds) since quota moves slowly
  and the upstream call is a network round-trip; fail-soft like the account
  probe (endpoint change/outage degrades to "usage unavailable", never breaks
  the chip).

## Capabilities

### New Capabilities

- `claude-usage`: probing plan-usage limits (5-hour window + weekly quota,
  utilization % and reset times) via Anthropic's OAuth usage endpoint using
  the CLI's stored subscription token, and rendering them in the dashboard's
  Claude chip. Covers the endpoint contract, caching, fail-soft behavior, and
  the token-handling boundary.

### Modified Capabilities

- None. `claude-account-status` (still in flight in `add-account-status`) is
  not modified: its requirements govern the account probe and widget, which
  remain exactly as specified — that probe still never reads the token, and
  the chip never exposes it. The token-handling boundary for the usage fetch
  is a requirement of the new `claude-usage` capability instead.

## Impact

- **Backend:** new `ClaudeUsageService` (Services/Accounts), new
  `GET /api/claude-usage` endpoint (or an extension of `/api/claude-account`),
  wired in `EmbeddedApi.cs`. Reads `~/.claude/.credentials.json` (token, in
  memory only) — same file the account probe already parses for metadata.
- **Frontend:** `client/src/components/dashboard/AccountChips.jsx` +
  `accountChips.css` — usage rows/meters inside the expanded Claude chip;
  i18n keys in `en.json`/`tr.json`. Advanced-mode only, inheriting the chip's
  existing gate; no new capability-map entry needed unless we split the
  widget.
- **Dependencies:** one new outbound HTTPS call to Anthropic's usage endpoint
  (undocumented/CLI-internal — schema drift is a real risk, hence strict
  fail-soft + tolerant parsing).
- **Security surface:** the OAuth token is newly *read* by harness code; the
  design must keep it out of logs, error strings, and all API responses.
