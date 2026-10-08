# Design: sofa-mode

Investigated 2026-10-08 (read-only, both repos). Facts first, then the three candidate
designs, then the recommendation and the pieces it is made of.

## Facts the design rests on

### The harness (this repo)

| Need from the sofa | What exists | Where |
|---|---|---|
| Send a prompt to an agent | `POST /api/chat` `{message, lane, sessionId?, model?}`, repo via `X-Repo-Id` header or `?repo=`; one run per (repo, lane), second gets 409 | `ChatController.cs:64-76`, `RepositoryResolver.cs:17` |
| Watch the reply | `GET /api/chat/stream?after=N&lane=` (replay + live SSE); `stream-multi` for up to 32 runs on one connection | `ChatController.cs:231,260`, `chatStreamHub.js` |
| Read the transcript | `GET /api/sessions`, `/api/sessions/{id}/messages`, `/api/runs` | `ChatController.cs:330-432` |
| Stop | `POST /api/chat/stop?lane=` | `ChatController.cs:312` |
| Answer a question | **no endpoint** — `AskQuestionCard` sends the clicked option as the next chat message | `AskQuestionCard.jsx:25` |
| Queue a prompt | `POST /api/dock/{id}/stash` | `DockController.cs:132` |
| Which agents exist | `GET /api/dock` (server-side, shared by every device: color, waiting, unseenResult, lastPromptAt…) | `DockController.cs`, `DockRegistry` |
| Which agent is *active* | **client-only** (`claudeweb_dock_active`, sessionStorage per browser tab); deep link `?agent=` | `DockContext.jsx:73,219` |
| Push to the screen | chat SSE only; the harness event feed is polled (`GET /api/events?after=`) and has an in-process `Published` hook | `HarnessEventFeed.cs:37-76` |
| Control the host desktop | nothing (no SetForegroundWindow / SendInput); Screen tab is read-only JPEGs | `ScreenController.cs` |
| Phone access | IP gate → LAN range admits 192.168.1.x; password session cookie (180 d) for `/api/*`; static files need no password | `IpFilterMiddleware.cs:67`, `PasswordAuthMiddleware.cs`, `appsettings.json` |
| Phone UI | Basic/Advanced per device; new features default to Advanced; no dedicated phone breakpoint audit | `UiModeContext.jsx:11-101` |

### The living-room app (daljinski)

| Piece | Fact |
|---|---|
| Process | `LivingRoom.App` — .NET 10 WinForms + Kestrel in one process; projector = a WebView2 window |
| Ports | remote + API `http://0.0.0.0:5077` (IPv4 only, HTTP, **no auth**); admin `127.0.0.1:5078` loopback only |
| Phone page | plain HTML/JS, `src\LivingRoom.Daljinski\wwwroot\app.js` (1053 lines): `TABS` + `CONTROLS` arrays, `renderPanel` per control type, `#<tab>` in the URL picks a tab; polls `GET /state` every 1.5 s |
| Commands | everything is `POST /commands {type,args}` → `ICommandHandler` plugins registered in `Program.cs:108` (`BuildPlugins`); `CommandKind.System` bypasses playback arbitration |
| Mouse | `mouse-move {dx,dy}` relative, clicks, `left-down/up` (auto-release after 30 s); **no scroll** |
| Keyboard | `type-text {text}` (Unicode `SendInput`, `\n` = Enter), `press-key` only `backspace`, `paste` |
| Media | YouTube iframe API inside the projector WebView2; non-YouTube URLs → `DirectMediaPlayer`; `show-projector` maximizes its window |
| Finding it | `Networking.cs` picks the first Wi-Fi/Ethernet IPv4 → `http://<ip>:5077`; QR in the Event Console and admin page |
| Branch | `feature/daljinski-text-send`, ~30 modified + many new files uncommitted (admin app, Haydar agent, playlists, mouse drag, 14 openspec changes) — **not ours to touch in this ping** |

### Topology today

```
phone (Wi-Fi, 192.168.1.x)
  └─ http://192.168.1.105:5077  daljinski page ──POST /commands──▶ LivingRoom.App ──SendInput──▶ Windows desktop
                                                                      └─ WebView2 projector window (YouTube)
  └─ http://192.168.1.105:5099  harness UI (works, but tiny)   ◀──── Chrome on the same desktop (the projector)
                                                                                    ▲
                                              ClaudeWeb.exe :5099 ──SSE / polling──┘
projector = the desktop over HDMI
```

## Candidate designs

### D-A — plain remote mouse/keyboard + a big-screen harness layout

Daljinski gains scroll + named keys; the harness gains nothing but a "TV" zoom (or Chrome's
own zoom). The Operator points, clicks the composer, types with `type-text`.

- **+** zero harness API work; works for *any* window on the projector, not only the harness;
  M0 is a day of work in living-room.
- **−** a relative touchpad from 3 m is slow and error-prone; `type-text` goes to *whatever*
  is focused — a mis-click sends the prompt into a Kanban title; no feedback on the phone
  (what is this agent doing? was it sent?); no question buttons.
- **Verdict:** keep as the fallback and as M0; not the destination.

### D-B — harness "remote API" + a sofa UI built inside daljinski

