/* Understanding app — unseen-result exclamation on dock toolbar dots.
   Three pieces: view tabs, two step-through stories (before/after), and a
   clickable 5-state simulator with an SVG diagram. No libraries, relative-only. */

// ---------- view tabs ----------
document.getElementById('tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('.tab'); if (!btn) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('tab--on', t === btn));
  document.querySelectorAll('.view').forEach((v) =>
    v.classList.toggle('view--on', v.id === 'view-' + btn.dataset.view));
});

// ---------- step-through stories ----------
function story(prefix, steps) {
  const dot = document.getElementById(prefix + '-dot');
  const cap = document.getElementById(prefix + '-cap');
  const wrap = document.getElementById(prefix + '-steps');
  steps.forEach((s, i) => {
    const b = document.createElement('button');
    b.textContent = (i + 1) + '. ' + s.btn;
    b.addEventListener('click', () => {
      wrap.querySelectorAll('button').forEach((x, j) => x.classList.toggle('step--on', j === i));
      dot.className = 'mockdot ' + s.dot;
      dot.textContent = s.bang ? '!' : '';
      cap.innerHTML = s.cap;
    });
    wrap.appendChild(b);
  });
  wrap.querySelectorAll('button')[0].click();
}

story('sb', [
  { btn: 'agent idle, shown', dot: 'mockdot--color', cap: 'Dock on the grid, agent idle — dot shows the agent’s color.' },
  { btn: 'prompt sent', dot: 'mockdot--busy', cap: 'Agent starts executing — dot goes <b>black + pulse</b>.' },
  { btn: 'you hide the dock', dot: 'mockdot--busy', cap: 'You hide it to make room. Still running, still black. Correct.' },
  { btn: 'agent finishes', dot: 'mockdot--color', cap: '<b>The hole:</b> dot reverts to the agent’s color — reads as “idle, nothing to see.” That you were waiting on this agent is lost.' },
]);

story('sa', [
  { btn: 'agent idle, shown', dot: 'mockdot--color', cap: 'Same start.' },
  { btn: 'prompt sent', dot: 'mockdot--busy', cap: 'Black + pulse while executing.' },
  { btn: 'you hide the dock', dot: 'mockdot--busy', cap: 'Hidden mid-run, still black.' },
  { btn: 'agent finishes', dot: 'mockdot--bang', bang: true, cap: '<b>The fix:</b> finished <i>while hidden</i> → dot becomes an <b>exclamation point</b>: “unseen result waiting.” It stays this way, however long you take.' },
  { btn: 'you click the tab (show)', dot: 'mockdot--color', cap: 'Showing the dock = looking at the result. Latch clears, dot returns to the agent’s color; the grid card now carries the outcome.' },
]);

// ---------- simulator ----------
// State: visible (on grid), running, unseen (latch), lastKind ('done'|'error')
const S = { visible: true, running: false, unseen: false, lastKind: 'done' };

// The five reachable states, with fixed diagram positions.
const NODES = [
  { id: 'A', x: 60,  y: 40,  w: 220, title: 'SHOWN · resting',  sub: 'dot = agent color' },
  { id: 'B', x: 60,  y: 220, w: 220, title: 'SHOWN · running',  sub: 'dot = black, pulsing' },
  { id: 'C', x: 470, y: 40,  w: 220, title: 'HIDDEN · resting', sub: 'dot = agent color' },
  { id: 'D', x: 470, y: 220, w: 220, title: 'HIDDEN · running', sub: 'dot = black, pulsing' },
  { id: 'E', x: 470, y: 400, w: 220, title: 'HIDDEN · unseen result', sub: 'dot = exclamation point', isNew: true },
];
// Edges: from, to, label, geometry (simple polyline points), new = part of this feature
// lblAt/anchor pin each label explicitly so none of them collide.
const EDGES = [
  { f: 'A', t: 'B', lbl: 'prompt starts',  pts: [[150, 100], [150, 220]], lblAt: [142, 165], anchor: 'end' },
  { f: 'B', t: 'A', lbl: 'finishes (you see it)', pts: [[210, 220], [210, 100]], lblAt: [218, 165] },
  { f: 'A', t: 'C', lbl: 'hide', pts: [[280, 60], [470, 60]], lblAt: [365, 52] },
  { f: 'C', t: 'A', lbl: 'show', pts: [[470, 85], [280, 85]], lblAt: [365, 100] },
  { f: 'B', t: 'D', lbl: 'hide', pts: [[280, 245], [470, 245]], lblAt: [365, 237] },
  { f: 'D', t: 'B', lbl: 'show', pts: [[470, 270], [280, 270]], lblAt: [365, 285] },
  { f: 'C', t: 'D', lbl: 'prompt starts', pts: [[580, 100], [580, 220]], lblAt: [588, 165] },
  { f: 'D', t: 'E', lbl: 'finishes while hidden', pts: [[560, 280], [560, 400]], lblAt: [552, 335], anchor: 'end', isNew: true },
  { f: 'E', t: 'D', lbl: 'new prompt starts', pts: [[640, 400], [640, 280]], lblAt: [648, 350] },
  { f: 'E', t: 'A', lbl: 'show → latch clears', pts: [[470, 440], [150, 440], [150, 100]], lblAt: [255, 432], isNew: true },
];

