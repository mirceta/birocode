# Local apps: autostart after a reboot + sentry (fleet task f88f97fe)

## Why

The fleet has many registered local apps (admin and hook apps, console-machine, homepages, the legal app on 28170 …).
When a computer reboots, none of them come back by themselves. The Operator does not want all of them started; they
want to mark the ones that must, and have something verify those are really working.

## What changes

- **A Local apps tab in the Management dashboard.** It lists every registered local app of every machine: machine,
  agent, app, port/URL, the start command and where it comes from (the entry's own, or the discovery cache). Per app,
  the Operator sets:
  - an **Autostart** toggle;
  - a health URL and the expected status;
  - a start order and a delay.

  The tab shows the live state (up / starting / down / failing, last check, last start and its result). Each machine
  has **Apply now** and **Check now**, the sentry interval and the restart cooldown are set here, and the tab's label
  carries a **red badge** (flagged apps down or failing).
- **The hub stores the flags (single writer)** in `local-apps-fleet.json` and pushes each machine its versioned slice:
  - the hub writes its own `local-apps-autostart.json` directly;
  - a peer gets it through `POST /api/arch/peer/local-apps/flags`;
  - a peer that missed a push is re-pushed when it next answers with an older version.
- **Start on boot.** Each machine's harness starts its flagged apps 20 s after it starts, and on **Apply now**:
  - detached, in order, with each app's delay, using its start command in its folder;
  - every attempt is logged (`[AUTOSTART]`).
- **Sentry.** Every N minutes (default 5) each machine probes its flagged apps: the health URL, else the TCP port.
  - A failure gets **one** restart attempt; a hung listener is stopped first.
  - After that attempt, or when an app goes down again within the cooldown, it is marked **failing**, with no further
    automatic restarts until it answers or the Operator applies.
  - A freshly launched app gets a start grace until it is first seen up.
  - Apps that are not flagged are never touched.
- **The arch** gets a read-only tool, `local_apps_status`, with role v22: report the failing apps, never start or
  flag them.
- **Docs.** `docs/local-apps-autostart.md` covers the data model, what runs where, and what each machine needs once:
  the `ClaudeWebKeepAlive` watchdog armed, this build, and a start command per flagged app.

## Impact

- **Server:**
  - `Services/LocalApps/`: `AutostartStore` + `FleetAutostartStore`, `LocalAppSentry`, `LocalAppsFleet`,
    `LocalAppsModuleExtensions` (+ `LocalAppSentryHost`);
  - `LocalAppsAutostartController`; `ArchPeerController` (local-apps routes); `FleetClient` (four calls);
  - arch: `local_apps_status` (`ArchMcpServer`, `ArchAgentService.LocalApps.cs`, role v22 + pins);
  - tests: `LocalAppsAutostartTests`.
- **Client:**
  - `manage/LocalAppsTab.jsx`, `localAppsModel.js` (+ test), `localApps.css`;
  - `ManageApp` (the tab + red badge);
  - en/tr strings;
  - the committed manage bundle.
