# Traffic Monitor — design

## Context

The harness (Kestrel inside `EmbeddedApi.cs`) serves the SPA, `/api/*`, and the
localview/preview proxies. The client polls many endpoints at a 5s cadence, so total
throughput grows with open tabs/panels and is invisible today: the only instrumentation
is `Logger.CountRequest()` (manual, per-controller, count-only). Middleware order today:
IpFilter → static files → no-store shim → routing → CORS → PasswordAuth → controllers.

## Goals / Non-Goals

**Goals:**
- Count every request and its request/response bytes automatically, with zero
  per-controller opt-in.
- Per-endpoint-bucket attribution (route shape, not raw URL) so the operator sees *which*
  pollers dominate.
- Rolling rates (req/s, bytes/s) over short windows, with enough history for a sparkline.
- An operator-facing Dashboard panel with a clear "this is getting high" signal.

**Non-Goals:**
- No persistence across restarts, no time-series database, no export.
- No per-client/per-IP attribution (single-operator tool; can be added later).
- No throttling/rate-limiting — measure only.
- Not a Product/preview-port monitor: only traffic the harness itself serves (the
  localview/preview proxy legs through the harness ARE counted; direct :5200 hits are not).

## Decisions

1. **Measure in middleware, registered first (before IpFilter).** A single
   `TrafficMiddleware` wraps the whole pipeline, timing the call and reading
   `Request.ContentLength` + response bytes. Outermost placement sees static files,
   proxied localview traffic, and rejected requests — the true wire volume — not just
   controllers. Alternative (decorating controllers or extending `Logger.CountRequest`)
   rejected: opt-in instrumentation is exactly what left us blind.

2. **Response bytes via a counting wrapper stream.** `Response.ContentLength` is null for
   chunked/streamed responses (SSE chat stream, proxied responses), which are precisely
   the big ones. The middleware swaps `Response.Body` for a pass-through
   `CountingStream` that increments a counter on every `Write`/`WriteAsync`, then restores
   it. No buffering — bytes flow straight through, so streaming behavior is unchanged.

3. **Bucket key = method + route template, with fallback normalization.** After the
   pipeline runs, `HttpContext.GetEndpoint()` yields the route template for controllers
   (`GET api/repos/{repoId}/events`). For non-endpoint traffic (static files, proxy),
   normalize the path: first two segments, IDs collapsed (`/api/localview/{repo}/…` →
   `localview/*`, `/assets/*`). Caps cardinality so the in-memory table stays tiny.

4. **In-memory ring of 1-second slots, 15 minutes deep.** A lock-free-ish
   `TrafficStats` singleton: per bucket, an array of 900 slots (requests, bytesIn,
   bytesOut) indexed by unix-second modulo. Rates are computed on read (sum last 10s /
   60s / 300s). ~900 slots × ~30 buckets × 3 longs ≈ trivially small. Alternative
   (EventCounters / OpenTelemetry) rejected: heavyweight dependency, needs a collector,
   and the consumer is our own dashboard, not an APM.

5. **API: `GET /api/traffic` (auto-registered `TrafficController`, module
   `Services/Traffic/` + `AddTrafficModule()` per INTEGRATION.md).** Returns
   `{ now: {reqPerSec, bytesInPerSec, bytesOutPerSec}, history: [60 × 1s totals],
   buckets: top 15 by bytes over last 60s, threshold, high }`. Small flat JSON
   (~2–4 KB) so the monitor's own polling stays a rounding error.

6. **"High" is decided server-side.** `high = true` when bytesOut/s sustained over the
   last 60s exceeds `AppConfig.TrafficHighBytesPerSec` (flat key in `appsettings.json`,
   default 512 KB/s, overridable via `CLAUDEWEB_TRAFFICHIGHBYTESPERSEC` like every
   AppConfig setting — the app's config convention; the Kestrel builder's own
   IConfiguration doesn't reliably see appsettings.json, so a nested `Traffic:` section
   was dropped during implementation). Server-side keeps the definition in one place;
   the panel just renders it (amber tint + rail-chip dot). Alternative (client-side
   heuristics) rejected: every consumer would re-invent it.

7. **UI: standard auxiliary dock panel.** `TrafficPanel.jsx` follows the
   AutopilotPanel/AgentAuditPanel template exactly: feature key `trafficPanel` in
   `UiModeContext.jsx` as `'advanced'`, summon chip in the panel rail, dragKeys entry,
   collapsible header showing the live req/s + KB/s summary even when collapsed
   (cheap poll only while mounted and page visible, 5s cadence — the dock convention).
   Body: sparkline (last 60s bytesOut), top-talker table (bucket, req/s, KB/s), and the
   high-threshold line drawn on the sparkline.

## Risks / Trade-offs

- [Counting stream wraps every response, including the chat SSE stream] → pass-through
  only, no buffering, `Flush`/`FlushAsync` forwarded; verify streaming chat still works
  before merge (browser-testing doc applies).
- [Bucket cardinality explosion from unmatched paths] → hard cap (e.g. 100 buckets);
  overflow lumps into `other`.
- [Self-measurement feedback loop: the panel's own polling inflates the numbers] →
  accepted; response is tiny and the `GET api/traffic` bucket is visible in the table,
  which is honest. Do not special-case/exclude it.
- [Middleware sits outside PasswordAuth, so stats include unauthenticated hits] →
  intentional (that IS wire traffic), and stats are only *read* via the
  password-gated `/api/traffic`.
- [Ring-buffer races under concurrent writes] → `Interlocked.Add` per slot; reads are
  tolerant of ±1s slop (monitoring, not billing).

## Migration Plan

Pure addition — no schema, no config migration (threshold has a default; the
`Traffic:` section is optional). Rollback = revert the branch. Deploy via the normal
`swap.ps1` path with its dead-man switch.

## Open Questions

- Threshold default (512 KB/s) is a guess; tune after seeing real numbers in the panel.
- Whether bytesIn matters enough to display (it's counted regardless; panel may show
  bytesOut only for v1).
