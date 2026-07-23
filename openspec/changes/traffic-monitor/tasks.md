# traffic-monitor — tasks

## 1. Server: measurement core

- [x] 1.1 Create `Services/Traffic/TrafficStats.cs` — singleton with per-bucket ring of
      900 one-second slots (requests, bytesIn, bytesOut via `Interlocked.Add`), bucket
      cap with `other` overflow, and read methods: current rates (10s/60s windows),
      60×1s history, top-N buckets by bytesOut over 60s.
- [x] 1.2 Create `Services/Traffic/CountingStream.cs` — pass-through wrapper over
      `Response.Body` counting written bytes; forwards Flush/FlushAsync; no buffering.
- [x] 1.3 Create `Services/Traffic/TrafficMiddleware.cs` — swaps in CountingStream,
      invokes pipeline, resolves bucket key (endpoint route template → fallback
      normalized path: `localview/*`, `assets/*`, first-two-segments), records to
      TrafficStats in finally.
- [x] 1.4 Create `Services/Traffic/TrafficModuleExtensions.cs` (`AddTrafficModule`) and
      register in `EmbeddedApi.cs`: service line in the MODULE region + 
      `UseMiddleware<TrafficMiddleware>()` as the OUTERMOST middleware (before IpFilter).

## 2. Server: API

- [x] 2.1 Create `Controllers/TrafficController.cs` — `GET api/traffic` returning
      `{ now, history[60], buckets[≤15], thresholdBytesPerSec, high }`; reads
      `AppConfig.TrafficHighBytesPerSec` (default 512_000); `high` = 60s avg
      bytesOut/s > threshold.
- [x] 2.2 Build + run isolated (self-dev rules: never the live bin/port), curl
      `/api/traffic` while clicking around; verify buckets collapse IDs, history moves,
      rates decay to ~0 when idle.
- [x] 2.3 Verify streaming intact: run a chat turn through the isolated build and
      confirm SSE streams incrementally AND its bytes show up in its bucket.

## 3. Client: Traffic panel

- [x] 3.1 Add `trafficPanel: 'advanced'` to FEATURES in
      `client/src/context/UiModeContext.jsx`.
- [x] 3.2 Create `client/src/components/dashboard/TrafficPanel.jsx` following the
      AutopilotPanel template: collapsible header with live `req/s · KB/s` summary,
      5s poll while visible, sparkline of 60s bytesOut history with threshold line,
      top-talkers table, amber high-state tint.
- [x] 3.3 Wire into `Dashboard.jsx`: feature gate, `readPanels()`/PANELS_KEY summon
      state, `dragKeys` entry, panel-rail chip (with high-state dot), render block.
- [x] 3.4 `npm --prefix client run build`; verify via headless Playwright against the
      isolated build (browser-testing doc): panel summons, drags, collapses, shows live
      numbers, Basic mode hides it.

## 4. Docs & wrap-up

- [x] 4.1 Note the `Traffic:HighBytesPerSec` setting in README/appsettings comments.
- [x] 4.2 Build an `understanding-app/` explaining the traffic path: pollers → Kestrel
      middleware → ring buffer → /api/traffic → panel (relative URLs, self-contained).
- [x] 4.3 `openspec validate --strict`; commit on `feat/traffic-monitor`; leave merge +
      deploy for after the user's personal test (no-untested-merge rule).
