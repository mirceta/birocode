# Design: local-app-lifecycle-controls

## Context

The Local Apps panel (capability `discover-local-apps`) discovers apps by agent
scan, caches findings per repo (`LocalAppDiscoveryCache`, union-by-port),
projects live `running` off a port check (`LocalAppRunner.IsListening`), and
starts apps detached via the cached `startCommand`
(`LocalAppsController.Run` → `LocalAppRunner.Launch`). Two structural facts
shape this change:

- **No PID is retained.** `Launch` deliberately fires-and-forgets; liveness is
  read off the port. Anything we stop must be resolved *live from the port at
  stop time* — which also means apps started by hand on the host are equally
  stoppable.
- **Findings carry no build knowledge.** Only `startCommand` exists. Rebuild
  needs a new optional `buildCommand` flowing through prompt → typed report →
  cache → import/export.

The existing job pattern for disconnect-proof backend work is
`LocalAppDiscoveryJobs` (start-or-join, own CTS, state retained for reattach).

## Goals / Non-Goals

**Goals:**

- Stop / Restart / Rebuild as per-row panel actions + repo-scoped endpoints,
  resolved server-side from the cached findings (never commands off the wire —
  same trust model as Run).
- `buildCommand` as a first-class optional finding field with full back-compat.
- Rebuild as a disconnect-proof job with captured output + exit code.
- Hard guarantee the harness never kills itself (Self-Development).

**Non-Goals:**

- No PID retention or process supervision (no auto-restart on crash, no stdout
  streaming of running apps). Liveness stays port-based.
- No combined "rebuild then restart" orchestration — two explicit operator
  actions (a chained affordance can be a later change).
- No lifecycle controls for the *registered* apps store (`/api/dock` local-app
  tabs); scope is discovery findings only, where the commands live.
- Basic mode stays without any of these affordances.

## Decisions

### D1 — Stop resolves the owner via the OS, kills via `taskkill /T`

Port→PID: shell to PowerShell `Get-NetTCPConnection -State Listen -LocalPort <p>`
and take `OwningProcess` (covers IPv4 + IPv6 loopback listeners). Kill:
`taskkill /PID <pid> /T /F` so the listener's child tree dies with it (a
`node serve.mjs` launched under our detached `powershell -Command` wrapper, or
whatever the operator started by hand).

*Alternative considered:* P/Invoke `GetExtendedTcpTable` + walking
`Process` children in-code. Rejected: ~100 lines of interop + fragile tree
enumeration to optimize an action a human clicks a few times a day; the shell
pair is two locale-independent commands with exact PID semantics.

### D2 — Self-protection is a PID comparison, not a port list

Before killing, refuse when the resolved PID is `Environment.ProcessId` or any
PID on the current process's parent chain (walked once at stop time). This is
the structural guard the spec demands: even if a cached finding claims the
harness's own port (self-dev scans the harness repo!), the kill cannot land on
the harness or on whatever is hosting it.

*Alternative considered:* a deny-list of "known harness ports" (5099…).
Rejected: ports are config, PIDs are ground truth; a port list both over-blocks
(a legitimately stoppable product on a reused port) and under-blocks (harness
moved off 5099).

Note the guard protects *this* process. Another harness instance (e.g. an
isolated :5219 test copy) is a legitimate product and stays stoppable.

### D3 — `buildCommand` mirrors `startCommand` exactly

One optional string on `LocalAppFinding` (`""` = unknown / build-less), with a
`[Description]` so the prompt schema updates itself via `OutputFormatRenderer`.
JSON default gives back-compat for free: old cache files, old import payloads,
and old exports all parse with `buildCommand: ""`; export now emits the field.
No cache version bump, no migration.

### D4 — Rebuild is a start-or-join job registry, state embedded per-row

New `LocalAppBuildJobs` keyed `(repoId, port)`, patterned on
`LocalAppDiscoveryJobs`: `POST /api/local-apps/rebuild {port}` starts or joins;
the job runs `buildCommand` in the app's folder with redirected stdout+stderr
(bounded tail, ~8 KB) and records exit code + timing on its own CTS — request
aborts never cancel it. Rebuild state (`running | succeeded | failed`, exit
code, tail, finishedAt) is projected **per row** inside the existing
status/cache bodies, so the panel's existing poll picks it up with no new
polling loop; the POST returns the same row state.

