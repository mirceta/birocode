# Design — local-apps-autostart-sentry

The full design note, for the Operator and the PR, is `docs/local-apps-autostart.md`: the data model, where the
flags live, what runs where, the sentry's rule, and what each machine needs after a reboot. Decisions in short:

- **Single writer.** The hub's fleet store is the truth, keyed by machine label. A machine runs only the slice it
  was given; it keeps running its last slice from disk when the hub is down. A per-machine version detects a stale
  peer, which is re-pushed on the hub's next read.
- **The peer write is password-authenticated.** It needs the same credential the hub's collector holds for that
  peer. It can only flag apps already registered there, and those apps start with commands that machine's registry,
  discovery or entry provides. Apply and check on a peer run in the background, because a delay chain would outlast
  the hub's 8 s fleet timeout. The hub's next poll shows the result.
- **Start commands.** The entry's own command wins, else the discovery cache's for that port. There is no command
  field in the registry today, and most apps have none, so the tab takes one per entry.
- **Launch.** The harness's existing `LocalAppRunner` is used, wrapped by `RunnerOps`: `powershell -NoProfile
  -Command <cmd>`, no window, not awaited, and the refusal to stop the harness itself.
- **Sentry state machine** (per flagged app, in memory):
  `unknown → up | starting | down → (one restart) → starting → up | failing`.
  - `failing` is sticky until the app answers or the Operator presses Apply now.
  - The start grace (2 min) applies only until the app is first seen up after a launch, so a crash right after a
    good start is restarted at once.
  - The cooldown (15 min) stops a flapping app from being restarted again too soon.
- **Apply never kills a running app.** A taken port with a failing health URL is left to the sentry, which may stop
  the hung listener for its one restart.
- **Badge.** `GET …/summary` reads the cached fleet view (peer reads cached 15 s); the dashboard polls it every 30 s.
- **Harness-served apps** (Understanding, Goal, Lab, events feed) are always on: they are counted on one line, not
  listed, and cannot be flagged.
