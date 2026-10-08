## 0. Plan (this ping)

- [x] 0.1 Investigate both sides read-only (harness control surface; daljinski commands,
      transport, auth, branch state) — see design.md "Facts".
- [x] 0.2 Render the understanding (`understanding-app/`): today's setup, the sofa session,
      the split of work, the three designs with trade-offs, the phased plan, open questions.
- [x] 0.3 Draft this change (proposal / design / tasks / delta spec); commit on
      `feat/sofa-mode`, no push, no PR.
- [ ] 0.4 **Operator approves the plan** (answers the open questions) — nothing below starts
      before this.

## M0. Today — the status quo, nothing to build

- [x] M0.1 The Operator already drives the harness from the sofa with daljinski's touchpad +
      text-send (design D-A): "better than nothing, but too much work" (2026-10-08). Its pain
      points — slow pointing, blind typing, no feedback on the phone — are M1's brief.
- [x] M0.2 Design decided by the Operator: **D-C** (command the real harness tab from a phone
      remote in the harness). D-B (a dedicated projector view) dropped.

## M1. Open an agent from the phone, send a prompt

Harness (`feat/sofa-mode`, this repo):
- [ ] M1.1 `RemoteCommandStore` + `RemoteController` (`POST/GET /api/remote/commands` with
      `seq`, `remote.command` on the event feed; `GET/POST /api/remote/screens` heartbeat);
      unit tests.
- [ ] M1.2 The "📺 big screen" header pill + `useBigScreen()` listener: polls the commands,
      dispatches `open-agent` → `openAgentHarness`, `open-view` → header navigation, `scroll`
      → active dock's message list, `zoom` → document zoom; heartbeats what it shows;
      capability `bigScreen` (Advanced); `?screen=1`.
- [ ] M1.3 `/remote` route: view row, agent list with badges, tap → `open-agent`, composer →
      `POST /api/chat` with the opened repo + lane, Stop, ▲ / ▼ / Latest → `scroll`, A−/A+ →
      `zoom`, "projector is showing: …" / "no screen is listening"; capability `remoteView`
      (Advanced).
- [ ] M1.4 i18n (en/tr); client tests for the remote/listener pure helpers (dispatch table,
      seq handling); Playwright: a listening tab + a phone-sized tab in one run, the phone's
      tap opens the agent in the listening tab.
- [ ] M1.5 Verify on this machine with the real projector: phone on the LAN → `/remote`,
      Chrome on the projector with the pill on; pick, type, watch it stream. PR.

Living-room (branch `feat/harness-remote`, driven by this agent; `report_leg`):
- [ ] M1.6 openspec change `harness-remote` in living-room (proposal + delta to `web-remote`).
- [ ] M1.7 `HarnessControl : ICommandHandler` — `show-harness` (raise the Chrome window
      showing the harness, or start it at `/?screen=1`); setting for the harness port
      (default 5099).
- [ ] M1.8 Harness tab in `app.js`: iframe/link to `http://<location.hostname>:5099/remote`,
      "Show on projector" button; `#harness` deep link. PR.
- [ ] M1.9 (optional nicety for the fallback) `mouse-scroll {dy}` and `press-key` for
      `enter`, `tab`, `escape`, arrows, `pageup/pagedown`, `home/end` in daljinski.

## M2. A whole sofa session

- [ ] M2.1 Question cards on the phone: detect the opened conversation's open
      `AskUserQuestion`, mirror the options as buttons, send the option as the next message;
      "needs you" badge on the list; `navigator.vibrate` on arrival.
- [ ] M2.2 `lane {builder|ask}` and `stop` commands; tool-call ticker on the phone from the
      stream; the composer targets the arch's Operator conversation when the Arch view is
      open; SSE instead of the 1 s poll in the listener.
- [ ] M2.3 "Peek": show the last assistant message on the phone (collapsed by default).
- [ ] M2.4 Verify: a full session from the sofa (pick → read → prompt → watch → answer a
      question → talk to the arch → back to the Kanban). PR(s).

## M3. More screens, more input

- [ ] M3.1 `open-view` for every management view (Status, Fleet, Recurring, Deploys, …); the
      listener reports its available views on the heartbeat; the phone's view row is built
      from it.
- [ ] M3.2 Voice dictation in the Remote composer (Web Speech API on the phone; question:
      iOS Safari support).
- [ ] M3.3 A fleet picker on the remote: command the hub's listening tab through its own
      harness (same API, the fleet address list the Management App already has).

## M4. One app

- [ ] M4.1 Daljinski's Harness-tab controls forward `{type,args}` to `/api/remote/commands`
      (the shapes already match) if the Operator prefers it over the iframe — decided after M2.
- [ ] M4.2 Pairing PIN for `/remote` when `LanBypassCidrs` is empty; PWA manifest + icon.
- [ ] M4.3 Archive this change; fold the remote into a baseline spec `sofa-mode`.
