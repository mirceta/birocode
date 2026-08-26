// claude-in-chrome user story — step-through storyboard.
// Two device panes (phone chat / host Chrome) + a pipe showing what the harness spawns.

const STEPS = [
  {
    title: 'You flip Browser mode on',
    text: 'In the chat header (Advanced mode) you toggle "Browser" for this session. Nothing runs yet — you have just told the harness: when I next speak, spawn Claude with --chrome so it can reach my Chrome.',
    phone: [
      { kind: 'ui', text: 'Session: birocode  ·  [ Browser: ON 🟢 ]' },
      { kind: 'sys', text: 'Browser mode enabled — runs in this session can drive Chrome on the host PC.' },
    ],
    pipe: { cmd: '', arrow: '·', label: 'Harness :5099 — idle' },
    chrome: [
      { kind: 'tabs', tabs: [{ t: 'Gmail', you: true }, { t: 'Jira', you: true }, { t: 'YouTube', you: true }] },
      { kind: 'note', text: 'Your Chrome, your tabs. No agent group yet.' },
    ],
  },
  {
    title: 'You ask in plain language',
    text: 'No selectors, no scripts, no skill invocation — just a sentence. The harness spawns this turn as it always does (claude -p --resume), now with --chrome added, so the claude-in-chrome MCP toolset is on board.',
    phone: [
      { kind: 'you', text: 'Check my Gmail — anything important from the accountant?' },
    ],
    pipe: { cmd: 'claude --resume <session> -p "Check my Gmail…" --chrome', arrow: '→', label: 'Harness spawns the turn' },
    chrome: [
      { kind: 'tabs', tabs: [{ t: 'Gmail', you: true }, { t: 'Jira', you: true }, { t: 'YouTube', you: true }] },
      { kind: 'note', text: 'Extension handshake over the native-messaging pipe…' },
    ],
  },
  {
    title: 'A colored tab group appears — the agent\'s territory',
    text: 'The session negotiates its own tab group (first time: in a new window — you can drag the group wherever you want it). Tabs inside the group are the agent\'s; every other tab is invisible to it.',
    phone: [
      { kind: 'you', text: 'Check my Gmail — anything important from the accountant?' },
      { kind: 'sys', text: 'Claude is using the browser…' },
    ],
    pipe: { cmd: 'mcp__claude-in-chrome__tabs_context_mcp', arrow: '⇄', label: 'MCP tool calls' },
    chrome: [
      { kind: 'tabs', tabs: [{ t: 'Gmail', you: true }, { t: 'Jira', you: true }, { t: 'Claude ▸ new tab', agent: true }] },
      { kind: 'note', text: 'Purple group = Claude. Your Gmail tab stays yours — the agent opens its OWN tab.' },
    ],
  },
  {
    title: 'It lands in Gmail already logged in',
    text: 'The agent navigates its tab to mail.google.com. Because this is your real profile, your session cookie is already there — no login, no bot fingerprint, no credentials handled. It reads the inbox through the accessibility tree, not pixels.',
    phone: [
      { kind: 'sys', text: 'Claude is using the browser… (reading mail.google.com)' },
    ],
    pipe: { cmd: 'navigate("https://mail.google.com") · read_page', arrow: '⇄', label: 'MCP tool calls' },
    chrome: [
      { kind: 'tabs', tabs: [{ t: 'Gmail', you: true }, { t: 'Jira', you: true }, { t: 'Claude ▸ Gmail — Inbox (3)', agent: true }] },
      { kind: 'note', text: 'Inbox renders logged-in: "Accountant — Q3 VAT prepayment due Friday…"' },
    ],
  },
  {
    title: 'You get the answer back in chat',
    text: 'The agent summarizes into the chat stream like any other turn, closes or keeps its tab, and the process exits. You never saw a browser — you are on your phone; Chrome did the work at home.',
    phone: [
      { kind: 'claude', text: '3 unread. One matters: the accountant says the Q3 VAT prepayment is due Friday and asks you to confirm the amount (€2,140). The other two are newsletters. Want me to draft a confirmation reply?' },
    ],
    pipe: { cmd: '(process exited)', arrow: '←', label: 'Turn complete' },
    chrome: [
      { kind: 'tabs', tabs: [{ t: 'Gmail', you: true }, { t: 'Jira', you: true }, { t: 'Claude ▸ Gmail — Inbox (3)', agent: true }] },
      { kind: 'note', text: 'The group stays. Next turn resumes the session — the open question is whether it re-attaches here or opens a new window (design phase will verify).' },
    ],
  },
  {
    title: 'And because it acts as you — it can also DO things',
    text: 'Reply to the accountant, fill a form in the CRM, click "approve" in an internal tool behind Okta. Same mechanism, bigger stakes: this is why browser mode is opt-in per session and never on in the read-only lane.',
    phone: [
      { kind: 'you', text: 'Yes — draft the reply confirming €2,140, let me read it before sending.' },
      { kind: 'claude', text: 'Draft ready in the compose window — tell me "send" and I will.' },
    ],
    pipe: { cmd: 'find("reply button") · click · type(…)', arrow: '⇄', label: 'MCP tool calls' },
    chrome: [
      { kind: 'tabs', tabs: [{ t: 'Gmail', you: true }, { t: 'Claude ▸ Gmail — Compose', agent: true }] },
      { kind: 'note', text: 'Acting as you, with your consent gates in the loop.' },
    ],
  },
];

