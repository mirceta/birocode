# Sofa mode — the living-room leg (brief for living room/living-room)

Card `68090860b8684594a52c0b254f80c217`, approved by the Operator 2026-10-08, end to end. The harness
side is built and verified on `feat/sofa-mode` of birocode (`living room/claude-web-this-app`). This
is the leg for the living-room repo: branch `feat/harness-remote`, its own PR, reported with
`report_leg(task 68090860…, leg living-room, branch, pr)`.

## The contract the harness offers (this machine, `http://localhost:5099`)

1. **The big screen is a normal harness page.** Navigate a WebView2 to
   `http://localhost:5099/studio?screen=projector`. The `screen` query switches the page into
   listening mode under that name (remembered in the WebView2 profile's localStorage): it polls
   `GET /api/remote/commands` every second, executes each command, and heartbeats to
   `POST /api/remote/screens` so the phone shows "projector is showing: …". Any harness page listens
   the same way — the studio or the Management App at
   `/api/localview/<self-repo-id>/app/events-feed/manage/index.html?tab=kanban&screen=projector`;
   the page hops between the two by itself when a command needs it and keeps the `?screen=` name.
2. **Direct hook, no polling needed.** Every harness page exposes
   `window.claudewebRemote(cmd) → Promise<string outcome>`; `cmd = { type, args }` with
   `type ∈ open-agent {repoId|handle} · open-view {view: kanban|status|fleet|arch|tasks|agents|settings|…} ·
   scroll {dir: up|down|latest} · zoom {dir: in|out|reset} · lane {lane: builder|ask} · stop`.
   Example: `CoreWebView2.ExecuteScriptAsync("window.claudewebRemote({type:'open-agent',args:{repoId:'pers-dec'}})")`.
   `open-agent` / `open-view` may NAVIGATE the WebView2 (an SPA route change, or a hop to the
   Management App); after a navigation the new page has the hook again. If the host pushes through
   the hook, the page's own poll ALSO executes the queued commands — so for v1 **let the page poll:
   the host only navigates to `?screen=projector` and shows/hides it**. (A `&nopoll=1` for hook-only
   hosts is not implemented yet — ask claude-web-this-app if you want it.)
3. **Auth.** `/api` needs the harness session cookie. Log in once inside the WebView2 profile (the
   harness's login page appears at `/studio`; the Operator types the access code once) — the cookie
   lives 30 days; keep a **persistent UserDataFolder** so it survives restarts.
4. **The phone remote** is `http://<this-pc-ip>:5099/remote` — a plain phone-fitted web page. Its first
   visit is a pairing screen: the big screen mints a PIN via its header pill "📺 big screen · listening
   → Pair a phone" (or the host can `POST /api/remote/pair/new` with the session cookie and show the
   PIN itself). daljinski's Harness tab should embed or link `http://<location.hostname>:5099/remote`
   (iframe; the harness sets no X-Frame-Options today — verify; if the iframe is refused, a full-screen
   link is fine).

## What to build (living-room, branch `feat/harness-remote`)

- openspec change `harness-remote` (proposal + delta to `web-remote` and `presentation-arbitration`).
- **A** `HarnessPresenter` beside `YouTubePlayer` / `WebPresenter`: a WebView2 with a persistent
  `UserDataFolder`, `Navigate(http://localhost:<port>/studio?screen=projector)` on first show; a
  presenter under the existing arbitration, so YouTube ↔ harness is a presenter switch.
- **B** `HarnessControl : ICommandHandler` (`CommandKind.System`): `harness-show` (show the presenter,
  maximize the projector window), `harness-hide` (back to the previous presenter / idle),
  `harness-cmd {type,args}` (optional in v1: `ExecuteScriptAsync` of `window.claudewebRemote`).
  Settings: harness port (default 5099), screen name (default `projector`).
- **C** daljinski phone page: a **Harness** tab in `TABS` with an `iframe` control to
  `http://<location.hostname>:5099/remote` and two buttons, "Show on projector" (`harness-show`) and
  "Back to media" (`harness-hide`); `#harness` deep link.
- **D** Verify first, the three unknowns: the harness UI inside WebView2 — `window.open` (the
  harness-window features), the local-app iframes, the login cookie surviving an app restart. Then the
  real session: phone → pair → tap an agent → the projector (WebView2) opens it. Commit, push, PR,
  `report_leg`.

**Done looks like:** from the sofa with the phone only — daljinski Harness tab → Show on projector →
the harness appears in the projector window, listening → pair once with the PIN → tap pers-dec → the
projector shows its dock.

Every detail: `openspec/changes/sofa-mode/design.md` (D2, D4, D7, D8) on `feat/sofa-mode` of birocode
(`C:\Users\admin\Desktop\playground\birocode`). Questions: ask `living room/claude-web-this-app`.
