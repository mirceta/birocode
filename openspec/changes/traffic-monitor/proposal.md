# Traffic Monitor — proposal

## Why

The client runs many 5-second pollers (Dashboard snapshot, AccountChips, EventConsole,
FilesBrowser, UnderstandingPanel, DockIdentityRows, …), so the harness's HTTP volume
scales with every open tab and every added panel — and today nothing measures it. The
server has only a coarse manual request counter (`Logger.CountRequest()`); there is no
byte-counting or per-endpoint breakdown anywhere. The operator has no way to notice
"throughput is getting high" until something feels slow.

## What Changes

- New Kestrel middleware in the harness that counts **every** HTTP request and its
  request/response bytes automatically (no per-controller opt-in), aggregated in-memory
  per endpoint bucket (route shape, not raw URL — `/api/repos/{id}/events` is one bucket).
- Rolling time-window aggregation (e.g. last 60s / 5min / 1h buckets) so rates are
  readable as "bytes/sec now" and "requests/sec now", not lifetime totals.
- New API endpoint (`GET /api/traffic`) returning current rates, per-bucket top talkers,
  and window history for sparklines.
- New collapsible **Traffic panel** on the Dashboard (drag-layout citizen like
  Autopilot/AgentAudit), Advanced-mode by default per the UI-modes convention: shows
  total req/s and KB/s, a small trend sparkline, and the top-N endpoint buckets.
- A visible "high" signal: simple threshold (configurable, sensible default) that tints
  the panel/chip when sustained throughput crosses it — the "know when it's beginning
  to be high" ask.

## Capabilities

### New Capabilities
- `traffic-monitor`: server-side measurement of harness HTTP throughput (requests and
  bytes, per endpoint bucket, rolling windows) and its operator-facing surfaces (the
  `/api/traffic` endpoint and the Dashboard Traffic panel with a high-throughput signal).

### Modified Capabilities

(none — no existing spec's requirements change; `chat` and `files` are untouched)

## Impact

- **Server**: new middleware registered in `ClaudeWeb.App/Services/Hosting/EmbeddedApi.cs`
  pipeline; new module (`Services/Traffic/` + `AddTrafficModule()` line — the one shared-file
  edit, per `plans/INTEGRATION.md`); new auto-registered `Controllers/TrafficController.cs`.
- **Client**: new `TrafficPanel` dashboard component; `Dashboard.jsx` panel wiring
  (feature gate, summon state, dragKeys, rail chip, render block); `UiModeContext.jsx`
  capability map entry (`'advanced'`).
- **Self-referential load**: the panel itself polls `/api/traffic` — its own traffic is
  counted too, kept cheap (small JSON, dock cadence, poll only while visible).
- No persistence, no new dependencies, no breaking changes; counters are in-memory and
  reset on harness restart.
