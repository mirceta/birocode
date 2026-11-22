# Tasks — local-apps-autostart-sentry

- [x] Data model + stores: AutostartFlag / SentrySettings / MachineSlice; hub fleet store (single writer, versioned) and per-machine slice.
- [x] Sentry engine: list every registered app; apply (boot / apply now: order, delay, detached launch); check (health URL ▸ port; one restart; failing; cooldown; start grace until first seen up); never touch unflagged apps; `[AUTOSTART]` log.
- [x] Host: boot pass 20 s after the harness starts; sentry every N minutes (re-read each tick); follow-up check 20 s after a launch.
- [x] Hub ↔ peer: push the slice, read a peer's apps + state, apply / check on a peer; re-push a stale peer.
- [x] Management "Local apps" tab: per machine + app, Autostart toggle, start command, health URL + status, order + delay, state, last check / start; Apply now / Check now; interval + cooldown; red badge on the tab.
- [x] Arch tool `local_apps_status` (read-only), role v22 + test pins.
- [x] Docs: `docs/local-apps-autostart.md` (design note; what each machine needs once after a reboot).
- [x] Tests: .NET 9 sentry cases + full suite; client model tests; lab on the hub machine 23/23 (two isolated harnesses, hub + "spacex-lab"), screenshots + GIF.
- [ ] Operator: after merge + deploy (hub and spacex), arm the keep-alive watchdog where it says "Not set up", give each app to keep up a start command, flag it.
