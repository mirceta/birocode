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

## 5. Post-review hardening (8-finder adversarial review, 2026-08-26)

- [x] 5.1 Wire identity: client-chosen sub `id` in payload + echoed on every
      envelope; one wire entry per subscription (no (repo,lane) grouping, no
      shared-minimum watermark); client dispatch by exact id lookup. Kills the
      late-attach watermark-poisoning race, ctl end/none mis-settling, replay
      amplification, and the O(N)-per-token dispatch in one stroke.
- [x] 5.2 Hub: lane normalized exactly like the server; retry path goes through
      scheduleReopen (no orphaned debounce timer); MAX_FAILURES and HTTP 400 now
      set supported=false before settling (no mixed hub/legacy socket stacking);
      per-sub onEvent isolation (one broken handler can't kill the shared
      connection).
- [x] 5.3 ChatContext.attachToRun: re-check the reader guard (and a Stop) after
      the transcript-load await — the 5 s reconcile could re-enter during the
      load and register a duplicate, uncancellable hub sub.
- [x] 5.4 Tests: duplicate-watcher test (two subs on one run, distinct watermarks,
      each gets its own replay + end); id echoed in all envelope shapes.
