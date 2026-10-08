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
    { id: 'A', name: 'Plain remote mouse/keyboard + Chrome zoom', verdict: 'fallback / M0', tone: 'warn',
      how: 'daljinski gains scroll + keys; the Operator zooms Chrome on the projector. Point, click the composer, type with type-text.',
      plus: ['Zero harness API work', 'Works for any window on the projector, not only the harness', 'A day of work in living-room'],
      minus: ['A relative touchpad from 3 m is slow and error-prone', 'type-text goes to whatever is focused — blind', 'No feedback on the phone: busy? sent? asking?', 'No question buttons'],
      score: { effort: 1, comfort: 1, reuse: 3, security: 2 } },
    { id: 'B', name: 'A dedicated projector view (/stage) driven by the phone', verdict: 'dropped — the Operator wants the real harness on screen', tone: 'warn',
      how: 'The first draft: a new full-bleed "Stage" view rendering one conversation at TV size, following a server-side Stage record set by the phone.',
      plus: ['Large type and no chrome by design', 'A Stage record is a simple, inspectable state'],
      minus: ['A second rendering of the conversation to keep in step with the dock', 'Cannot show the Kanban, the Arch tab or anything else without re-building it', 'The Operator already has the real harness on the projector and wants exactly that view'],
      score: { effort: 2, comfort: 2, reuse: 1, security: 3 } },
    { id: 'C', name: 'Command the real harness tab; a phone remote in the harness', verdict: 'recommended (revised)', tone: 'ok',
      how: 'Chrome on the projector keeps showing the normal harness, with "big screen listening" switched on. The phone\'s /remote posts {type,args} commands; the listening tab executes them with the code that already exists (openAgentHarness = the Kanban chip, header-tab navigation, the dock\'s scroll). Prompts go to POST /api/chat as always. daljinski embeds /remote and raises Chrome.',
      plus: ['Nothing new to render: the Agent tab, Kanban, Arch tab and AskQuestionCard as they are', 'One command channel covers agents AND management views AND the arch', 'The same {type,args} shape as daljinski — the Harness tab can forward commands later', 'Works for any harness in the fleet; security stays the harness\'s'],
      minus: ['A tab must opt in to listening (one click, remembered); if that tab is closed, nothing listens — the phone must say so', 'Phone-to-projector round trip is poll-bound (~1 s) unless the tab holds an SSE subscription', 'Zoom is page zoom, not a TV-tuned layout'],
      score: { effort: 3, comfort: 3, reuse: 3, security: 3 } },
  ],
  // --- Phased plan ----------------------------------------------------------------------------
  plan: [
    { id: 'M0', name: 'Sofa today', repo: 'living-room', done: 'The Operator mouse-and-types the harness from the sofa with the touchpad, Chrome zoomed to 150 %.', items: ['mouse-scroll {dy} + a scroll strip on the touchpad card', 'press-key: enter, tab, escape, arrows, pageup/pagedown, home/end', 'Feed the pain points into M1'] },
    { id: 'M1', name: 'Open an agent from the phone, send a prompt', repo: 'both', done: 'Tap an agent on the phone → the harness tab on the projector opens it exactly like the Kanban chip does → a prompt typed on the phone streams in that dock.', items: ['Harness: POST/GET /api/remote/commands (ring buffer, seq, remote.command on the feed) + /api/remote/screens heartbeat', 'Harness: the "📺 big screen" header pill; the listener runs open-agent / open-view / scroll / zoom with existing client code', 'Harness: /remote view (agent list, view row, composer → POST /api/chat, Stop, ▲ ▼ Latest, A− A+, "projector is showing")', 'living-room: Harness tab (iframe → /remote), show-harness command', 'Verify on the real projector; one PR per repo'] },
    { id: 'M2', name: 'A whole sofa session', repo: 'harness', done: 'Pick → read → prompt → watch → answer a question → talk to the arch → back to the Kanban, without leaving the sofa.', items: ['Question cards mirrored as phone buttons; "needs you" badge; vibrate', 'lane {builder|ask}, stop, tool-call ticker on the phone from the stream', 'Composer target = the arch\'s Operator conversation when the Arch view is open', '"Peek" the last message on the phone'] },
    { id: 'M3', name: 'More screens, more input', repo: 'harness', done: 'Any management view on the big screen; voice; the hub too.', items: ['open-view for Status / Fleet / Recurring / Deploys; the listener answers with its view list', 'Voice dictation in the composer (Web Speech API)', 'A fleet picker on the remote: command the hub\'s listening tab (its own harness, same API)'] },
    { id: 'M4', name: 'One app', repo: 'both', done: 'The phone has one page; the remote is safe off the LAN bypass.', items: ['daljinski forwards its own Harness-tab controls as remote commands, if preferred over the iframe (decide after M2)', 'Pairing PIN for /remote when LanBypassCidrs is empty; PWA icon', 'Archive the change; baseline spec sofa-mode'] },
  ],
  // --- Open questions ------------------------------------------------------------------------
  questions: [
    ['Which tab listens?', 'One Chrome tab on the projector, opted in with the header pill (remembered per browser) — or should the harness treat EVERY tab on the living-room PC as a listener (by client IP = 127.0.0.1)? One explicit tab is safer; "every local tab" needs no click after a Chrome restart.'],
    ['Where does the phone remote live?', 'In the harness (/remote, recommended — works for every harness) with daljinski embedding it, or built inside daljinski\'s app.js, forwarding its controls as remote commands (one look, two codebases)?'],
    ['Security on the LAN', 'The harness admits 192.168.1.x without a password (LanBypassCidrs) and daljinski has no auth at all. A remote command can open any agent and the composer can prompt it. Fine for home, or should /remote ask for a pairing PIN anyway?'],
    ['Scope of M1', 'open-agent + open-view (Kanban, Arch) + scroll + zoom + prompt to the opened agent — agreed? Or should answering questions (M2) be in the first milestone?'],
    ['Live typing on the projector?', 'Should what is being typed on the phone appear on the projector before Send (nice to read along; also shows typos to the room)?'],
    ['Which phone?', 'iOS or Android — matters for keyboard behaviour, vibration, voice dictation (M3) and the home-screen icon (M4).'],
    ['The arch from the sofa', 'Open the Arch tab and prompt the Operator conversation from the phone — M2 as planned, or M1?'],
    ['M0 first?', 'Spend a day on daljinski scroll + keys so the sofa works (clumsily) this week, or go straight to M1?'],
  ],
};
