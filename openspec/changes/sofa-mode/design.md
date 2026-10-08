# Design: sofa-mode

Investigated 2026-10-08 (read-only, both repos); **revised the same day on the Operator's
steer**: no new projector view — Chrome on the projector keeps showing the real harness (the
Kanban, the Agent tab opened exactly as a Kanban card's agent chip opens it, the Arch tab), and
the phone sends that tab commands. Facts first, then the three candidate designs, then the
recommendation and the pieces it is made of.

## Facts the design rests on

### The harness (this repo)

| Need from the sofa | What exists | Where |
|---|---|---|
| Send a prompt to an agent | `POST /api/chat` `{message, lane, sessionId?, model?}`, repo via `X-Repo-Id` header or `?repo=`; one run per (repo, lane), second gets 409 | `ChatController.cs:64-76`, `RepositoryResolver.cs:17` |
| Watch the reply | `GET /api/chat/stream?after=N&lane=` (replay + live SSE); `stream-multi` for up to 32 runs on one connection; **the dock already streams every run of its repo, whoever started it** | `ChatController.cs:231,260`, `chatStreamHub.js` |
| Read the transcript | `GET /api/sessions`, `/api/sessions/{id}/messages`, `/api/runs` | `ChatController.cs:330-432` |
| Stop | `POST /api/chat/stop?lane=` | `ChatController.cs:312` |
| Answer a question | **no endpoint** — `AskQuestionCard` sends the clicked option as the next chat message | `AskQuestionCard.jsx:25` |
| Open an agent in the UI | `openAgentHarness({sourceId, repoId, label})` — the one opener every surface uses (Kanban chip, Status, Task graph, Requests, Recurring); resolves the machine, then `focusAgentTab` / `/studio?agent=` | `client/src/components/shared/openAgent.js:56`, `agentLink.js`, `DockContext.jsx:219` |
| Which agents exist | `GET /api/dock` (server-side, shared by every device: color, waiting, unseenResult, lastPromptAt…) | `DockController.cs`, `DockRegistry` |
| Which agent a tab shows | **client-only** (`claudeweb_dock_active`, sessionStorage per browser tab) — no way to set it from outside | `DockContext.jsx:73` |
| Push to a browser | chat SSE only; the harness event feed is polled (`GET /api/events?after=`) and has an in-process `Published` hook | `HarnessEventFeed.cs:37-76` |
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
  └─ http://192.168.1.105:5099  harness UI (works, but tiny)   ◀──── Chrome on the same desktop: THE REAL HARNESS
                                                                                    ▲         (Kanban, Agent tab, Arch)
                                              ClaudeWeb.exe :5099 ──SSE / polling──┘
projector = the desktop over HDMI
```

## Candidate designs

### D-A — plain remote mouse/keyboard (what the Operator does today)

The status quo: the Operator already drives the harness on the projector with daljinski's
touchpad and `type-text`. Point, click the composer, type.

- **+** already works, nothing to build; works for *any* window on the projector.
- **−** a relative touchpad from 3 m is slow and error-prone; `type-text` goes to *whatever*
  is focused; no feedback on the phone; no question buttons — "better than nothing, but too
  much work" (Operator, 2026-10-08).
- **Verdict:** not a candidate — the baseline this change improves on; stays the fallback for
  anything the remote cannot do.

### D-B — a dedicated projector view (`/stage`) driven by the phone — dropped

The first draft of this plan: a new full-bleed "Stage" view rendering one conversation at TV
size, following a server-side Stage record the phone sets.

- **+** large type and no chrome by design; a simple inspectable record.
- **−** a *second* rendering of the conversation to keep in step with the dock; cannot show
  the Kanban, the Arch tab or anything else without rebuilding it; and — the Operator's
  steer — the real harness is already on the projector and is exactly the view wanted.
- **Verdict:** dropped 2026-10-08.

### D-C — command the real harness tab; a phone remote in the harness (CHOSEN by the Operator, 2026-10-08)

Chrome on the projector keeps showing the normal harness with one new header pill, **"📺 big
screen · listening"**. The phone's `/remote` posts `{type, args}` commands to the harness; the
listening tab executes them with the client code that already exists — `openAgentHarness`
(the Kanban chip), the header-tab navigation, the active dock's scroll container, document
zoom. Prompts go to `POST /api/chat` as always and the dock on the projector streams the run
as it does for any run. Daljinski embeds `/remote` in a Harness tab and raises Chrome.

- **+** nothing new to render — the Agent tab, the Kanban, the Arch tab and `AskQuestionCard`
  stay as they are; one command channel covers agents *and* management views *and* the arch;
  the same `{type,args}` shape as daljinski, so its Harness tab can forward commands later;
  works for any harness in the fleet; security stays the harness's.
- **−** a tab must opt in (one click, remembered) and if it is closed nothing listens — the
  phone must say so; phone-to-projector latency is poll-bound (~1 s) unless the tab holds an
  SSE subscription; zoom is page zoom, not a TV-tuned layout.
- **Verdict:** chosen — "the correct way to frame it" (Operator, 2026-10-08).

## D-C in pieces

### D1 — Remote commands

`RemoteCommandStore` (in memory, a ring of the last 100 + a monotonically increasing `seq`,
`last.json` in the data dir only for the seq):

```
POST /api/remote/commands { type, args }         → { seq }        (published: remote.command)
GET  /api/remote/commands?after=<seq>             → { seq, commands: [{ seq, type, args, at, from }] }
types (M1): open-agent { repoId | handle }, open-view { view: kanban|status|arch|fleet|… },
            scroll { dir: up|down|latest }, zoom { dir: in|out|reset }
types (M2): lane { lane }, stop, peek
GET  /api/remote/screens                          → [{ id, name, url, activeAgent, view, seenAt }]
POST /api/remote/screens { id, name, url, activeAgent, view }   (heartbeat, every 5 s while listening)
```

Behind the IP + password gates like every `/api` route; no MCP exposure in M1 (an agent must
not grab the big screen — an arch tool `show_on_big_screen` is a later question). `from` is
the caller's IP for the audit line.

### D2 — The listening tab

A header pill (Advanced capability `bigScreen`), state in `localStorage claudeweb_big_screen`
(or forced by `?screen=1`, which also names the screen). While on, `useBigScreen()` polls
`GET /api/remote/commands?after=seq` every second (an SSE sub on the existing stream-multi
multiplexer is an M2 refinement) and dispatches:

| type | executes |
|---|---|
| `open-agent` | `openAgentHarness({ repoId })` — identical to the Kanban chip's click, including its outcome line (opened / steered / unknown-agent …) which is echoed back on the heartbeat |
| `open-view` | the same navigation the header tab does (`nav.*` routes: Tasks → Kanban, Arch, Agents, Settings …) |
| `scroll` | `scrollBy` one page on the active dock's message list; `latest` scrolls to the bottom and re-enables the dock's own follow |
| `zoom` | `document.documentElement.style.zoom` in steps (reset = 1) |

Every 5 s it heartbeats what it shows; the pill turns amber when the poll fails. A tab with
the pill off ignores everything (no listener is mounted).

### D3 — `/remote` (phone)

A client route, Advanced capability `remoteView`, laid out for one thumb: a sticky header
("projector is showing: Agent · pers-dec", from `/api/remote/screens`; "no screen is
listening" when the list is empty), a view row (Kanban · Status · Arch · Fleet → `open-view`),
the agent list (`GET /api/dock` with the dock's badges: busy, waiting, unseen result; tap →
`open-agent` and the composer's target), the composer (Send → `POST /api/chat` with
`X-Repo-Id` = the opened dock's repo and `lane`; when the Arch view is open, the arch's
Operator-conversation endpoint; disabled + "busy" while a run is live, 409 shown plainly),
Stop, ▲ ▼ Latest (`scroll`), A− A+ (`zoom`). M2: the opened conversation's open
`AskUserQuestion` mirrored as big buttons (tap = send the option text — the `AskQuestionCard`
rule), `navigator.vibrate` on arrival, "peek" the last message.

### D4 — The living-room leg

In `living-room` (its own branch, PR, openspec change `harness-remote`): a `HarnessControl :
ICommandHandler` with `show-harness` (find the Chrome window whose title ends with the
harness's title, `SetForegroundWindow` + maximize; else `Process.Start` `http://localhost:5099/?screen=1`),
`mouse-scroll {dy}` and the named keys in `KeyboardControl`; a **Harness** tab in `app.js`
(`TABS` + a `type: 'iframe'` control pointing at `http://<location.hostname>:5099/remote`,
with a "Show on projector" button = `show-harness`). The harness address is derived from
`location.hostname` (the phone already reached daljinski at the PC's IP), port from a setting.
M4 option: daljinski's own controls forward `{type,args}` to `/api/remote/commands` — the
shapes already match.

### D5 — Security

No new credential. The remote routes are `/api`-gated; a phone that can open daljinski (same
LAN) can open the harness today anyway, and with the LAN bypass range configured the IP gate
admits it without the password step. A remote command can open any agent and the composer can
prompt it — the same power a LAN browser has today, no more. The embedded iframe in daljinski
is HTTP-in-HTTP (no mixed content). Daljinski itself remains unauthenticated — unchanged, and
flagged as a question.

### D6 — What stays untouched

The dock, lanes, `claudeweb_dock_active`, `openAgentHarness`, the Kanban, the Arch tab and
`AskQuestionCard` are not changed — the listener *calls* them. A desk browser with the pill
off keeps its own active tab. No WinForms/host changes in the harness (raising windows stays
with daljinski).

## D7 — Question 1: what hosts the harness on the projector (options compared)

The Operator's first thought was an embedded browser inside the living-room projector window.
Seven ways to host the big screen, rated ★ out of 5 per dimension — **5 is always the better
end** (for effort, 5 = least work). Estimates from reading both codebases on 2026-10-08, not
measurements. The same table lives in the Understanding app (tab 5) with the reason behind
every cell.

| # | Option | Dev effort · harness | Dev effort · living-room | Dev risk | Robust in daily use | Latency / feel | Fit with the projector app | Fidelity | Security | Works without the living-room app | **Total /45** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| H1 | Chrome tab with a "big screen" pill — the normal harness; one tab opts in and polls `/api/remote/commands`; daljinski only raises Chrome | ★★★★☆ | ★★★★★ | ★★★★☆ | ★★☆☆☆ | ★★★☆☆ | ★★☆☆☆ | ★★★★★ | ★★★★☆ | ★★★★★ | **34** (41) |
| H2 | Every local harness tab listens automatically (loopback = big screen) | ★★★★☆ | ★★★★★ | ★★★☆☆ | ★★★☆☆ | ★★★☆☆ | ★★☆☆☆ | ★★★★★ | ★★★★☆ | ★★★★★ | **34** (42) |
| **H3** | **WebView2 inside the living-room projector window** — a `HarnessPresenter` beside the YouTube player; commands run via `ExecuteScriptAsync(window.claudewebRemote(cmd))` (the Operator's idea) | ★★★★☆ | ★★☆☆☆ | ★★★☆☆ | ★★★★★ | ★★★★★ | ★★★★★ | ★★★★☆ | ★★★★☆ | ★★☆☆☆ | **34** (**49**) |
| H4 | Chrome `--app` window launched and raised by daljinski; the page listens as in H1 | ★★★★☆ | ★★★★☆ | ★★★★☆ | ★★★★☆ | ★★★☆☆ | ★★★☆☆ | ★★★★★ | ★★★★☆ | ★★★★☆ | **35** (45) |
| H5 | Drive the real Chrome via the DevTools Protocol (`--remote-debugging-port`) | ★★★★★ | ★★☆☆☆ | ★★☆☆☆ | ★★☆☆☆ | ★★★★☆ | ★★★☆☆ | ★★★★★ | ★★☆☆☆ | ★★☆☆☆ | **27** (36) |
| H6 | The harness's own WinForms big-screen window (WebView2 in `ClaudeWeb.exe`), in-process dispatch | ★★☆☆☆ | ★★★★☆ | ★★★☆☆ | ★★★★☆ | ★★★★★ | ★★☆☆☆ | ★★★★☆ | ★★★★★ | ★★★★★ | **34** (45) |
| H7 | Keyboard macros over today's mouse/keyboard remote (focus Chrome, Ctrl+L, type the deep link) | ★★★★★ | ★★★☆☆ | ★★☆☆☆ | ★☆☆☆☆ | ★★☆☆☆ | ★★☆☆☆ | ★★★★★ | ★★★☆☆ | ★★★☆☆ | **26** (31) |

Totals: equal weights out of 45; in brackets, the three *daily-use* dimensions (robust, feel,
fit) counted twice, out of 60. On equal weights the field is nearly tied (H4 35; H1, H2, H3,
H6 34) — effort and fleet reuse cancel robustness and fit. Weighted for what the sofa is for,
H3 leads clearly (49), then H4 and H6 (45).

Why the extremes: H1/H2/H4 lose on *robustness* and *fit* because Chrome and the living-room
projector window fight for the screen and a tab must be open and listening; H3 wins those
outright because `LivingRoom.App` already owns the projector from boot and switches presenters
(YouTube ↔ harness) under its existing arbitration, and `ExecuteScript` needs no polling — it
loses only on the last column — another machine wanting sofa mode needs `LivingRoom.App`
installed too (a one-time install, or fall back to H1); note this is *not* about driving other
fleet harnesses from this projector: the presenter navigates to any harness URL and the dispatch
table ships with every harness — and costs the most living-room work. H5 and H7 are cheap on the harness and fragile everywhere else. H6 keeps
everything inside the harness but adds a WebView2 dependency to the host app and a second GUI
competing for the projector.

**Recommendation: H3 for this living room, built on H1's parts** (H4 is the cheap runner-up
if living-room work must stay minimal). The harness ships one
dispatch table (`open-agent` via `openAgentHarness`, `open-view`, `scroll`, `zoom`) reachable
two ways: the `?screen=1` poll listener (H1 — any browser anywhere, the fleet case) and a
`window.claudewebRemote(cmd)` hook an embedding host can call directly. `LivingRoom.App` adds a
`HarnessPresenter` (WebView2, like the YouTube player) that navigates to the harness, calls the
hook for each phone command, and switches presenters under the existing arbitration — so "show
harness" and "back to YouTube" are one tap each. The phone remote can stay in the harness
(`/remote`, embedded in daljinski's Harness tab) or become native daljinski controls later (M4);
both post the same `{type,args}`. To verify first in M1: the harness UI inside WebView2 —
`window.open` features (harness-window), the local-app iframes, the login cookie in the
WebView2 profile.
