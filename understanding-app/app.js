// Loop-autopilot explainer SPA — self-contained, no libraries, relative URLs.
// Builds an SVG flow diagram and steps through it; the active node/edge light up
// and the side panel narrates. Two scenarios (routine reply vs hard decision) and
// two acting modes (Slice 2 suggest-only vs Slice 3 auto-advance).
const SVGNS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('flow');

// --- node geometry (fixed viewBox coords keep layout robust) ---
const NODES = {
  engine:   { kind: 'rect', cx: 380, cy: 54,  w: 220, h: 54, t: 'Engine',   s: 'BackgroundService' },
  brain:    { kind: 'rect', cx: 380, cy: 168, w: 220, h: 54, t: 'Brain',    s: 'LLM classifier' },
  gate:     { kind: 'diamond', cx: 380, cy: 300, w: 200, h: 96, t: 'Gate',  s: 'threshold? deny-list?' },
  mode:     { kind: 'diamond', cx: 380, cy: 444, w: 170, h: 84, t: 'Mode',  s: 'who hits send?' },
  escalate: { kind: 'rect', cx: 150, cy: 470, w: 200, h: 64, t: 'ESCALATE', s: 'dock cue + Autopilot tab' },
  suggest:  { kind: 'rect', cx: 280, cy: 606, w: 196, h: 58, t: 'Pre-fill', s: 'you press send' },
  autosend: { kind: 'rect', cx: 520, cy: 606, w: 196, h: 58, t: 'Auto-send', s: '+ audit log' },
};

// --- edges: id, from→to as explicit paths, optional label ---
const EDGES = {
  engine_brain: { d: 'M380 81 L380 141', label: 'idle agent + last message', lx: 392, ly: 116 },
  brain_gate:   { d: 'M380 195 L380 252', label: 'prompt + confidence', lx: 392, ly: 226 },
  gate_mode:    { d: 'M380 348 L380 402', label: 'pass', lx: 392, ly: 378 },
  gate_esc:     { d: 'M300 320 C 220 380 180 400 165 438', label: 'fail', lx: 205, ly: 372 },
  mode_suggest: { d: 'M345 470 C 310 520 295 540 285 577', label: 'Slice 2', lx: 250, ly: 528 },
  mode_autosend:{ d: 'M415 470 C 470 520 500 540 515 577', label: 'Slice 3', lx: 500, ly: 528 },
  loop:         { d: 'M610 606 C 700 606 700 54 494 54', label: 'loop', lx: 660, ly: 330 },
};

function el(name, attrs, parent) {
  const n = document.createElementNS(SVGNS, name);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(n);
  return n;
}

