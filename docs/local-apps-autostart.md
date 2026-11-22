# Local apps: autostart after a reboot + sentry

Fleet task f88f97fe · openspec `local-apps-autostart-sentry` · Management dashboard → **Local apps** tab.

The harness knows many registered local apps, one or more per repo agent (the dock's Local tab). After a reboot none
of them come back by themselves. The Operator marks the ones that must; every machine then starts its marked apps when
its harness starts, and a **sentry** checks them every few minutes.

## Data model and where it lives

```
AutostartFlag  { repoId, appId, autostart, healthUrl?, expectStatus?, order, delaySec,
                 startCommand?, folder?, updatedAt }          one per registered app per machine
SentrySettings { intervalMin = 5, cooldownMin = 15 }            fleet-wide
MachineSlice   { flags[], settings, version, from }             what ONE machine runs
```

| Store | File (data dir) | Written by | Read by |
|---|---|---|---|
| **Fleet store** (the single writer) | `local-apps-fleet.json` on the **hub** | the Local apps tab | the hub, to build each machine's slice |
| **Machine slice** | `local-apps-autostart.json` on **every** machine | the hub: a direct write for itself, `POST /api/arch/peer/local-apps/flags` for a peer | that machine's sentry, at boot and on every pass |
| Sentry state (up / starting / down / failing, last check, last start and its result) | in memory | the sentry | the tab, `local_apps_status` |

- **Versions keep peers in sync.** Each machine's slice carries a version that is bumped on every change.
  - If a peer was dark when the hub pushed, it answers with an older version on the hub's next read and is re-pushed;
    the tab shows "flags pending" until then.
  - A peer keeps running its last slice when the hub is down.
- **Where the start command comes from.** The entry's own `startCommand` (any line; a VBS launcher is
  `wscript launch.vbs`) wins. Otherwise the discovery cache's start command for that port is used (the Local Apps
  panel's Discover). Most registered apps have neither today, so the tab shows "no start command known"; an app can
  only be flagged once it has one.
- **Where it runs.** The folder is the entry's own (relative to the repo, never outside it), else the discovered
  folder, else the repo root.

## What runs where

```
 hub (Management → Local apps)                       every machine (hub included)
 ─────────────────────────────                       ──────────────────────────────────────────────
 PUT /api/local-apps/autostart/flag ─► fleet store ─► slice ─► local-apps-autostart.json
 PUT …/settings                                         │
 POST …/apply {machine}  ──────────────────────────────►│  ApplyAsync: flagged apps in order (order, name);
 POST …/check {machine}  ──────────────────────────────►│    not answering → launch detached with the start
 GET  …/fleet  ◄── self snapshot + GET /api/arch/peer/local-apps (cached 15 s)
 GET  …/summary (the tab's red badge)                   │    command in its folder, wait delaySec, next
                                                        │  boot: the same, 20 s after the harness starts
                                                        │  every intervalMin: CheckAsync (the sentry)
```

## The sentry's rule

One pass, for each flagged app:

1. **Probe it.** The health URL is used when set; it must answer the expected status, or any 2xx/3xx. Otherwise
   something must be listening on the TCP port.
2. **Answers →** `up`.
3. **Just launched →** `starting`. "Just launched" means started less than 2 minutes ago and not yet seen up since.
   A slow `dotnet run` is therefore never launched twice. An app that was seen up and then dies is a crash, and is
   judged at once.
4. **Doesn't answer →** **one restart attempt**. A hung listener (port taken but the health URL failing) is stopped
   first, with the harness's own refusal to stop itself. Then the start command is launched.
5. **Still doesn't answer after that attempt** (or it went down again within the **cooldown**, default 15 min) →
   `failing`. There are no further automatic restarts until it answers again or the Operator presses **Apply now**.
   No endless restart loops.
6. **Apps that are not flagged** are listed with their live port state and never started, stopped or probed.

Every attempt is logged in the harness log as `[AUTOSTART] …`.

## Surfacing

- **The tab.**
  - Per machine: reachable or not, flags in sync, last check / last apply, **Check now** and **Apply now**.
  - Per app: start command (and its source), the Autostart toggle, health URL + expected status, order + delay,
    state, and the last start with its result.
  - The tab's label carries a **red badge**: flagged apps down or failing across the fleet.
- **The arch.** `local_apps_status` (arch role v22) reads the same numbers per machine, with each down or failing
  app's last error. The arch reports them; it never starts, stops or flags apps itself.

## After a reboot: what the harness needs

Autostart runs **inside the harness**, so the harness must itself come back after a reboot. Today that is the
**`ClaudeWebKeepAlive`** scheduled task (`Services/Watchdog/WatchdogPlan.cs`):
- triggers at startup and at logon, with highest privileges;
- every 15 s it asks `http://localhost:5099/api/health` and starts the harness when it doesn't answer.

When the harness is up, its sentry host waits 20 s for the network and the registry to settle, then runs the boot
pass.

**Once per machine, the Operator:**

1. **Arms the watchdog.** Open the harness on that machine; in the header status strip, the **Harness keep-alive
   watchdog** tile shows *Auto-start armed* or *Not set up*. Press **Set up auto-start**; it asks for administrator
   rights once, or shows an elevated command to paste. The installer's Startup-folder entry (logon only) also brings
   the harness back, but the watchdog covers boot and crashes too.
2. **Makes sure that machine runs a build with this feature.** An older peer shows "older build without local-app
   autostart — upgrade it" in the tab.
3. **Gives every app to be flagged a start command.** Type it in the tab, or run Discover on its repo. An app that
   needs a window or a login (a VBS launcher that opens a console, say) runs in the harness's session: when the
   harness starts at boot before anyone logs on, such an app starts there too.

Nothing else is needed. The flags are pushed by the hub, and a machine that rebooted reads its last slice from disk
before the hub answers.

## Verification

- **Lab on the hub machine** (`.claudeweb-preview/autostartlab/lab.ps1`, **23/23**): two isolated harnesses built
  from this branch.
  - The lab hub on :5304 holds a copy of the live registry and discovery cache; none of the real apps were flagged
    or touched.
  - The lab peer is "spacex-lab" on :5306.
  - Throwaway node apps are the only thing flagged.
  - The Operator's actions were all done in the tab:
    - flag three apps on the hub and one on spacex-lab; the slice reaches the peer;
    - Apply now on each machine starts exactly the flagged apps, and the unflagged ones stay down;
    - a killed app is restarted by Check now within 3 s;
    - an app with a broken command gets one attempt, then `failing`, with no further start in three more passes, and
      the tab's red badge shows it;
    - the interval reaches the peer;
    - each harness was killed and restarted: its boot pass started its flagged apps again.
- **Not checked on the real spacex.** It needs this build, and the brief says do not deploy. Once merged and deployed
  there, the tab shows its apps and pushes its flags the same way.
- **Tests:** .NET `LocalAppsAutostartTests` (9 cases); client `localAppsModel.test.mjs` (6 cases).