let step = 0;

const $ = (id) => document.getElementById(id);

function renderChat(lines) {
  return lines.map((l) => {
    if (l.kind === 'you')    return `<div class="msg you"><span>You</span>${esc(l.text)}</div>`;
    if (l.kind === 'claude') return `<div class="msg claude"><span>Claude</span>${esc(l.text)}</div>`;
    if (l.kind === 'sys')    return `<div class="msg sys">${esc(l.text)}</div>`;
    if (l.kind === 'ui')     return `<div class="msg ui">${esc(l.text)}</div>`;
    return '';
  }).join('');
}

function renderChrome(lines) {
  return lines.map((l) => {
    if (l.kind === 'tabs') {
      const tabs = l.tabs.map((t) =>
        `<div class="tab ${t.agent ? 'agent' : ''}">${t.agent ? '<i>●</i>' : ''}${esc(t.t)}</div>`).join('');
      return `<div class="tabstrip">${tabs}</div>`;
    }
    if (l.kind === 'note') return `<div class="chrome-note">${esc(l.text)}</div>`;
    return '';
  }).join('');
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function show(i) {
  step = Math.max(0, Math.min(STEPS.length - 1, i));
  const s = STEPS[step];
  $('phone-screen').innerHTML = renderChat(s.phone);
  $('chrome-screen').innerHTML = renderChrome(s.chrome);
  $('pipe-cmd').textContent = s.pipe.cmd;
  $('pipe-arrow').textContent = s.pipe.arrow;
  $('pipe-label').textContent = s.pipe.label;
  $('step-title').textContent = `${step + 1}. ${s.title}`;
  $('step-text').textContent = s.text;
  $('step-count').textContent = `${step + 1} / ${STEPS.length}`;
  $('prev').disabled = step === 0;
  $('next').disabled = step === STEPS.length - 1;
  document.querySelectorAll('#dots b').forEach((d, j) => d.classList.toggle('on', j === step));
}

// dots
$('dots').innerHTML = STEPS.map(() => '<b></b>').join('');
document.querySelectorAll('#dots b').forEach((d, j) => d.addEventListener('click', () => show(j)));
$('prev').addEventListener('click', () => show(step - 1));
$('next').addEventListener('click', () => show(step + 1));
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') show(step + 1);
  if (e.key === 'ArrowLeft') show(step - 1);
});

// tab switching
document.querySelectorAll('#tabs button').forEach((b) => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#tabs button').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    b.classList.add('active');
    document.getElementById('view-' + b.dataset.view).classList.add('active');
  });
});

show(0);
