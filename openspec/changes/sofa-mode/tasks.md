## 0. Plan (this ping)

- [x] 0.1 Investigate both sides read-only (harness control surface; daljinski commands,
      transport, auth, branch state) — see design.md "Facts".
- [x] 0.2 Render the understanding (`understanding-app/`): today's setup, the sofa session,
      the split of work, the three designs with trade-offs, the phased plan, open questions.
- [x] 0.3 Draft this change (proposal / design / tasks / delta spec); commit on
      `feat/sofa-mode`, no push, no PR.
- [ ] 0.4 **Operator approves the plan** (answers the open questions) — nothing below starts
      before this.

## M0. Sofa today — living-room only (optional, can run with M1)

- [ ] M0.1 `living-room`: `mouse-scroll {dy}` command (wheel via `SendInput`), a touchpad
      two-finger / scroll-strip control on the phone page.
- [ ] M0.2 `living-room`: `press-key` accepts `enter`, `tab`, `escape`, `up/down/left/right`,
      `pageup/pagedown`, `home/end`; a key row on the text card.
- [ ] M0.3 Operator note: Chrome zoom 150 % on the projector; try a sofa session with the
      touchpad; feed the pain points into M1.

## M1. Read on the projector, send from the phone

Harness (`feat/sofa-mode`, this repo):
- [ ] M1.1 `StageStore` + `StageController` (`GET/PUT /api/stage`, `seq`, `stage.changed`
      on the event feed); unit tests.
- [ ] M1.2 `/stage` route: presentation variant of the conversation view, top strip, follow
      mode, fontScale, idle QR/URL of `/remote`; polls the Stage; capability `stageView`
      (Advanced).
- [ ] M1.3 `/remote` route: agent list with badges, tap-to-stage, composer → `POST /api/chat`
      with the staged repo + lane, Stop, Follow / ▲ / ▼ / Latest, A−/A+; capability
      `remoteView` (Advanced).
- [ ] M1.4 i18n (en/tr) for both routes; client tests for the stage/remote pure helpers;
      Playwright shots at phone (390×844) and TV (1920×1080) sizes.
- [ ] M1.5 Verify on this machine with the real projector: phone on the LAN → `/remote`,
      Chrome on the projector → `/stage`; pick, type, watch it stream. PR.

Living-room (branch `feat/harness-remote`, driven by this agent; `report_leg`):
- [ ] M1.6 openspec change `harness-remote` in living-room (proposal + delta to `web-remote`).
- [ ] M1.7 `HarnessControl : ICommandHandler` — `show-harness` (raise the browser showing the
      Stage, or start it at `/stage`); setting for the harness port (default 5099).
- [ ] M1.8 Harness tab in `app.js`: iframe/link to `http://<location.hostname>:5099/remote`,
      "Show on projector" button; `#harness` deep link. PR.

## M2. A whole sofa session

- [ ] M2.1 Question cards on the phone: detect the staged conversation's open
      `AskUserQuestion`, render options as buttons, send the option as the next message;
      "needs you" badge on the list; `navigator.vibrate` on arrival.
- [ ] M2.2 Scroll hints on the Stage record (`scroll {dir, nonce}`), consumed once by the
      projector; lane toggle Builder / Ask; run status + tool-call ticker on the strip.
- [ ] M2.3 "Peek": show the last assistant message on the phone (collapsed by default).
- [ ] M2.4 Verify: a full session from the sofa (pick → read → prompt → watch → answer a
      question → stop). PR(s).

## M3. Beyond one agent

- [ ] M3.1 `view` on the Stage: `status | kanban | fleet` render the Management App bundle's
      views full-bleed; phone picks the view.
- [ ] M3.2 Two-up stage (two agents side by side) and the arch's Operator chat from the phone.
- [ ] M3.3 Voice dictation in the Remote composer (Web Speech API on the phone; question:
      iOS Safari support).

## M4. One app

- [ ] M4.1 Daljinski native Harness tab (its own controls calling the harness API) if the
      Operator prefers it over the iframe — decided after M2.
- [ ] M4.2 Pairing PIN for `/remote` when `LanBypassCidrs` is empty; PWA manifest + icon.
- [ ] M4.3 Archive this change; fold `stage` into a baseline spec `sofa-mode`.
