## 0. Plan — done, approved 2026-10-08

- [x] 0.1 Investigate both sides read-only (harness control surface; daljinski commands,
      transport, auth, branch state) — design.md "Facts".
- [x] 0.2 Render the understanding (`understanding-app/`): today's chain, the sofa session on
      real screenshots, the split of work, the designs, the host options (D7), the build.
- [x] 0.3 Draft this change; strict-valid; committed on `feat/sofa-mode`.
- [x] 0.4 **Operator approved** with every question answered (D8, Decided): design D-C; host
      H3 built on H1's parts; the remote in the harness as a plain phone-fitted web page (no
      PWA, no push); a pairing PIN; no live typing (Wispr Flow on the phone); Android; end to
      end in one go — harness PR + living-room PR.

## 1. Harness — server (`feat/sofa-mode`)

- [ ] 1.1 `RemoteCommandStore` (Services/Remote): ring of the last 100 commands with a
      monotonic `seq`; `Post(type, args, from)`, `Read(after)`; publishes `remote.command` on
      `HarnessEventFeed`; screens: `Heartbeat(id, name, url, activeAgent, view)`, `Screens()`
      (dropped after 20 s of silence).
- [ ] 1.2 `RemotePairing` (Services/Remote): `NewPin()` → 6 digits, 5 min, single use;
      `Redeem(pin, ip)` constant-time compare, 5 bad tries → 60 s lockout per IP; audit lines.
- [ ] 1.3 `RemoteController`: `POST/GET /api/remote/commands`, `GET/POST /api/remote/screens`,
      `POST /api/remote/pair/new` (session required), `POST /api/remote/pair {pin}` — exempt
      from the password gate like `/api/auth/login`, IP-gated like everything, and on success
      mints the SAME session cookie `/api/auth/login` mints.
- [ ] 1.4 Tests (`tests/ClaudeWeb.Tests/RemoteTests.cs`): ring + seq + watermark; screen
      expiry; PIN expiry, single use, lockout, constant-time; controller routes incl. the
      password-gate exemption and the cookie.

## 2. Harness — client

- [ ] 2.1 `remoteDispatch.js` (pure + DOM): the one dispatch table — `open-agent` →
      `openAgentHarness({ repoId|handle })`, `open-view {view}` → the tab registry's path
      (`kanban` → Tasks tab / Management Kanban, `arch`, `status`, `fleet`, `agents`…),
      `scroll {dir}` on the active dock's `.chat__scroll`, `zoom {dir}` (document zoom in
      steps), `lane {lane}`, `stop`; returns an outcome line. Exposed as
      `window.claudewebRemote(cmd)` (the H3 hook).
- [ ] 2.2 `useBigScreen()` + the header pill "📺 big screen" (capability `bigScreen`,
      Advanced; `localStorage claudeweb_big_screen`; `?screen=1` forces on and names the
      screen): polls `GET /api/remote/commands?after=seq` every second while on, dispatches,
      heartbeats `POST /api/remote/screens` every 5 s with what it shows; amber on poll
      failure. "Pair a phone" in the pill's menu → `POST /api/remote/pair/new`, shows the PIN
      large for 5 min.
- [ ] 2.3 `/remote` route (capability `remoteView`, Advanced): phone-fitted, no dock chrome.
      Pairing screen (6-digit input → `POST /api/remote/pair`); header "projector is showing:
      …" / "no screen is listening" from `/api/remote/screens`; view row (Kanban · Status ·
      Arch · Fleet); agent list from `GET /api/dock` with busy / waiting / unseen badges, tap →
      `open-agent` and the composer target; composer → `POST /api/chat` with the opened repo +
      lane (the arch's Operator conversation when the Arch view is open), 409 shown as busy;
      Stop; ▲ ▼ Latest → `scroll`; A− A+ → `zoom`; lane toggle; peek (the last reply,
      collapsed); the open `AskUserQuestion` mirrored as buttons (tap = send the option).
- [ ] 2.4 i18n en/tr for the pill, the pairing, the remote; capability map entries.
- [ ] 2.5 Tests: node tests for the dispatch table's pure parts and the remote's helpers
      (badges, target resolution, question extraction); Playwright `shot-remote.mjs` on an
      isolated instance: a listening tab (1920×1080) + a phone tab (390×844) in one run — pair
      with the PIN, tap an agent, the listening tab opens it; send; peek; question buttons.

## 3. Living-room (its agent, driven by this one — branch `feat/harness-remote`)

- [ ] 3.1 openspec change `harness-remote` in living-room (proposal + delta to `web-remote`,
      `presentation-arbitration`).
- [ ] 3.2 `HarnessPresenter` (WebView2, beside `YouTubePlayer` / `WebPresenter`): navigates to
      the harness URL (`http://localhost:<port>/?screen=1&name=projector`), keeps the login
      (profile folder), `ExecuteScriptAsync("window.claudewebRemote(" + json + ")")` per
      command, switches under the existing arbitration (`harness-show` / `harness-hide`).
- [ ] 3.3 `HarnessControl : ICommandHandler`: `harness-show`, `harness-hide`,
      `harness-cmd {type,args}` (forwarded to the presenter); settings: harness port.
- [ ] 3.4 Harness tab in daljinski (`TABS` + an `iframe` control) embedding
      `http://<location.hostname>:5099/remote`, with "Show on projector" / "Back to media".
- [ ] 3.5 Verify first: the harness UI inside WebView2 — `window.open` (harness-window
      features), the local-app iframes, the login cookie surviving a restart. Then the full
      sofa session on the real projector. PR.

## 4. Close

- [ ] 4.1 Harness PR; living-room PR; `report_leg` for both; both verified merged on GitHub.
- [ ] 4.2 Archive this change: delta → baseline spec `sofa-mode`; the Understanding app's
      session tab stays as the record of the target experience.
