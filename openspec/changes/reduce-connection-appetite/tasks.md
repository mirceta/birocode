## 1. Server — multiplexed stream

- [x] 1.1 `ChatStreamMultiplexer` in `Services/Chat`: merge N `RunSession.StreamAsync`
      enumerables into one envelope stream (`evt` / `ctl:none` / `ctl:end`), ending
      when all pumps complete; unit tests (two live sessions, missing session, replay
      watermark, envelope shape).
- [x] 1.2 `GET /api/chat/stream-multi?subs=` in `ChatController`: parse subs (≤32),
      resolve sessions by explicit (repoId, lane), SSE-write the merged stream,
      client abort cancels pumps.

## 2. Client — shared stream hub

- [x] 2.1 `api/chatStreamHub.js`: single shared connection for all subs, debounced
      reopen on sub-set change with fresh `getAfter()` watermarks, `done` promise
      (`ended|none|aborted|unsupported`), 404/5-failure fallback signal, handle with
      `.abort()` preserving the abortRefs contract.
- [x] 2.2 `ChatContext.streamRun`: route through the hub when supported; keep the
      legacy per-run retry loop verbatim as the fallback path.

## 3. Client — poller visibility gating

- [x] 3.1 Add `document.hidden` tick guards to: Dashboard (:849 runs+messages, :405
      loops), Scoreboard, AccountChips (useAccountProbe), HostClock, AdminStatusTile,
      DockIdentityRows, EventConsole, ProductFrame probe, DiscoverAppsPanel (status +
      events), IdeasSyncBar.

## 4. Verification

- [x] 4.1 `dotnet test` green (122/122, incl. 5 new multiplexer tests),
      `npm --prefix client run build` clean, `openspec validate --strict` passes.
- [ ] 4.2 Live (after deploy): with 2 running docks, browser dev-tools/netstat shows
      one shared stream connection; a Tools-lane save completes promptly; rollback
      compatibility (hub falls back on 404) sanity-checked against the old build.
- [x] 4.3 Update the Understanding app's wedge tab: fix directions → implemented
      status.