// arrow marker
const defs = el('defs', {}, svg);
const marker = el('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 9, refY: 5,
  markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
el('path', { d: 'M0 0 L10 5 L0 10 z', fill: '#6e7681' }, marker);

// draw edges first (under nodes)
const edgeEls = {};
for (const id in EDGES) {
  const e = EDGES[id];
  const g = el('g', {}, svg);
  const p = el('path', { class: 'edge', d: e.d }, g);
  if (e.label) { const tx = el('text', { class: 'elabel', x: e.lx, y: e.ly, 'text-anchor': 'middle' }, g); tx.textContent = e.label; }
  edgeEls[id] = { g, p };
}

// draw nodes
const nodeEls = {};
for (const id in NODES) {
  const n = NODES[id];
  const g = el('g', { class: 'node' }, svg);
  if (n.kind === 'diamond') {
    const hw = n.w / 2, hh = n.h / 2;
    el('polygon', { points: `${n.cx},${n.cy - hh} ${n.cx + hw},${n.cy} ${n.cx},${n.cy + hh} ${n.cx - hw},${n.cy}` }, g);
  } else {
    el('rect', { x: n.cx - n.w / 2, y: n.cy - n.h / 2, width: n.w, height: n.h, rx: 10 }, g);
  }
  const t1 = el('text', { x: n.cx, y: n.cy - 4, 'text-anchor': 'middle' }, g); t1.textContent = n.t;
  const t2 = el('text', { class: 'nsub', x: n.cx, y: n.cy + 14, 'text-anchor': 'middle' }, g); t2.textContent = n.s;
  nodeEls[id] = g;
}

// --- step scripts ---
const D = {
  engine: ['Engine — find an idle agent', 'A backend service polls (~10s) for agents that finished their turn. It grabs the idle agent’s last message — the situation to act on. No browser needed; it runs even with every tab closed.'],
  brainOk: ['Brain — classify the situation', 'An LLM classifier maps the last message to ONE of your ~7 routine prompts, with a confidence. It never invents a prompt — it only picks from your known set, which is what makes it safe and auditable.'],
  brainHard: ['Brain — no confident match', 'The classifier reads the message — e.g. “Two valid schemas, which do you want?” — and finds no confident routine match. Ambiguity deliberately defaults to “escalate.”'],
  gatePass: ['Gate — safe to act?', 'Confidence above your threshold? Not a risky / deny-listed action (deploy, force-push, delete…)? Autopilot enabled for this agent? Here: yes — it passes.'],
  gateFail: ['Gate → escalate', 'Low confidence, a risky/deny-listed action, or a genuine decision → the gate fails. A wrong auto-send is worse than a needless pause, so it stops here.'],
  mode: ['Mode — who hits send?', 'The only difference between the two build slices: in suggest-only you press send; in auto-advance the autopilot does. Same engine, same brain, same gate.'],
  suggest: ['Suggest-only (Slice 2)', 'The predicted routine prompt is pre-filled into the agent’s composer. You press send. Zero risk — it proves the brain picks correctly before it can ever act alone. Every suggestion is logged.'],
  autosend: ['Auto-advance (Slice 3)', 'Above the confidence bar, autopilot sends the routine prompt itself and the agent runs its next turn. Every auto-send is written to an append-only audit log.'],
  escalate: ['Escalate — needs you', 'Autopilot stops advancing this agent and surfaces it: a dock cue + the Autopilot tab show “needs you.” You make the real call. This pause is the whole point of the feature.'],
  loop: ['Loop', 'The agent runs its next turn, finishes, and the engine picks it up again — advancing it through your routine replies until a hard decision appears.'],
};

function buildSteps(scenario, slice) {
  if (scenario === 'hard') {
    return [
      { node: 'engine', edge: null, ...wrap(D.engine) },
      { node: 'brain', edge: 'engine_brain', ...wrap(D.brainHard) },
      { node: 'gate', edge: 'brain_gate', ...wrap(D.gateFail) },
      { node: 'escalate', edge: 'gate_esc', kind: 'esc', ...wrap(D.escalate) },
    ];
  }
  const action = slice === '3'
    ? { node: 'autosend', edge: 'mode_autosend', kind: 'send', ...wrap(D.autosend) }
    : { node: 'suggest', edge: 'mode_suggest', kind: 'send', ...wrap(D.suggest) };
  return [
    { node: 'engine', edge: null, ...wrap(D.engine) },
    { node: 'brain', edge: 'engine_brain', ...wrap(D.brainOk) },
    { node: 'gate', edge: 'brain_gate', ...wrap(D.gatePass) },
    { node: 'mode', edge: 'gate_mode', ...wrap(D.mode) },
    action,
    { node: 'engine', edge: 'loop', kind: 'send', ...wrap(D.loop) },
  ];
}
function wrap([title, desc]) { return { title, desc }; }

// --- state + rendering ---
let scenario = 'routine', slice = '2', steps = buildSteps(scenario, slice), i = 0, timer = null;
const $ = (id) => document.getElementById(id);

function render() {
  const step = steps[i];
  // reset all
  for (const id in nodeEls) nodeEls[id].setAttribute('class', 'node dimmed');
  for (const id in edgeEls) edgeEls[id].p.setAttribute('class', 'edge dimmed');
  // light active
  const kind = step.kind ? ' ' + step.kind : '';
  nodeEls[step.node].setAttribute('class', 'node active' + kind);
  if (step.edge) edgeEls[step.edge].p.setAttribute('class', 'edge active' + kind);
  // panel
  $('stepNum').textContent = i + 1;
  $('stepTot').textContent = steps.length;
  $('stepTitle').textContent = step.title;
  $('stepDesc').textContent = step.desc;
}

function go(n) { i = (n + steps.length) % steps.length; render(); }
function stopPlay() { if (timer) { clearInterval(timer); timer = null; $('play').textContent = '▶ Play'; } }
function play() {
  if (timer) { stopPlay(); return; }
  $('play').textContent = '❚❚ Pause';
  if (i >= steps.length - 1) go(0);
  timer = setInterval(() => {
    if (i >= steps.length - 1) { stopPlay(); return; }
    go(i + 1);
  }, 1700);
}

$('next').onclick = () => { stopPlay(); go(i + 1); };
$('prev').onclick = () => { stopPlay(); go(i - 1); };
$('play').onclick = play;

function rebuild() { stopPlay(); steps = buildSteps(scenario, slice); i = 0; render(); }

document.querySelectorAll('#scenario button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('#scenario button').forEach((x) => x.classList.remove('on'));
  b.classList.add('on'); scenario = b.dataset.scenario; rebuild();
});
document.querySelectorAll('#slice button').forEach((b) => b.onclick = () => {
  document.querySelectorAll('#slice button').forEach((x) => x.classList.remove('on'));
  b.classList.add('on'); slice = b.dataset.slice; rebuild();
});

render();

// ===== Autopilot tab mockup: explanation-on-click + live suggestion log =====

