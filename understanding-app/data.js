// Understanding app — Sofa mode (fleet task 68090860). Facts from a read-only look at both repos on 2026-10-08.
// Transcribed from openspec/changes/sofa-mode/{proposal,design,tasks}.md.
window.SOFA = {
  // --- Today: the chain from the phone to the projector --------------------------------------
  today: [
    { ico: '📱', name: 'Phone (Wi-Fi, 192.168.1.x)', what: 'A browser. Opens daljinski at http://192.168.1.105:5077 (QR in the Event Console). Could open the harness at :5099 too — it passes the LAN bypass — but that is the thing the Operator wants to stop doing: reading on a phone.' },
    { ico: '🎛️', name: 'daljinski (LivingRoom.App :5077)', what: 'Plain HTML/JS page, no auth, HTTP, IPv4 only. Every control is POST /commands {type,args} → ICommandHandler plugins. Polls GET /state every 1.5 s.' },
    { ico: '🖥️', name: 'Living-room PC (Windows)', what: 'Mouse/keyboard injected with Win32 SendInput: relative mouse-move, clicks, drag; type-text (Unicode, \\n = Enter); press-key only backspace / paste. No scroll wheel, no Tab/Esc/arrows. YouTube plays in its own WebView2 projector window.' },
    { ico: '🤖', name: 'Harness (ClaudeWeb.exe :5099)', what: 'The web UI shown in Chrome on the same desktop. Chat is POST /api/chat + SSE stream; the dock list is server-side (GET /api/dock) but WHICH tab is active is client-only, per browser tab. Nothing pushes "look here" to a screen.' },
    { ico: '📽️', name: 'Projector (HDMI = the desktop)', what: 'Shows whatever the desktop shows: Chrome with the harness, or the living-room projector window. No one tells it which agent to show.' },
  ],
  gaps: [
    ['No "look here"', 'The harness has no server-side notion of a focused agent; the active tab lives in sessionStorage of one browser.'],
    ['No phone-sized remote', 'The harness UI on a phone is the full dock; daljinski knows mouse and text, not agents.'],
    ['Blind typing', 'type-text goes to whatever window is focused — a mis-click sends a prompt into a Kanban title.'],
    ['No scroll, few keys', 'daljinski cannot scroll a conversation and has no Esc/Tab/arrows.'],
    ['No answer endpoint', 'A question card is answered by sending the option as the next chat message (AskQuestionCard does exactly that).'],
  ],
  // --- The sofa session, step by step (target experience, design D-C) ---------------------------
  session: [
    { t: 'Sit down', phone: { screen: 'remote', note: 'Open daljinski → Harness tab (or /remote directly). The agent list loads from GET /api/dock with badges.' }, proj: { screen: 'idle', note: 'The Stage view shows the last staged agent and, while idle, the URL + QR of /remote in a corner.' }, api: 'GET /api/dock · GET /api/stage' },
    { t: 'Pick an agent', phone: { screen: 'remote', pick: 'pers-dec', note: 'Tap "pers-dec" (badge: waiting for you).' }, proj: { screen: 'agent', agent: 'pers-dec', note: 'Within ~1.5 s the projector switches to pers-dec\'s conversation, large type, scrolled to the latest message.' }, api: 'PUT /api/stage {dockId}' },
    { t: 'Read', phone: { screen: 'remote', pick: 'pers-dec', note: 'Thumb on ▲ / ▼ pages the projector; "Latest" re-enables follow. A− / A+ changes the type size.' }, proj: { screen: 'agent', agent: 'pers-dec', scroll: 'up', note: 'The Stage consumes the scroll hint once; follow is off until "Latest".' }, api: 'PUT /api/stage {follow:false, scroll:{dir:"up",nonce}}' },
    { t: 'Type a prompt', phone: { screen: 'compose', pick: 'pers-dec', text: 'Pull this month\'s bank statement into the ledger and show me the diff.', note: 'The phone keyboard. The projector shows nothing until Send (a live typing preview is an open question).' }, proj: { screen: 'agent', agent: 'pers-dec', note: 'Still the conversation.' }, api: '—' },
    { t: 'Send', phone: { screen: 'remote', pick: 'pers-dec', state: 'running', note: 'Send → POST /api/chat with X-Repo-Id = pers-dec, lane builder. Composer locks, "running" with a Stop button.' }, proj: { screen: 'agent', agent: 'pers-dec', run: true, note: 'The user bubble appears, the reply streams, follow keeps the latest chunk in view.' }, api: 'POST /api/chat {message, lane}' },
    { t: 'Watch it work', phone: { screen: 'remote', pick: 'pers-dec', state: 'running', note: 'Status strip: tool calls ticking (M2). Lie back.' }, proj: { screen: 'agent', agent: 'pers-dec', run: true, note: 'Tool cards and text, large.' }, api: 'SSE /api/chat/stream' },
    { t: 'Answer a question', phone: { screen: 'question', pick: 'pers-dec', q: 'Two statements match October. Which one?', opts: ['NLB · 1.–31.10.', 'Revolut · Oct', 'Both'], note: 'The phone vibrates; the options are big buttons. A tap sends the option as the next message — the AskQuestionCard rule (M2).' }, proj: { screen: 'agent', agent: 'pers-dec', question: true, note: 'The strip says "waiting for you"; the question card is on screen.' }, api: 'POST /api/chat {message: "<option>"}' },
    { t: 'Done', phone: { screen: 'remote', pick: 'pers-dec', state: 'idle', note: 'Back to the list; the badge clears. Pick the next agent or go back to YouTube in the same daljinski page.' }, proj: { screen: 'agent', agent: 'pers-dec', note: 'The finished reply stays on the projector.' }, api: '—' },
  ],
  agents: [
    { name: 'pers-dec', color: '#d29922', badge: 'waiting for you' },
    { name: 'living-room', color: '#3fb950', badge: 'busy' },
    { name: 'Claude Web (this app)', color: '#5ea0ef', badge: 'unseen result' },
    { name: 'prg', color: '#a371f7', badge: '' },
    { name: 'youtube-transcript', color: '#e5484d', badge: '' },
  ],
  // --- Split of work --------------------------------------------------------------------------
  split: {
    harness: [
      ['Stage record', 'GET/PUT /api/stage {dockId, lane, follow, fontScale, view}; stage.changed on the event feed; stage.json in the data dir.'],
      ['/stage route', 'Projector view: one conversation full-bleed, large type, follow, thin status strip, idle QR of /remote. Advanced capability stageView.'],
      ['/remote route', 'Phone view: agent list with badges, tap-to-stage, composer → POST /api/chat, Stop, ▲ ▼ Latest, A− A+, question buttons (M2). Advanced capability remoteView.'],
      ['Reuse, not rewrite', 'ChatContext / chatStreamHub / AskQuestionCard logic, DockRegistry, the password + IP gates. No WinForms / host-desktop code.'],
    ],
    living: [
      ['Harness tab', 'A TABS entry + an iframe/link control to http://<location.hostname>:5099/remote, with "Show on projector".'],
      ['show-harness', 'New ICommandHandler: raise the browser window showing the Stage (SetForegroundWindow + maximize) or start it at /stage.'],
      ['Scroll + keys (M0)', 'mouse-scroll {dy}; press-key enter / tab / escape / arrows / pageup / pagedown / home / end.'],
      ['Untouched', 'Media, YouTube, the admin app, the Haydar agent. The uncommitted feature/daljinski-text-send work is not ours to touch in this ping.'],
    ],
  },
  // --- Candidate designs ----------------------------------------------------------------------
  designs: [
    { id: 'A', name: 'Plain remote mouse/keyboard + big-screen layout', verdict: 'fallback / M0', tone: 'warn',
      how: 'daljinski gains scroll + keys; the Operator zooms Chrome on the projector. Point, click the composer, type with type-text.',
      plus: ['Zero harness API work', 'Works for any window on the projector, not only the harness', 'A day of work in living-room'],
      minus: ['A relative touchpad from 3 m is slow and error-prone', 'type-text goes to whatever is focused — blind', 'No feedback on the phone: busy? sent? asking?', 'No question buttons'],
      score: { effort: 1, comfort: 1, reuse: 3, security: 2 } },
    { id: 'B', name: 'Harness remote API + sofa UI built inside daljinski', verdict: 'right integration, wrong owner', tone: 'warn',
      how: 'The harness exposes Stage + chat; daljinski\'s app.js gets a Harness tab with its own agent list and composer calling :5099 (CORS or a relay in LivingRoom.Rest, harness password stored in daljinski).',
      plus: ['One phone page for everything (YouTube, mouse, harness)', 'daljinski\'s own look and tabs'],
      minus: ['Every harness UI change is re-done in a second codebase (question card, stream parser, lanes)', 'The harness password lands in a no-auth app', 'CORS / relay plumbing', 'The remote exists only where the living-room app is installed'],
      score: { effort: 3, comfort: 3, reuse: 1, security: 1 } },
    { id: 'C', name: 'Stage + Remote inside the harness; daljinski embeds and raises', verdict: 'recommended', tone: 'ok',
      how: 'Two routes of the existing client — /stage (projector) and /remote (phone) — joined by a server-side Stage record. daljinski contributes input injection (scroll, keys, raising the browser) and a Harness tab that embeds /remote.',
      plus: ['One codebase for the chat UI; reuses ChatContext, chatStreamHub, AskQuestionCard', 'Works with Chrome on the projector today', 'Useful without the living-room app: any phone, any harness in the fleet', 'Security stays the harness\'s; the living-room leg is small and independent'],
      minus: ['Two routes to keep phone- and TV-friendly', 'A new persisted record (Stage)', '"Raise the browser" still needs daljinski (or Chrome kept full-screen)'],
      score: { effort: 2, comfort: 3, reuse: 3, security: 3 } },
  ],
  // --- Phased plan ----------------------------------------------------------------------------
  plan: [
    { id: 'M0', name: 'Sofa today', repo: 'living-room', done: 'The Operator mouse-and-types the harness from the sofa with the touchpad, Chrome zoomed to 150 %.', items: ['mouse-scroll {dy} + a scroll strip on the touchpad card', 'press-key: enter, tab, escape, arrows, pageup/pagedown, home/end', 'Feed the pain points into M1'] },
    { id: 'M1', name: 'Read on the projector, send from the phone', repo: 'both', done: 'Pick an agent on the phone → the projector switches to it → a prompt typed on the phone appears and streams on the projector.', items: ['Harness: StageStore + GET/PUT /api/stage, stage.changed', 'Harness: /stage view (follow, fontScale, idle QR)', 'Harness: /remote view (list, composer, Stop, ▲ ▼ Latest, A− A+)', 'living-room: Harness tab (iframe → /remote), show-harness command', 'Verify on the real projector; one PR per repo'] },
    { id: 'M2', name: 'A whole sofa session', repo: 'harness', done: 'Pick → read → prompt → watch → answer a question → stop, without leaving the sofa.', items: ['Question cards as phone buttons; "needs you" badge; vibrate', 'Scroll hints on the Stage; lane toggle Builder / Ask; tool-call ticker', '"Peek" the last message on the phone'] },
    { id: 'M3', name: 'Beyond one agent', repo: 'harness', done: 'Management views on the big screen, two agents at once, the arch from the phone.', items: ['view: status | kanban | fleet on the Stage', 'Two-up stage; the arch\'s Operator chat from the phone', 'Voice dictation in the composer (Web Speech API)'] },
    { id: 'M4', name: 'One app', repo: 'both', done: 'The phone has one page; the remote is safe off the LAN bypass.', items: ['daljinski native Harness tab, if preferred over the iframe (decide after M2)', 'Pairing PIN for /remote when LanBypassCidrs is empty; PWA icon', 'Archive the change; baseline spec sofa-mode'] },
  ],
  // --- Open questions ------------------------------------------------------------------------
  questions: [
    ['Which browser is the projector?', 'Chrome on the desktop (today) or the living-room app\'s own WebView2 projector window? Chrome = zero living-room work for the screen; WebView2 = daljinski can host /stage itself and "show-harness" is trivial, but YouTube and the harness then share one window.'],
    ['Where does the phone remote live?', 'In the harness (/remote, recommended — works in every home and for every harness) with daljinski embedding it, or built inside daljinski\'s app.js (one look, two codebases)?'],
    ['Security on the LAN', 'The harness admits 192.168.1.x without a password (LanBypassCidrs) and daljinski has no auth at all. Fine for home, or should /remote ask for a pairing PIN anyway?'],
    ['Scope of M1', 'One agent conversation on the big screen, Builder lane, no Management views — agreed? Or is the Kanban / Fleet Status on the projector part of the first milestone?'],
    ['Live typing on the projector?', 'Should what is being typed on the phone appear on the projector before Send (nice to read along; also shows typos to the room)?'],
    ['Which phone?', 'iOS or Android — matters for keyboard behaviour, vibration, voice dictation (M3) and the home-screen icon (M4).'],
    ['Only this harness?', 'The Stage is per harness. Should the sofa also drive the hub (DESKTOP-POAPPP3) — i.e. a fleet picker on the Remote — or is that a later card?'],
    ['M0 first?', 'Spend a day on daljinski scroll + keys so the sofa works (clumsily) this week, or go straight to M1?'],
  ],
};