*Alternative considered:* a separate rebuild-status endpoint the panel polls.
Rejected: the panel already polls discovery status ~5s; embedding keeps one
source of truth and zero new client plumbing.

### D5 — Restart is synchronous stop → wait-free → launch in the controller

`POST /api/local-apps/restart {port}`: if listening, run the D1 stop (same
guards); then poll `IsListening` until free (250 ms steps, ~10 s bound —
TIME_WAIT doesn't hold a *listener*, so port-free detection is reliable); then
`Launch` the cached `startCommand`. Fails explicitly without launching if the
stop fails or the bound expires. Not running → plain launch. A bounded ~10 s
request is acceptable for a human-clicked action; a job would add reattach
machinery for no benefit.

### D6 — Existing caches upgrade via a targeted backfill ask, not only rescan

Live repos already hold populated caches with no `buildCommand`. Two upgrade
paths, one cheap and one thorough:

- **Backfill (new)**: a second structured ask, `LocalAppBuildCommandAsk`,
  patterned on `LocalAppDiscoveryAsk` and sent through the same
  `ClaudeMonitor.Client` gateway with the same read-only tool policy and the
  same typed-report machinery (`[JsonPropertyName]`/`[Description]` →
  `OutputFormatRenderer` → extract → validating parse → bounded retry). The
  prompt *enumerates* the cached findings missing a build command (name,
  folder, port, startCommand) and asks only: "for each of these folders, what
  command builds its servable artifacts?" — no rediscovery, so it's fast and
  can't hallucinate new apps. The typed report is a list of `{port,
  buildCommand}`; the parse rejects any port outside the enumerated set.
  Merge updates only `buildCommand` on matching ports — never name, folder,
  evidence, startCommand, or per-finding discovery times. Runs as a
  backend-owned job (reusing the discovery-jobs pattern) with a panel action
  that's a no-op (no agent call) when nothing is missing.
- **Rescan**: ordinary re-discovery now extracts `buildCommand` too, and the
  union-by-port merge replaces matched findings wholesale — so a rescan also
  upgrades the cache, just at full-scan cost.

*Alternative considered:* silently piggy-backing backfill onto the next
discovery run. Rejected: discovery is an explicit, expensive operator action;
upgrading a big existing cache shouldn't require re-scanning the whole repo,
and an explicit affordance keeps the "no agent runs without the operator
asking" property of the panel.

### D7 — Event Console tells the truth at each boundary

Stop/restart/rebuild emit `RepoEventLog` events exactly like run/check today:
stop emits resolved PID before the kill and the outcome after; restart emits its
three phases; rebuild emits started/succeeded/failed with exit code. The
existing truthfulness rule holds: for restart's launch phase the terminal event
is "launch issued", liveness remains the port's story.

## Risks / Trade-offs

- **[Kill-by-port hits an innocent squatter]** — a process that coincidentally
  holds a cached port gets killed. → Mitigated: repo-scoped cache membership,
  explicit per-row operator action (never automated), PID surfaced in the event
  log; residual risk accepted — it equals what the operator would do by hand.
- **[`Get-NetTCPConnection` / `taskkill` unavailable or slow]** → Both ship with
  Windows Server 2019 (NetTCPIP module, system32); failure is caught and
  surfaced as an explicit stop error, never a silent no-op.
- **[Build output can be huge]** → bounded tail retained (~8 KB); truncation is
  marked so a "success" with truncated output is still honest.
- **[Restart races another starter]** — between port-free and our launch someone
  else grabs the port; the launch then comes up broken or dies. → The panel's
  live `running` + Event Console make the outcome visible; no lock is attempted
  (same as Run today).
- **[Self-dev: stopping the previewed product that IS a harness copy]** is
  allowed by design (only *this* process is protected) — the operator can shoot
  the :5219 test instance from its own panel. Documented in the panel copy.

## Migration Plan

Purely additive — no data migration (D3), no endpoint changes to existing
routes. Ships like any feature: build, isolated-port verify, deploy via
`swap.ps1`, dead-man rollback armed until "keep it".

## Open Questions

- None blocking. A chained "Rebuild & restart" convenience action is deliberately
  deferred until the two primitives prove themselves.
