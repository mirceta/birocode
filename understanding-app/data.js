// Numbers behind the Understanding app — from the hub's log of 2026-10-05, dotnet-stack samples
// of the live process, and the lab runs recorded in openspec/changes/hub-perf-arch-state-snapshot/design.md.
window.PERF_DATA = {
  hubLog: [
    { what: '[ARCH] state took (GET /api/arch over 1 s)', count: 1499, note: 'avg 4,441 ms · max 38,406 ms · 879 over 2 s · 6,657 s of request time in 103 min' },
    { what: '[COLLECTOR] source Pavlin: unreachable — timed out', count: 1744, note: 'one per 2.5 s poll pass, all day' },
    { what: '[FLEET] GET /api/arch/peer/requests … timed out', count: 256, note: 'the Repo Agent Requests tab pull, on the request path, 8 s each' },
    { what: '[FLEET] GET /api/arch/peer/files … timed out', count: 57, note: 'hub files listing across peers' },
    { what: '[GIT] Status computations', count: 9246, note: '≈ 90 a minute; 9–17 git processes each' },
  ],
  lab: {
    before: { latency: { arch: { p50: 689, p95: 4120, max: 7370 }, fleetStatus: { p50: 1483, p95: 9820, max: 9844 }, requests: { p50: 8010, p95: 8016, max: 8016 }, archMessages: { p50: 5, p95: 8, max: 94 }, taskgraph: { p50: 2, p95: 3, max: 10 }, policeman: { p50: 7, p95: 13, max: 21 }, analytics: { p50: 9, p95: 32, max: 45 }, loops: { p50: 1, p95: 2, max: 7 }, activity: { p50: 1, p95: 2, max: 4 } } },
    after: { latency: { arch: { p50: 10, p95: 388, max: 510 }, fleetStatus: { p50: 76, p95: 870, max: 1272 }, requests: { p50: 1, p95: 3, max: 5 }, archMessages: { p50: 10, p95: 26, max: 199 }, taskgraph: { p50: 3, p95: 7, max: 26 }, policeman: { p50: 17, p95: 31, max: 78 }, analytics: { p50: 18, p95: 66, max: 81 }, loops: { p50: 2, p95: 5, max: 13 }, activity: { p50: 3, p95: 6, max: 8 } } },
    bars: [
      { label: 'GET /api/arch, first call after boot', unit: 'ms', before: 11560, after: 90 },
      { label: 'GET /api/arch, p95 under the mix', unit: 'ms', before: 4120, after: 388 },
      { label: 'GET /api/arch, max', unit: 'ms', before: 7370, after: 510 },
      { label: 'GET /api/arch/fleet/status, p95', unit: 'ms', before: 9820, after: 870 },
      { label: 'GET /api/arch/requests, p50 (pulls the dead peer)', unit: 'ms', before: 8010, after: 1 },
      { label: 'git Status computations in 150 s', unit: 'count', before: 132, after: 115 },
      { label: 'Collector "unreachable" log lines in 150 s', unit: 'count', before: 22, after: 4 },
      { label: 'Fleet reads that timed out in 150 s', unit: 'count', before: 12, after: 0 },
      { label: '"state took" lines (a poll over 1 s) in 150 s', unit: 'count', before: 17, after: 0 },
    ],
    note: 'Release builds of main@c3d76cdd and this branch; 150 s of the dashboards\' polling mix (~2.8 req/s, 15 pollers); live-store copy with the real 19 repos and 15 docks; Pavlin (down) as the only remote source with its 5 fleet keys. The box is shared, so the same binary varies run to run: a second run of this code measured /arch at 5 / 54 / 317 ms. The hub itself logged avg 4.4 s / max 38 s for the same call this morning. CPU stays ~12–18 %: the git work still happens, in the worker — what changed is that no request waits on it. Fleet status keeps a ~0.8 s tail, not git: see design.md §5.',
  },
  pollers: [
    { surface: 'Arch tab', poller: 'GET /arch + /autopilot/loops + /arch/messages', cadence: '3 s', guard: 'yes', change: 'served from the snapshot' },
    { surface: 'Fleet Status tab', poller: 'GET /arch/fleet/status', cadence: '5 s', guard: 'yes', change: 'served from the snapshot' },
    { surface: 'Kanban', poller: 'GET /taskgraph + /arch/fleet/status + /notes', cadence: '5 s', guard: 'yes', change: 'fleet status coalesced with the Status tab\'s when both are open' },
    { surface: 'Recurring tab', poller: 'GET /recurring (5 s) + /arch/fleet/status (30 s)', cadence: '5 s / 30 s', guard: 'yes', change: '—' },
    { surface: 'Repo Agent Requests tab', poller: 'GET /arch/requests (pulls peers every 10 s)', cadence: '5 s', guard: 'yes', change: 'a backed-off peer answers at once instead of an 8 s timeout' },
    { surface: 'Management App shell', poller: 'GET /recurring (tab badge)', cadence: '15 s', guard: 'yes', change: '—' },
    { surface: 'Dashboard', poller: 'GET /sessions/activity + /runs', cadence: '5 s', guard: 'yes', change: '—' },
    { surface: 'Dashboard, per dock ×15', poller: 'GET /autopilot/loops (useQueueLoopStatus)', cadence: '10 s', guard: 'yes', change: '15 requests per tick → 1 (coalesced)' },
    { surface: 'Dashboard, per dock ×15', poller: 'GET /github-account?repoId (DockIdentityRows)', cadence: '10 s', guard: 'yes', change: '— (differs per repo; server caches 5 s)' },
    { surface: 'Dashboard, per dock', poller: 'GET /git/status', cadence: 'mount + manual refresh only', guard: 'n/a', change: '—' },
    { surface: 'Dashboard, per dock', poller: 'app build / local-app discovery status', cadence: '5 s while a job runs', guard: 'added', change: 'skips hidden tabs' },
    { surface: 'Dashboard panels', poller: 'Scoreboard, AccountChips ×2, AdminStatus, Watchdog, HostClock, EventConsole, Traffic, Autopilot, HandToArch, Policeman', cadence: '4–8 s each', guard: 'yes', change: '—' },
    { surface: 'Chat page', poller: 'UnderstandingPanel GET /files/read', cadence: '5 s', guard: 'yes (visibilityState)', change: '—' },
    { surface: 'Files tab', poller: 'GET /files/read or /files/raw', cadence: '5 s', guard: 'yes (visibilityState)', change: '—' },
    { surface: 'Any page', poller: 'StaleVersionBanner GET /version', cadence: '3 min', guard: 'yes', change: '—' },
  ],
};