const svg = document.getElementById('diagram');
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, parent) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) n.setAttribute(k, attrs[k]);
  (parent || svg).appendChild(n); return n;
}
const defs = el('defs', {});
const marker = el('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 9, refY: 5,
  markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
el('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: '#b9b5ab' }, marker);

EDGES.forEach((e) => {
  const d = 'M ' + e.pts.map((p) => p.join(' ')).join(' L ');
  el('path', { d, class: 'edge' + (e.isNew ? ' edge--new' : '') });
  el('text', { x: e.lblAt[0], y: e.lblAt[1], 'text-anchor': e.anchor || 'start',
    class: 'edgelbl' + (e.isNew ? ' edgelbl--new' : '') }).textContent = e.lbl;
});
const nodeEls = {};
NODES.forEach((n) => {
  const g = el('g', { class: 'st' + (n.isNew ? ' st--new' : ''), 'data-id': n.id });
  el('rect', { x: n.x, y: n.y, width: n.w, height: 60, rx: 10 }, g);
  el('text', { x: n.x + 14, y: n.y + 26 }, g).textContent = n.title;
  el('text', { x: n.x + 14, y: n.y + 46, class: 'st__sub' }, g).textContent = n.sub;
  nodeEls[n.id] = g;
});

function currentStateId() {
  if (S.visible) return S.running ? 'B' : 'A';
  if (S.running) return 'D';
  return S.unseen ? 'E' : 'C';
}
const stateNames = {
  A: 'Shown · resting — nothing pending',
  B: 'Shown · running — mirrors the send button',
  C: 'Hidden · resting — hidden and quiet',
  D: 'Hidden · running — busy even though off-grid',
  E: 'Hidden · UNSEEN RESULT — the new latched state',
};

const dot = document.getElementById('sim-dot');
const grid = document.getElementById('sim-grid');
const stateLbl = document.getElementById('sim-state');
const logEl = document.getElementById('sim-log');
function log(msg) {
  const li = document.createElement('li'); li.textContent = msg;
  logEl.appendChild(li); logEl.scrollTop = logEl.scrollHeight;
}

function render() {
  const id = currentStateId();
  for (const k in nodeEls) nodeEls[k].classList.toggle('st--active', k === id);
  // strip dot: running > unseen-latch > agent color
  dot.textContent = '';
  if (S.running) dot.className = 'mockdot mockdot--busy';
  else if (!S.visible && S.unseen) {
    dot.className = 'mockdot ' + (S.lastKind === 'error' ? 'mockdot--bang-error' : 'mockdot--bang');
    dot.textContent = '!';
  } else dot.className = 'mockdot mockdot--color';
  // grid
  grid.innerHTML = '';
  if (S.visible) {
    const p = document.createElement('div');
    p.className = 'mockphone' + (S.running ? ' mockphone--running'
      : S.lastKind === 'error' ? ' mockphone--error' : '');
    p.textContent = 'web-flow-autodev — ' + (S.running ? 'running…'
      : 'card visible on the grid (' + S.lastKind + ')');
    grid.appendChild(p);
  } else {
    grid.innerHTML = '<div class="mockgrid__empty">dock hidden — not on the grid; the strip dot is the only signal</div>';
  }
  stateLbl.innerHTML = 'State: <b>' + stateNames[id] + '</b>';
  // button enablement
  document.getElementById('ev-start').disabled = S.running;
  document.getElementById('ev-done').disabled = !S.running;
  document.getElementById('ev-error').disabled = !S.running;
  document.getElementById('ev-hide').disabled = !S.visible;
  document.getElementById('ev-show').disabled = S.visible;
}

document.getElementById('ev-start').addEventListener('click', () => {
  S.running = true; log('prompt starts → running'); render();
});
function finish(kind) {
  S.running = false; S.lastKind = kind;
  if (!S.visible) { S.unseen = true; log('run finished (' + kind + ') while HIDDEN → exclamation latched'); }
  else log('run finished (' + kind + ') while shown → seen on the grid, no latch');
  render();
}
document.getElementById('ev-done').addEventListener('click', () => finish('done'));
document.getElementById('ev-error').addEventListener('click', () => finish('error'));
document.getElementById('ev-hide').addEventListener('click', () => {
  S.visible = false; log('dock hidden'); render();
});
document.getElementById('ev-show').addEventListener('click', () => {
  S.visible = true;
  if (S.unseen) log('dock shown → unseen-result latch CLEARED');
  else log('dock shown');
  S.unseen = false; render();
});
document.getElementById('ev-reset').addEventListener('click', () => {
  S.visible = true; S.running = false; S.unseen = false; S.lastKind = 'done';
  logEl.innerHTML = ''; log('reset'); render();
});
render();
