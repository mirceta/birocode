# Tasks: add-dashboard-host-clock

## 1. Backend — host time probe

- [ ] 1.1 `HostTimeController` with `GET /api/host-time` returning
      `{ unixMs, iso, timeZoneId, utcOffsetMinutes }` from
      `DateTimeOffset.Now` / `TimeZoneInfo.Local` (always 200,
      `Logger.CountRequest()`, no service/DI)

## 2. Frontend — HostClock chip

- [ ] 2.1 `HostClock.jsx` in `client/src/components/dashboard/`: skew-based 1 s
      ticker + 5 s resync, host-offset formatting (never phone-local), stale
      marker after ~3 failed polls
- [ ] 2.2 Render in `dash__scoreboard-row` in `Dashboard.jsx`, gated by new
      `hostClock: 'advanced'` capability in `UiModeContext.jsx`
- [ ] 2.3 `hostClock.css` matching the row's chip idiom + i18n keys in
      `en.json` / `tr.json`

## 3. Verify

- [ ] 3.1 Build frontend + backend; Playwright on an isolated preview port:
      clock visible in Advanced (absent in Basic), shows host wall time +
      offset, ticks between polls; screenshot; `openspec validate --strict`