The harness exposes Stage + the existing chat routes; daljinski's `app.js` gets a Harness tab
with its own agent list and composer calling the harness API (cross-origin from :5077 to
:5099 — needs CORS or a server-side relay in `LivingRoom.Rest`, plus the harness password
stored in daljinski's settings).

- **+** one phone page for everything (YouTube, mouse, harness); daljinski's own look.
- **−** every harness UI change must be re-done in a second codebase (the question card, the
  stream parser, lanes…); the harness password ends up in a no-auth app; CORS/relay plumbing;
  the Remote would exist only where the living-room app is installed.
- **Verdict:** the integration is right, the ownership is wrong.

### D-C — Stage + Remote inside the harness; daljinski embeds and raises (recommended)

The harness owns both halves of the sofa experience as two routes of its existing client —
`/stage` (projector) and `/remote` (phone) — joined by the Stage record. Daljinski contributes
what only it can: input injection (scroll, keys, raising the browser) and a Harness tab that
embeds `/remote` in an iframe (same LAN origin rules: the harness page sets no
`X-Frame-Options` for LAN peers today — to verify in M1; else the tab is a full-screen link).

- **+** one codebase for the chat UI (the Remote reuses `ChatContext` / `chatStreamHub` /
  `AskQuestionCard` logic); works with Chrome on the projector *today*; the Remote is useful
  with no living-room app at all (any phone, any harness in the fleet); security stays the
  harness's; the living-room leg is small and independent.
- **−** two routes to keep phone- and TV-friendly; the Stage is a new persisted record; the
  "raise the browser" step still needs daljinski (or the Operator keeps Chrome full-screen).
- **Verdict:** recommended. D-A's quick wins are folded in as M0; D-B's "one app" becomes M4.

## D-C in pieces

### D1 — The Stage record

`StageStore` (data dir `stage.json`), one per harness:

```
Stage { dockId: string|null, lane: "builder"|"ask", follow: bool, fontScale: 1.0..2.0,
        view: "agent" | "status" | "kanban" | "fleet" (M3), updatedAt, setBy: "phone"|"projector"|"api" }
GET  /api/stage          → the record (+ a `seq` for cheap polling)
PUT  /api/stage {partial} → merged, published to the harness event feed as `stage.changed`
```

Behind the IP + password gates like every `/api` route; no MCP exposure in M1 (an agent
should not steal the big screen — the arch could get a `set_stage` tool later, as a question).

### D2 — `/stage` (projector)

A client route, Advanced capability `stageView`. Full-viewport, dark, `font-size` ×
`fontScale`, no dock grid: the staged agent's conversation (the dock's message list component
in a "presentation" variant), a top strip (agent color + name, lane, run state, "waiting for
you" when the last message is a question), bottom-right a small QR + URL of `/remote` while
idle. Polls `GET /api/stage` every 1.5 s (same cadence daljinski uses) and subscribes to the
staged run's SSE through the existing hub; `follow` = scroll to bottom on each chunk; a phone
`page up` sets `follow=false` and a `scrollTo` hint carried on the record
(`scroll: { dir: "up"|"down"|"latest", nonce }`), consumed once by the projector.

### D3 — `/remote` (phone)

A client route, Advanced capability `remoteView`, laid out for one thumb: a sticky header
(staged agent, state), the agent list (`GET /api/dock` with the same badges the dock shows:
busy, waiting, unseen result; tap = `PUT /api/stage {dockId}`), the composer (textarea,
Send → `POST /api/chat` with `X-Repo-Id` = staged dock's repo and `lane`; disabled + "busy"
while a run is live, 409 shown plainly), Stop, Follow ⟷ Page ▲ ▼ Latest, A− A+, lane toggle.
When the staged conversation's latest assistant message is an `AskUserQuestion`, the options
render as large buttons and the tap sends the option text as the next message (the
`AskQuestionCard` rule). The phone shows *status*, not the transcript — the projector is the
transcript (a "peek" toggle to show the last message on the phone is M2).

### D4 — The living-room leg

In `living-room` (its own branch, PR, openspec change `harness-remote`): a `HarnessControl :
ICommandHandler` with `show-harness` (find the browser window whose title ends with the
harness title, `SetForegroundWindow` + maximize; else `Process.Start` the `/stage` URL),
`mouse-scroll {dy}` and the named keys in `KeyboardControl`; a **Harness** tab in `app.js`
(`TABS` + a `type: 'iframe'` control branch pointing at `http://<same-host>:5099/remote`,
with a "Show on projector" button = `show-harness`). The harness address is derived from
`location.hostname` (the phone already reached daljinski at the PC's IP), port from a setting.

### D5 — Security

No new credential. The Remote and Stage are `/api`-gated; a phone that can open daljinski
(same LAN) can open the harness today anyway, and with the LAN bypass range configured the
IP gate admits it without the password step. The embedded iframe in daljinski is HTTP-in-HTTP
(no mixed content). Daljinski itself remains unauthenticated — unchanged, and flagged as a
question. The Stage record is a *view* preference, not a privilege: it cannot send prompts.

### D6 — What stays untouched

The dock, lanes and `claudeweb_dock_active` (client-only, per browser) are not changed — the
Stage is a separate notion for *one designated big screen*; a desk browser keeps its own
active tab. No WinForms/host changes in the harness (raising windows stays with daljinski).