// Each interactive control explains what it WOULD do — the SPA is the explainer,
// so nothing is faked in-place; the dedicated panel narrates instead.
const EXPLAIN = {
  toggle: ['Autopilot — global switch',
    'Off disables autopilot for every agent on this machine at once: in-flight suggestions clear and nothing is sent until you switch it back on. (Arming individual agents is the row buttons below.)'],
  threshold: ['Confidence threshold',
    'The brain must be at least this sure to act. Below it, the turn escalates to you instead of being suggested or sent. Slide it up to be more cautious — more escalations, fewer auto-sends.'],
  kill: ['Kill switch',
    'Instantly disarms all auto-advancing and reverts every agent to manual. The emergency stop — hit it the moment autopilot does anything you didn’t expect.'],
  armed: ['birocode is armed',
    'In suggest-only (Slice 2) it pre-fills the predicted prompt and waits for you; in auto-advance (Slice 3) it would send “keep it” itself. Clicking here disarms just this one agent.'],
  send: ['Send the suggestion',
    'Posts the pre-filled “play it back” into game-arcade’s composer and advances its turn. In Slice 2 you are the one who hits send — the trust-building step before auto-advance.'],
  review: ['Review the escalation',
    'Opens prg’s chat at the point autopilot stopped, so you make the hard call yourself. Autopilot won’t touch it until you respond — escalation is the whole safety mechanism.'],
  arm: ['Arm this agent',
    'Enables autopilot for birokrat-ai-platform: the engine starts classifying its turns and suggesting routine prompts. Nothing is sent automatically in Slice 2.'],
  'prompt-add': ['Add a routine prompt',
    'Pull one from your custom-prompts list or type a new phrasing. This set is the brain’s entire label space — autopilot can only ever send one of these, or escalate. Nothing free-form.'],
  'prompt-edit': ['Edit this routine prompt',
    'Rename it or adjust the situations that trigger it. Because the classifier picks only from this confirmed set, editing here directly changes what autopilot is allowed to send.'],
  denylist: ['Deny-listed — never auto-sent',
    'Even on a confident match, prompts that trigger irreversible work (deploy, push, force, delete…) are always escalated to you, never sent automatically. This is the risky-action fence.'],
};

// Sub-tab navigation (Agents ↔ Routine prompts) — real view switching.
document.getElementById('subtabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-sub]');
  if (!btn) return;
  document.querySelectorAll('#subtabs button').forEach((b) => b.classList.toggle('on', b === btn));
  document.querySelectorAll('.subpanel').forEach((p) => { p.hidden = p.dataset.panel !== btn.dataset.sub; });
});

const explainBox = document.getElementById('explain');
let selected = null;
document.querySelector('.mock__tab').addEventListener('click', (e) => {
  const ctl = e.target.closest('[data-explain]');
  if (!ctl) return;
  const [title, body] = EXPLAIN[ctl.dataset.explain] || ['', ''];
  if (selected) selected.classList.remove('sel');
  selected = ctl; ctl.classList.add('sel');
  explainBox.innerHTML = '';
  const h = document.createElement('h3'); h.textContent = title;
  const p = document.createElement('p'); p.textContent = body;
  explainBox.append(h, p);
});

// Live suggestion log — the engine classifies continuously, so the history grows.
// Cycle through plausible classifications (no RNG needed) and prepend with a flash.
const SAMPLES = [
  { ag: 'birocode', prompt: '"keep it"', cf: '0.94', out: 'sent', cls: 'out-sent' },
  { ag: 'game-arcade', prompt: '"play it back"', cf: '0.88', out: 'suggested', cls: 'out-sugg' },
  { ag: 'prg', prompt: '— hard decision', cf: '0.41', out: 'escalated', cls: 'out-esc' },
  { ag: 'birocode', prompt: '"continue"', cf: '0.91', out: 'sent', cls: 'out-sent' },
  { ag: 'claude-web-workspace', prompt: '"now test it"', cf: '0.83', out: 'suggested', cls: 'out-sugg' },
  { ag: 'game-arcade', prompt: '"deploy" (deny-listed)', cf: '0.87', out: 'escalated', cls: 'out-esc' },
  { ag: 'prg', prompt: '"yes"', cf: '0.96', out: 'sent', cls: 'out-sent' },
  { ag: 'birokrat-ai-platform', prompt: '"play it back"', cf: '0.79', out: 'suggested', cls: 'out-sugg' },
];
const logEl = document.getElementById('log');
const MAX_LOG = 9;
let logN = 0;
function hhmmss() {
  const d = new Date();
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}
function addLogEntry(flash) {
  const s = SAMPLES[logN % SAMPLES.length]; logN++;
  const li = document.createElement('li');
  if (flash) li.className = 'new';
  li.innerHTML =
    `<span class="t">${hhmmss()}</span>` +
    `<span class="ag">${s.ag}</span>` +
    `<span class="out ${s.cls}">${s.out}</span>` +
    `<span class="pr"><code>${s.prompt}</code></span>` +
    `<span class="cf">${s.cf}</span>`;
  logEl.prepend(li);
  while (logEl.children.length > MAX_LOG) logEl.removeChild(logEl.lastChild);
}
// Seed a few so the log isn't empty on load, then stream new ones live.
for (let k = 0; k < 5; k++) addLogEntry(false);
setInterval(() => addLogEntry(true), 3200);
