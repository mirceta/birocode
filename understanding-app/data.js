// Understanding app — Sofa mode (fleet task 68090860). Facts from a read-only look at both repos on 2026-10-08;
// revised the same day on the Operator's steer: NO new projector view — the projector shows the normal harness in
// Chrome, and the phone sends it commands. Transcribed from openspec/changes/sofa-mode/{proposal,design,tasks}.md.
window.SOFA = {
  // --- Today: the chain from the phone to the projector --------------------------------------
  today: [
    { ico: '📱', name: 'Phone (Wi-Fi, 192.168.1.x)', what: 'A browser. Opens daljinski at http://192.168.1.105:5077 (QR in the Event Console). Could open the harness at :5099 too — it passes the LAN bypass — but that is the thing the Operator wants to stop doing: reading on a phone.' },
    { ico: '🎛️', name: 'daljinski (LivingRoom.App :5077)', what: 'Plain HTML/JS page, no auth, HTTP, IPv4 only. Every control is POST /commands {type,args} → ICommandHandler plugins. Polls GET /state every 1.5 s.' },
    { ico: '🖥️', name: 'Living-room PC (Windows)', what: 'Mouse/keyboard injected with Win32 SendInput: relative mouse-move, clicks, drag; type-text (Unicode, \\n = Enter); press-key only backspace / paste. No scroll wheel, no Tab/Esc/arrows. YouTube plays in its own WebView2 projector window.' },
    { ico: '🤖', name: 'Harness (ClaudeWeb.exe :5099)', what: 'The web UI shown in Chrome on the same desktop — the real thing, with the Kanban, the Agent tab, the Arch tab. Chat is POST /api/chat + SSE; the dock list is server-side (GET /api/dock) but WHICH tab a browser shows is that browser\'s own state. Nothing can tell a browser tab "open this agent" from outside — yet.' },
    { ico: '📽️', name: 'Projector (HDMI = the desktop)', what: 'Shows whatever the desktop shows: Chrome with the harness, or the living-room projector window. It is a perfectly good harness screen already; it just takes no orders.' },
  ],
  gaps: [
    ['No way to command a harness tab', 'A browser tab decides for itself what it shows (sessionStorage). The Kanban chip opens an agent — but only from inside that same browser.'],
    ['No phone-sized remote', 'The harness UI on a phone is the full dock; daljinski knows mouse and text, not agents.'],
    ['Blind typing', 'type-text goes to whatever window is focused — a mis-click sends a prompt into a Kanban title.'],
    ['No scroll, few keys', 'daljinski cannot scroll a conversation and has no Esc/Tab/arrows.'],
    ['No answer endpoint', 'A question card is answered by sending the option as the next chat message (AskQuestionCard does exactly that).'],
  ],
  // --- The sofa session, step by step (target experience, design D-C revised) ------------------
  // proj.screen: kanban | agent | arch — the REAL harness views, as Chrome on the projector shows them today.
  session: [
    { t: 'Sit down', phone: { screen: 'remote', showing: 'Kanban' , note: 'Open daljinski → Harness tab (or /remote directly). The agent list loads from GET /api/dock. The header says what the projector is showing right now, reported by the listening tab.' }, proj: { screen: 'kanban', note: 'The harness in Chrome, exactly where the Operator left it — the Management app\'s Kanban (a real screenshot of this machine\'s board). The only new thing on screen: the header pill "📺 big screen · listening", switched on once in this browser.' }, api: 'GET /api/dock · GET /api/remote/screens' },
    { t: 'Pick an agent', phone: { screen: 'remote', pick: 'pers-dec', showing: 'Kanban → Agent', note: 'Tap "pers-dec" (badge: unseen result). The phone posts one command, in the same {type,args} shape daljinski uses.' }, proj: { screen: 'agent', agent: 'pers-dec', note: 'The listening tab runs openAgentHarness({repoId}) — the SAME call the Kanban card chip makes — and the Agent tab shows pers-dec\'s dock, as it always has.' }, api: 'POST /api/remote/commands {type:"open-agent", args:{repoId}}' },
    { t: 'Read', phone: { screen: 'remote', pick: 'pers-dec', showing: 'Agent · pers-dec', ctl: 'up', note: 'Thumb on ▲ / ▼ pages the conversation on the projector; "Latest" jumps back down. A− / A+ zooms the page.' }, proj: { screen: 'agent', agent: 'pers-dec', scroll: 'up', note: 'The tab scrolls the active dock\'s message list by one page; nothing else changes.' }, api: 'POST /api/remote/commands {type:"scroll", args:{dir:"up"}}' },
    { t: 'Type a prompt', phone: { screen: 'compose', pick: 'pers-dec', showing: 'Agent · pers-dec', text: 'Pull this month\'s bank statement into the ledger and show me the diff.', note: 'The phone keyboard. The projector shows nothing until Send (a live typing preview is an open question).' }, proj: { screen: 'agent', agent: 'pers-dec', note: 'Still pers-dec\'s dock, waiting.' }, api: '—' },
    { t: 'Send', phone: { screen: 'remote', pick: 'pers-dec', showing: 'Agent · pers-dec', state: 'running', note: 'Send → POST /api/chat with X-Repo-Id = pers-dec, lane builder — straight to the harness, not through the screen. Composer locks, "running" with a Stop button.' }, proj: { screen: 'agent', agent: 'pers-dec', run: true, note: 'The dock already streams every run of its repo: the user bubble appears, the reply streams. No new plumbing for this step.' }, api: 'POST /api/chat {message, lane} (X-Repo-Id)' },
    { t: 'Watch it work', phone: { screen: 'remote', pick: 'pers-dec', showing: 'Agent · pers-dec', state: 'running', note: 'Status: running, tool calls ticking (from the same stream). Lie back.' }, proj: { screen: 'agent', agent: 'pers-dec', run: true, note: 'Tool cards and text in the dock, as today.' }, api: 'SSE /api/chat/stream (both the dock and the phone)' },
    { t: 'Answer a question', phone: { screen: 'question', pick: 'pers-dec', showing: 'Agent · pers-dec', q: 'Two statements match October. Which one?', opts: ['NLB · 1.–31.10.', 'Revolut · Oct', 'Both'], note: 'The phone vibrates and mirrors the AskUserQuestion options as big buttons. A tap sends the option as the next message — the AskQuestionCard rule (M2).' }, proj: { screen: 'agent', agent: 'pers-dec', question: true, note: 'The real AskQuestionCard is on the projector; the Operator reads it there and taps on the phone.' }, api: 'POST /api/chat {message: "<option>"}' },
    { t: 'Talk to the arch', phone: { screen: 'remote', pick: null, showing: 'Agent → Arch', arch: true, note: 'Tap "Arch" in the phone\'s view row. The same command type opens a management view instead of an agent; the composer now writes to the arch\'s Operator conversation.' }, proj: { screen: 'arch', note: 'The listening tab switches to Management → Arch — the Operator conversation with Chat / Tools / History / Loops — exactly as clicking that tab would. (The screenshot\'s conversation is empty only because the isolated copy it was taken from had no arch history.)' }, api: 'POST /api/remote/commands {type:"open-view", args:{view:"arch"}}' },
    { t: 'Done', phone: { screen: 'remote', pick: null, showing: 'Arch → Kanban', note: 'Tap "Kanban": the projector goes back to the board. Pick the next agent, or switch to YouTube in the same daljinski page.' }, proj: { screen: 'kanban', note: 'Back on the Kanban where the session started. The Operator never touched the keyboard.' }, api: 'POST /api/remote/commands {type:"open-view", args:{view:"kanban"}}' },
  ],
  agents: [
    { name: 'pers-dec', color: '#d29922', badge: 'unseen result' },
    { name: 'living-room', color: '#3fb950', badge: 'busy' },
    { name: 'Claude Web (this app)', color: '#5ea0ef', badge: 'waiting for you' },
    { name: 'prg', color: '#a371f7', badge: '' },
    { name: 'youtube-transcript', color: '#e5484d', badge: '' },
  ],
  kanban: [
    { col: 'Todo', cards: [['prg: export the invoice register', 'prg', '#a371f7'], ['Sofa mode: plan', 'Claude Web', '#5ea0ef']] },
    { col: 'In progress', cards: [['Pull personal finances into our app', 'pers-dec', '#d29922'], ['daljinski: text send', 'living-room', '#3fb950']] },
    { col: 'PR opened', cards: [['Status: double-click agent chip', 'Claude Web', '#5ea0ef']] },
  ],
  // --- Split of work --------------------------------------------------------------------------
  split: {
    harness: [
      ['Remote commands', 'POST /api/remote/commands {type,args} → a short per-harness ring buffer with seq, published as remote.command on the event feed. Types: open-agent, open-view, scroll, zoom, lane, stop.'],
      ['The listening tab', 'A header pill "📺 big screen" (remembered per browser, or ?screen=1). While on, the normal harness tab polls GET /api/remote/commands?after=seq and runs each command with the client code that already exists: openAgentHarness (the Kanban chip), the header-tab navigation, the dock\'s scroll container, document zoom. It heartbeats what it shows to GET/POST /api/remote/screens.'],
      ['/remote route', 'Phone view (Advanced capability remoteView): agent list with badges, a view row (Kanban · Status · Arch · Fleet), tap-to-open, composer → POST /api/chat to the opened agent (or the arch\'s Operator conversation), Stop, ▲ ▼ Latest, A− A+, question buttons (M2), "projector is showing: …".'],
      ['Nothing new to render', 'No new big-screen view. The Agent tab, the Kanban, the Arch tab and AskQuestionCard stay exactly as they are; the remote only tells the tab what to open.'],
    ],
    living: [
      ['Harness tab', 'A TABS entry + an iframe/link control to http://<location.hostname>:5099/remote, with "Show on projector".'],
      ['show-harness', 'New ICommandHandler: raise the Chrome window whose title is the harness (SetForegroundWindow + maximize) or start it at /?screen=1.'],
      ['Scroll + keys (M0)', 'mouse-scroll {dy}; press-key enter / tab / escape / arrows / pageup / pagedown / home / end.'],
      ['Untouched', 'Media, YouTube, the admin app, the Haydar agent. The uncommitted feature/daljinski-text-send work is not ours to touch in this ping.'],
    ],
  },
  // --- Candidate designs ----------------------------------------------------------------------
  designs: [
    { id: 'A', name: 'Plain remote mouse/keyboard (what the Operator does today)', verdict: 'today\'s practice — "better than nothing, but too much work" (Operator, 2026-10-08)', tone: 'warn',
      how: 'The status quo: the Operator already drives the harness on the projector with daljinski\'s touchpad and text-send. Point, click the composer, type with type-text. Scroll + keys would ease it a little; it stays the fallback for anything the remote cannot do.',
      plus: ['Already works — nothing to build', 'Works for any window on the projector, not only the harness'],
      minus: ['A relative touchpad from 3 m is slow and error-prone', 'type-text goes to whatever is focused — blind', 'No feedback on the phone: busy? sent? asking?', 'No question buttons', 'Too much work per action — the reason for this card'],
      score: { effort: 1, comfort: 1, reuse: 3, security: 2 } },
    { id: 'B', name: 'A dedicated projector view (/stage) driven by the phone', verdict: 'dropped — the Operator wants the real harness on screen', tone: 'warn',
      how: 'The first draft: a new full-bleed "Stage" view rendering one conversation at TV size, following a server-side Stage record set by the phone.',
      plus: ['Large type and no chrome by design', 'A Stage record is a simple, inspectable state'],
      minus: ['A second rendering of the conversation to keep in step with the dock', 'Cannot show the Kanban, the Arch tab or anything else without re-building it', 'The Operator already has the real harness on the projector and wants exactly that view'],
      score: { effort: 2, comfort: 2, reuse: 1, security: 3 } },
    { id: 'C', name: 'Command the real harness tab; a phone remote in the harness', verdict: 'CHOSEN — "the correct way to frame it" (Operator, 2026-10-08)', tone: 'ok',
      how: 'Chrome on the projector keeps showing the normal harness, with "big screen listening" switched on. The phone\'s /remote posts {type,args} commands; the listening tab executes them with the code that already exists (openAgentHarness = the Kanban chip, header-tab navigation, the dock\'s scroll). Prompts go to POST /api/chat as always. daljinski embeds /remote and raises Chrome.',
      plus: ['Nothing new to render: the Agent tab, Kanban, Arch tab and AskQuestionCard as they are', 'One command channel covers agents AND management views AND the arch', 'The same {type,args} shape as daljinski — the Harness tab can forward commands later', 'Works for any harness in the fleet; security stays the harness\'s'],
      minus: ['A tab must opt in to listening (one click, remembered); if that tab is closed, nothing listens — the phone must say so', 'Phone-to-projector round trip is poll-bound (~1 s) unless the tab holds an SSE subscription', 'Zoom is page zoom, not a TV-tuned layout'],
      score: { effort: 3, comfort: 3, reuse: 3, security: 3 } },
  ],
  // --- Phased plan ----------------------------------------------------------------------------
  plan: [
    { id: 'M0', name: 'Today (status quo, nothing to build)', repo: 'living-room', done: 'Already the case: daljinski\'s touchpad and text-send — "better than nothing, but too much work".', items: ['No work; the pain points are the brief.'] },
    { id: 'E2E', name: 'Sofa mode, end to end', repo: 'both', done: 'From the sofa, with the phone only: pair once with the PIN on the TV → pick an agent → the projector opens it as the Kanban chip would → read (scroll, zoom) → dictate and send a prompt → watch it run → answer its question → talk to the arch → back to the Kanban. Two PRs, merged.', items: [
      'Harness · server: RemoteCommandStore + RemoteController — POST/GET /api/remote/commands (ring, seq, remote.command on the feed), GET/POST /api/remote/screens (heartbeat), pairing: POST /api/remote/pair/new (authenticated; a 6-digit PIN, 5 min, single use) and POST /api/remote/pair {pin} (IP-gated, password-exempt; mints the normal session cookie; lockout on bad tries)',
      'Harness · client: the "📺 big screen" header pill + useBigScreen() poll listener + window.claudewebRemote(cmd) hook; one dispatch table: open-agent → openAgentHarness, open-view → header navigation, scroll on the active dock\'s message list, zoom, lane, stop; heartbeat; "Pair a phone" shows the PIN large',
      'Harness · client: /remote — a web page fitted for a phone (Android): pairing screen; "projector is showing: …" / "no screen is listening"; view row (Kanban · Status · Arch · Fleet); agent list with busy / waiting / unseen badges; composer → POST /api/chat with the opened repo + lane (the arch\'s Operator conversation when the Arch view is open); Stop; ▲ ▼ Latest; A− A+; peek (the last reply, collapsed); the open AskUserQuestion mirrored as buttons; i18n en/tr; capabilities remoteView + bigScreen (Advanced)',
      'Harness · verify: xunit for the store, the PIN rules and the routes; node tests for the dispatch table and the remote\'s pure helpers; Playwright: a listening tab + a phone-sized tab in one run, a tap opens the agent; a real session on this machine\'s projector',
      'living-room (its agent, driven by this one): openspec harness-remote; HarnessPresenter (WebView2) that navigates to the harness URL, keeps the login, calls window.claudewebRemote per command and switches presenters under the existing arbitration; commands harness-show / harness-hide / harness-cmd {type,args}; a Harness tab in daljinski that embeds /remote with "Show on projector"; verify the WebView2 unknowns first (window.open features, local-app iframes, cookie)',
      'Close: both PRs merged and verified on GitHub (report_leg per leg); archive the OpenSpec change into a baseline spec sofa-mode',
    ] },
    { id: 'Later', name: 'Not now', repo: 'both', done: 'Ideas kept, deliberately out of this card.', items: ['"From anywhere" (off the LAN): reachability — add-global-exposure, the public nextN.birokrat.si addresses; the pairing cookie already carries the login', 'A fleet picker on the remote (command the hub\'s big screen)', 'daljinski native Harness-tab controls instead of the embed', 'Web Push / PWA — declined for now; voice — Wispr Flow does it'] },
  ],  // --- Question 1: what hosts the harness on the projector and how it receives commands ----------
  // stars: 5 = best in that dimension (for effort: 5 = least work). why: the one-line reason per cell.
  hosts: {
    dims: [
      ['devHarness', 'Dev effort · harness', 'How much new code the harness needs (5 = almost none)'],
      ['devLiving', 'Dev effort · living-room', 'How much new code daljinski / LivingRoom.App needs (5 = almost none)'],
      ['risk', 'Development risk', 'Unknowns and fragile parts that could eat the estimate (5 = few)'],
      ['robust', 'Robustness in daily use', 'Survives a Chrome restart, a reboot, nobody at the PC; never "no screen is listening" (5 = always up)'],
      ['feel', 'Latency / feel', 'Tap on the phone → change on the projector (5 = instant)'],
      ['fit', 'Fit with the projector app', 'Plays well with YouTube and the living-room projector window — show, hide, arbitrate (5 = native)'],
      ['fidelity', 'Fidelity', 'Looks and behaves exactly like the harness in Chrome today (5 = identical)'],
      ['security', 'Security', 'New surface opened on the LAN or the PC (5 = none)'],
    ],
    options: [
      { id: 'H1', name: 'Chrome tab with a "big screen" pill', who: 'harness', summary: 'The normal harness in Chrome; one tab opts in (pill, remembered) and polls GET /api/remote/commands. daljinski only raises Chrome (show-harness).',
        how: 'Pill in the header → useBigScreen() polls every second → dispatch table (openAgentHarness, header navigation, scroll, zoom) → heartbeat to /api/remote/screens.',
        s: { devHarness: [4, 'routes + a hook + the pill; the dispatch reuses existing client code'], devLiving: [5, 'nothing, or a show-harness that raises Chrome'], risk: [4, 'all known parts; only the window-raising is OS-fiddly'], robust: [2, 'the tab must exist and have the pill on; Chrome closed = no screen; the phone must say so'], feel: [3, 'poll-bound ~1 s (SSE later)'], fit: [2, 'Chrome and the living-room projector window fight for the screen; raising is a separate step'], fidelity: [5, 'it IS Chrome'], security: [4, 'behind the existing /api gates; no new credential'] } },
      { id: 'H2', name: 'Every local harness tab listens automatically', who: 'harness', summary: 'Same as H1 but no pill: the harness treats any tab whose client IP is loopback as a big screen.',
        how: 'Server marks commands for "local screens"; every tab opened on the living-room PC itself executes them.',
        s: { devHarness: [4, 'as H1 minus the pill, plus a loopback rule'], devLiving: [5, 'nothing'], risk: [3, "several local tabs all react; the Operator's own desk tab on this PC moves too"], robust: [3, 'no click after a Chrome restart, but a tab must still be open'], feel: [3, 'poll-bound ~1 s'], fit: [2, 'as H1'], fidelity: [5, 'Chrome'], security: [4, 'loopback only'] } },
      { id: 'H3', name: 'WebView2 inside the living-room projector window', who: 'living-room', summary: "The Operator's idea: LivingRoom.App hosts the harness in its own WebView2 presenter (like the YouTube player) and executes phone commands directly in that page.",
        how: 'New HarnessPresenter next to YouTubePlayer / WebPresenter: Navigate(http://localhost:5099/?screen=1); commands arrive as POST /commands {type:"harness-…"} and run via CoreWebView2.ExecuteScriptAsync(window.claudewebRemote(cmd)) — the same dispatch table H1 uses, without the poll. Login once in the WebView2 profile (cookie persists).',
        s: { devHarness: [4, 'the dispatch table + a window.claudewebRemote hook; the pill/poll become optional'], devLiving: [2, 'a presenter, a command handler, arbitration rules, the WebView2 profile/auth, a Harness tab on the phone'], risk: [3, 'WebView2 is already in use for YouTube, so the engine is known; unknowns: window.open features, the local-app iframes, cookie/auth inside the profile'], robust: [5, 'LivingRoom.App owns the projector from boot; no clicks, no stray tabs; "show harness" is its own presenter switch'], feel: [5, 'ExecuteScript is immediate; no polling'], fit: [5, 'native: YouTube ↔ harness is a presenter switch under the existing arbitration'], fidelity: [4, 'same Chromium engine; pop-up / new-window behaviours need checking (harness-window features)'], security: [4, 'localhost only; daljinski itself stays unauthenticated as today'] } },
      { id: 'H4', name: 'Chrome --app window launched and raised by daljinski', who: 'both', summary: 'daljinski starts chrome --app=http://localhost:5099/?screen=1 (no tabs, no URL bar) and raises it on show-harness; the page listens as in H1.',
        how: 'HarnessControl: Process.Start chrome.exe --app=… ; SetForegroundWindow on later calls. The harness side is exactly H1 (?screen=1 switches the pill on).',
        s: { devHarness: [4, 'H1'], devLiving: [4, 'launch + raise a window; a setting for the Chrome path'], risk: [4, 'Chrome flags are stable; raising windows is the fiddly bit'], robust: [4, 'daljinski relaunches it when missing; auto-listens via ?screen=1'], feel: [3, 'poll-bound ~1 s'], fit: [3, 'still a second window beside the projector window, but daljinski manages it'], fidelity: [5, 'Chrome'], security: [4, 'as H1'] } },
      { id: 'H5', name: 'Drive the real Chrome via DevTools Protocol', who: 'living-room', summary: 'Chrome runs with --remote-debugging-port; daljinski connects over CDP and navigates / evaluates JS in the existing harness tab. No harness change at all.',
        how: 'WebSocket to localhost:9222, Page.navigate / Runtime.evaluate on the tab whose URL is the harness.',
        s: { devHarness: [5, 'nothing'], devLiving: [2, 'a CDP client, tab discovery, reconnects'], risk: [2, 'Chrome must be started with the flag every time; tab ids change; protocol drift'], robust: [2, 'dies whenever Chrome is started normally'], feel: [4, 'direct'], fit: [3, 'as H1 for the window fight'], fidelity: [5, 'Chrome'], security: [2, 'the debugging port is full control of the browser for anything on the PC'] } },
      { id: 'H6', name: "The harness's own WinForms big-screen window (WebView2 in ClaudeWeb.exe)", who: 'harness', summary: 'ClaudeWeb.exe is already a WinForms app on this PC: give it a Big-screen form hosting its own UI in WebView2 and dispatch remote commands in-process.',
        how: "New form + WebView2 dependency in the harness; POST /api/remote/commands dispatches straight into the form's page; show via the API.",
        s: { devHarness: [2, 'new WebView2 dependency in the host app, a form, Self-Development build/deploy implications'], devLiving: [4, 'show-harness = one API call'], risk: [3, 'WebView2 runtime on every fleet PC; two GUIs (harness, living-room) competing for the projector'], robust: [4, 'up whenever the harness is'], feel: [5, 'in-process'], fit: [2, 'the living-room projector window and the harness window fight; no shared arbitration'], fidelity: [4, 'same engine, own window chrome'], security: [5, 'nothing new on the network'] } },
      { id: 'H7', name: "Keyboard macros over today's mouse/keyboard remote", who: 'living-room', summary: 'No new channel: "open agent X" = focus Chrome, Ctrl+L, type the /studio?agent=X URL, Enter — daljinski macros over SendInput.',
        how: "A macro layer in daljinski's KeyboardControl; the harness deep links do the rest.",
        s: { devHarness: [5, 'nothing'], devLiving: [3, 'macros + focus handling'], risk: [2, 'blind: whatever window is focused gets the keystrokes'], robust: [1, 'breaks on any focus change, dialog or layout shift'], feel: [2, 'visible typing, a second or two'], fit: [2, 'as today'], fidelity: [5, 'Chrome'], security: [3, 'as today'] } },
    ],
    combo: [
      ['Shared by H1 and H3', 'One dispatch table in the harness client (open-agent → openAgentHarness, open-view → header navigation, scroll, zoom) and the /remote phone page. Built once.'],
      ['H1 adds', 'The "big screen" pill + a poll of GET /api/remote/commands (~100 lines) — any Chrome tab, on any machine, can be the big screen with one click.'],
      ['H3 adds', 'A window.claudewebRemote(cmd) hook (~10 lines) for a host to call; in living-room a HarnessPresenter (WebView2) that navigates to a harness URL, calls the hook per phone command, and switches presenters under the existing arbitration.'],
      ['What the combination gives', 'Here: the projector window hosts the harness natively (H3\'s robustness, feel, fit). Elsewhere: any tab, one click (H1). The phone remote is identical in both and does not know which one is listening — "choose which way you use it" is literally true, per machine, per evening.'],
      ['What it does not give', 'H3\'s WebView2 unknowns still have to be verified first; an H1 screen is still only as robust as H1. The combination lets you pick the strong option where it exists; it does not average the weaknesses away.'],
    ],
    phoneClient: [
      ['The thought', 'A simple phone app to message the agents from anywhere, without seeing the harness — the screen is too small for it.'],
      ['Answer', '/remote IS that app, provided it is designed as a phone client of the harness first and a projector remote second. Cheap to decide now, expensive to retrofit later.'],
      ['What it changes in M1', 'Useful with NO screen listening: agent list with badges, composer, status, Stop, and "peek" (the last reply readable on the phone — pulled from M2 into M1). The big screen is an optional target, never a prerequisite. A PWA: home-screen icon, full screen; later Web Push so the phone buzzes when an agent asks.'],
      ['Answers question 2', 'The remote lives in the harness — away from home there is no daljinski. daljinski\'s Harness tab embeds the same page.'],
      ['"From anywhere"', 'Purely a reachability question. Today the harness is LAN-only, but the pieces exist: the add-global-exposure change in the OpenSpec backlog, public https addresses already in use for spacex / monster / next7 (nextN.birokrat.si), and the 180-day trusted-device cookie as the phone\'s login. Not part of this card; nothing in M1 should assume the LAN.'],
      ['Native app?', 'Only if the PWA ever falls short. Web Push on iOS needs the home-screen install, which the PWA gives anyway.'],
    ],
    recommendation: "H3 for this living room, built on H1's parts (H4 is the cheap runner-up if living-room work must stay minimal). H3 leads on both weightings — 32/40 with equal weights, 47/55 with the daily-use dimensions (robustness, feel, fit) counted double. The harness ships one dispatch table (open-agent via openAgentHarness, open-view, scroll, zoom) reachable two ways: the ?screen=1 poll listener (H1 — any browser anywhere, the fleet case) and a window.claudewebRemote(cmd) hook an embedding host can call directly. LivingRoom.App adds a HarnessPresenter (WebView2, like the YouTube player) that navigates to the harness, calls the hook for each phone command, and switches presenters under the existing arbitration — so \"show harness\" and \"back to YouTube\" are one tap each. The phone remote can stay in the harness (/remote, embedded in daljinski's Harness tab) or become native daljinski controls later (M4); both post the same {type,args}.",
  },
  // --- Open questions ------------------------------------------------------------------------
  questions: [
    ['None open', 'All seven answered on 2026-10-08 — see Decided. Technical unknowns (the harness UI inside WebView2: window.open features, the local-app iframes, the login cookie in the WebView2 profile) are verified by building, not by asking.'],
  ],  decided: [
    ['Design', 'D-C — command the real harness tab from a phone remote in the harness. D-A is what the Operator does today (daljinski touchpad + text-send): "better than nothing, but too much work". (Operator, 2026-10-08)'],
    ['Projector view', 'None new — the real harness; the Kanban chip\'s own opener (openAgentHarness) is what a phone tap triggers.'],
    ['1 · Who hosts the big screen', 'H3 — a WebView2 HarnessPresenter inside the living-room projector window — built on H1\'s parts (the dispatch table + the window.claudewebRemote hook; the poll listener + pill stay so any Chrome tab can be a big screen too).'],
    ['2 · Where the remote lives', 'In the harness: /remote, a web page fitted for a phone. daljinski\'s Harness tab embeds it.'],
    ['3 · Security', 'A pairing PIN, absolutely. The harness shows a short-lived PIN on the big screen (or in Settings); the phone enters it once at /remote and gets the normal 180-day session cookie. No long password typed on the phone; nothing on the LAN gets the remote without pairing.'],
    ['4 + 7 · Scope', 'End to end in one go, not milestone by milestone: open-agent, open-view (Kanban, Arch, Status, Fleet…), scroll, zoom, prompt, Stop, lane, peek, question buttons, the arch\'s Operator conversation, pairing — harness PR + living-room PR.'],
    ['5 · Live typing on the projector', 'No. The Operator dictates with Wispr Flow on the phone and presses Send when satisfied. (So no in-app voice either.)'],
    ['6 · Phone', 'Android. NOT a PWA — a plain web app whose design fits a phone, the way daljinski is. No manifest, no Web Push.'],
    ['"Fleet reuse" as a dimension', 'Dropped as a non-factor: the living-room app is installed wherever sofa mode is wanted.'],
    ['M0', 'Not a milestone — it is the status quo.'],
  ],};
