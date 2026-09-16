// Understanding app: human delegation + watchers (openspec human-delegation-watchers).
// Build-less, relative URLs only.

// ---- tabs -----------------------------------------------------------------
const tabs = [...document.querySelectorAll('nav [role=tab]')];
function show(id) {
  tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
  ['ideas', 'flow', 'pieces', 'tab', 'decide'].forEach((s) => { document.getElementById(s).hidden = s !== id; });
  if (id === 'flow') render(step);
}
tabs.forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));

// ---- the flow ---------------------------------------------------------------
const STEPS = [
  { lit: ['agent'], text: 'The agent is working on a task…' },
  { lit: ['agent'], text: 'It hits something only a human can do: a credential, a merge on a protected branch, a decision. Today it could only write NEEDS_HUMAN and stop.' },
  { lit: ['agent', 'tools'], text: 'Instead it calls the harness tool request_human(title, why, what_to_do, how_to_verify). The tool server is the harness itself, bearer-authenticated, injected into the turn like the arch\'s tools.' },
  { lit: ['tools', 'board'], text: 'The harness files a card on the task board: assignee Operator, status todo, the four fields on it. The agent gets a request id back and ends its turn: "waiting for the Operator".' },
  { lit: ['tools', 'watcher'], text: 'The harness arms a watcher for this agent: kind watch, condition human-request-resolved(id), interval 60 s, max age 7 days. It shows up in the dock\'s Loops tab as Waiting.' },
  { lit: ['watcher', 'board'], text: 'Every engine tick the watcher looks at the card. Still todo → its decision is hold. Nothing is sent, nothing is billed. (tick… tick… tick…)' },
  { lit: ['human', 'board'], text: 'The Operator sees the card on the Kanban (and the arch sees it in list_tasks), does the thing, and moves the card to done with a note: "device auth done".' },
  { lit: ['watcher', 'board'], text: 'Next tick the condition is true. The watcher fires its reaction: resume-agent.' },
  { lit: ['engine', 'agent'], text: 'The engine makes one driven send on the agent\'s own conversation and engine: "Your request \'Log Codex in\' was resolved by the Operator: device auth done. Continue." Gated by the kill switch and the run slot like any driven send.' },
  { lit: ['agent', 'watcher'], text: 'The agent continues its work. The watcher retires (greyed in the Loops tab for a day). If the agent needs the human again, it files another request.' },
];
let step = 0, timer = null;
const actors = [...document.querySelectorAll('.actor')];
const ticker = document.getElementById('ticker');
const stepno = document.getElementById('stepno');
const stepsEl = document.getElementById('steps');
stepsEl.innerHTML = STEPS.map((s, i) => `<li data-i="${i}">${s.text.split('.')[0]}.</li>`).join('');
function render(i) {
  step = Math.max(0, Math.min(STEPS.length - 1, i));
  const s = STEPS[step];
  actors.forEach((a) => { a.classList.toggle('lit', s.lit.includes(a.dataset.a)); a.classList.toggle('done', !s.lit.includes(a.dataset.a) && STEPS.slice(0, step).some((p) => p.lit.includes(a.dataset.a))); });
  ticker.textContent = s.text;
  stepno.textContent = `step ${step} / ${STEPS.length - 1}`;
  [...stepsEl.children].forEach((li) => li.classList.toggle('now', Number(li.dataset.i) === step));
}
document.getElementById('next').addEventListener('click', () => { stop(); render(step + 1); });
document.getElementById('prev').addEventListener('click', () => { stop(); render(step - 1); });
const playBtn = document.getElementById('play');
function stop() { if (timer) { clearInterval(timer); timer = null; playBtn.textContent = '▶ Play'; } }
playBtn.addEventListener('click', () => {
  if (timer) return stop();
  if (step >= STEPS.length - 1) render(0);
  playBtn.textContent = '⏸ Pause';
  timer = setInterval(() => { if (step >= STEPS.length - 1) return stop(); render(step + 1); }, 2600);
});
render(0);

// ---- decisions --------------------------------------------------------------
const QUESTIONS = [
  { id: 'where', title: '1 · Where does the human resolve a request?', options: [
    ['board', 'On the task board: the card (assignee Operator) is moved to done, with an optional note. One board for all work; the arch sees human blockers via list_tasks.', true],
    ['inbox', 'A dedicated "Requests" inbox on the dashboard, separate from the board.'],
    ['both', 'Card on the board, plus a compact "needs you" strip on the dashboard that links to it.'],
  ]},
  { id: 'who', title: '2 · Who is "the human"?', options: [
    ['operator', 'One Operator assignee for now (this box\'s human). No accounts, no routing.', true],
    ['named', 'Named people as assignees (the agent can pick whom to ask).'],
  ]},
  { id: 'resume', title: '3 · How does the agent get resumed?', options: [
    ['driven', 'A normal driven send on the agent\'s existing conversation and engine, carrying the resolution note. Same kill switch and run slot as any driven send.', true],
    ['fresh', 'Always a fresh conversation with a briefing that includes the request and the resolution.'],
    ['manual', 'Do not resume automatically; only mark the request resolved and let the human re-prompt.'],
  ]},
  { id: 'life', title: '4 · Watcher lifetime and cadence?', options: [
    ['default', 'Interval 60 s, max age 7 days, retire on fire / card deleted / Operator stop; retired watchers stay listed for a day.', true],
    ['slower', 'Interval 5 min, max age 30 days (cheaper, slower to notice).'],
    ['custom', 'Let the agent pass interval and max age when it files the request.'],
  ]},
  { id: 'scope', title: '5 · First slice scope?', options: [
    ['minimal', 'Tool + board card + watcher + resume + Loops tab (read-only list). Hand-authored watchers and other conditions later.', true],
    ['generic', 'Also ship a generic "watch a condition" editor in the Loops tab now (PR merged, URL healthy, file changed).'],
  ]},
];
const qEl = document.getElementById('questions');
qEl.innerHTML = QUESTIONS.map((q) => `<div class="q"><h3>${q.title}</h3>${q.options.map(([v, t, rec]) => `<label><input type="radio" name="${q.id}" value="${v}" ${rec ? 'checked' : ''}>${t}${rec ? '<span class="rec">recommended</span>' : ''}</label>`).join('')}</div>`).join('');
const summary = document.getElementById('summary');
function summarise() {
  const lines = QUESTIONS.map((q) => { const v = qEl.querySelector(`input[name=${q.id}]:checked`)?.value; const o = q.options.find((x) => x[0] === v); return `${q.title.replace(/^\d · /, '')}\n  -> ${v}: ${o ? o[1] : ''}`; });
  const extra = document.getElementById('extra').value.trim();
  summary.textContent = `Decisions for openspec human-delegation-watchers\n\n${lines.join('\n')}${extra ? `\n\nNotes: ${extra}` : ''}`;
}
qEl.addEventListener('change', summarise);
document.getElementById('extra').addEventListener('input', summarise);
document.getElementById('copy').addEventListener('click', async () => {
  summarise();
  try { await navigator.clipboard.writeText(summary.textContent); } catch { /* clipboard may be blocked in an iframe; the text is visible below */ }
  const c = document.getElementById('copied'); c.hidden = false; setTimeout(() => { c.hidden = true; }, 1600);
});
summarise();
