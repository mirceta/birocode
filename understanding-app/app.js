// Understanding app — the Kanban policeman (openspec policeman-observes-agents). Build-less,
// relative URLs only; the diagrams come from the vendored copy of the product's own data.
import { BOARD_CHECK, LIFECYCLE, DRIVE, DRIVE_TABLE, PASS, CAN, CANNOT, PROVENANCE, toSvg } from './policemanDiagram.js';
import { toElements } from './policemanStateMachine.js';

// The same vocabulary as client/src/components/taskgraph/cardSections.js OBSERVATIONS.
const OBSERVATIONS = {
  working: ['⚙️', 'Working', 'the agent is actively on it'],
  'waiting-review': ['👀', 'Waiting for review', 'its work is up as a pull request; nothing more from the agent until someone reviews'],
  'asked-question': ['❓', 'Asked a question', 'the agent asked something and nobody has answered'],
  blocked: ['⛔', 'Blocked', 'the agent says it cannot proceed'],
  'claims-done': ['🗣', 'Says done', 'the agent says it finished, but the facts do not show it yet'],
  idle: ['💤', 'Idle', 'nothing has happened in its conversation'],
  errored: ['💥', 'Errored', "the agent's last turn failed"],
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Tabs
const tabs = document.querySelectorAll('.tab');
const views = document.querySelectorAll('.view');
tabs.forEach((t) => t.addEventListener('click', () => {
  tabs.forEach((x) => x.classList.toggle('is-on', x === t));
  views.forEach((v) => v.classList.toggle('is-on', v.dataset.view === t.dataset.view));
}));

// The pass
$('#pass').innerHTML = PASS.map((p) => `<li><code>${esc(p.tool)}</code><span>${esc(p.what)}</span></li>`).join('');

// The full state diagram (cytoscape, vendored): three nested compounds, preset positions.
const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const cy = window.cytoscape({
  container: $('#cy'),
  elements: toElements(),
  layout: { name: 'preset', fit: true, padding: 30 },
  wheelSensitivity: 0.2,
  style: [
    { selector: 'node', style: { 'label': 'data(label)', 'text-wrap': 'wrap', 'text-max-width': 190, 'font-size': 15, 'font-weight': 700, 'color': css('--text'), 'text-valign': 'center', 'text-halign': 'center', 'shape': 'round-rectangle', 'width': 230, 'height': 64, 'background-color': css('--surface'), 'border-width': 2, 'border-color': css('--border'), 'text-margin-y': -8 } },
    { selector: 'node[sub]', style: { 'label': (n) => n.data('label') + '\n' + n.data('sub') } },
    { selector: 'node.step', style: { 'shape': 'rectangle', 'width': 250, 'height': 66, 'font-size': 13.5 } },
    { selector: 'node.card', style: { 'width': 290, 'height': 66, 'border-style': 'dashed' } },
    { selector: 'node.tone-ok', style: { 'border-color': css('--green') } },
    { selector: 'node.tone-warn', style: { 'border-color': css('--amber'), 'background-color': 'rgba(210,153,34,.10)' } },
    { selector: 'node.tone-bad', style: { 'border-color': css('--red'), 'background-color': 'rgba(229,72,77,.10)' } },
    { selector: 'node.group', style: { 'shape': 'round-rectangle', 'background-color': css('--bg'), 'background-opacity': 0.55, 'border-color': css('--muted'), 'border-width': 1.5, 'border-style': 'dashed', 'padding': 56, 'text-valign': 'top', 'text-halign': 'center', 'font-size': 16, 'color': css('--muted'), 'text-margin-y': -10, 'text-max-width': 900 } },
    { selector: 'node#pass', style: { 'border-color': css('--accent'), 'color': css('--accent') } },
    { selector: 'node#cards', style: { 'padding': 44 } },
    { selector: 'edge', style: { 'curve-style': 'bezier', 'control-point-step-size': 60, 'target-arrow-shape': 'triangle', 'arrow-scale': 1.4, 'width': 2, 'line-color': css('--muted'), 'target-arrow-color': css('--muted'), 'label': 'data(label)', 'font-size': 13, 'color': css('--text'), 'text-background-color': css('--bg'), 'text-background-opacity': 0.9, 'text-background-padding': 3, 'text-background-shape': 'round-rectangle', 'text-rotation': 'autorotate', 'text-wrap': 'wrap', 'text-max-width': 220, 'loop-direction': '-45deg', 'loop-sweep': '50deg' } },
    { selector: 'edge[curve="arc"]', style: { 'curve-style': 'unbundled-bezier', 'control-point-distances': 90, 'control-point-weights': 0.5 } },
    { selector: 'edge.flow', style: { 'line-color': css('--accent'), 'target-arrow-color': css('--accent') } },
    { selector: 'edge.link', style: { 'line-style': 'dashed', 'line-color': css('--accent'), 'target-arrow-color': css('--accent'), 'width': 3 } },
    { selector: 'edge.card', style: { 'line-color': css('--muted') } },
    { selector: '.lit', style: { 'line-color': css('--accent'), 'target-arrow-color': css('--accent'), 'width': 3.5, 'color': css('--accent'), 'font-weight': 700, 'z-index': 9 } },
    { selector: 'node.lit', style: { 'border-width': 4, 'border-color': css('--accent') } },
    { selector: '.dim', style: { 'opacity': 0.18 } },
  ],
});
window.cy = cy;
cy.on('tap', 'node', (ev) => {
  const n = ev.target;
  if (n.hasClass('group')) return;
  cy.elements().removeClass('lit dim');
  const edges = n.connectedEdges();
  const near = edges.connectedNodes().union(n);
  cy.elements().not(edges).not(near).not('node.group').addClass('dim');
  edges.addClass('lit');
  n.addClass('lit');
});
cy.on('tap', (ev) => { if (ev.target === cy) cy.elements().removeClass('lit dim'); });
const focus = (sel) => cy.animate({ fit: { eles: cy.$(sel), padding: 40 }, duration: 350 });
$('#cy-fit').addEventListener('click', () => cy.animate({ fit: { eles: cy.elements(), padding: 30 }, duration: 350 }));
$('#cy-agent').addEventListener('click', () => focus('node[kind="state"], node#pass'));
$('#cy-pass').addEventListener('click', () => focus('node#pass'));
$('#cy-cards').addEventListener('click', () => focus('node#cards'));
// The tab is hidden until shown: cytoscape needs a resize + fit once it becomes visible.
document.querySelector('[data-view="machine"]').addEventListener('click', () => setTimeout(() => { cy.resize(); cy.fit(undefined, 30); }, 0));

// The drive machine + its table; click a state to light its edges.
$('#fig-drive').innerHTML = `<figcaption>${esc(DRIVE.title)}</figcaption>${toSvg(DRIVE)}<p class="note">${esc(DRIVE.note)}</p>`;
$('#drive-table tbody').innerHTML = DRIVE_TABLE.map(([s, how, does, never]) => `<tr><th>${esc(s)}</th><td>${esc(how)}</td><td>${esc(does)}</td><td class="never">${esc(never)}</td></tr>`).join('');
$('#fig-drive').addEventListener('click', (ev) => {
  const g = ev.target.closest('[data-state]');
  const svg = $('#fig-drive svg');
  const id = g?.dataset.state;
  svg.querySelectorAll('[data-state]').forEach((n) => n.classList.toggle('is-on', !!id && n.dataset.state === id));
  svg.querySelectorAll('[data-edge]').forEach((n) => {
    n.classList.toggle('is-on', !!id && (n.dataset.edge.startsWith(id + '-') || n.dataset.edge.endsWith('-' + id)));
    n.classList.toggle('is-dim', !!id && !(n.dataset.edge.startsWith(id + '-') || n.dataset.edge.endsWith('-' + id)));
  });
});

// The diagrams
$('#fig-board').innerHTML = `<figcaption>${esc(BOARD_CHECK.title)}</figcaption>${toSvg(BOARD_CHECK)}`;
$('#fig-lifecycle').innerHTML = `<figcaption>${esc(LIFECYCLE.title)}</figcaption>${toSvg(LIFECYCLE)}<p class="note">${esc(LIFECYCLE.note)}</p>`;

// The Agent vocabulary
$('#obs').innerHTML = Object.entries(OBSERVATIONS).map(([k, [i, w, m]]) => `<li data-observation="${k}"><b>${i} ${esc(w)}</b><span>${esc(m)}</span></li>`).join('');

// Can / cannot / provenance
const rows = (list) => list.map(([w, d]) => `<tr><th>${esc(w)}</th><td>${esc(d)}</td></tr>`).join('');
$('#can').innerHTML = rows(CAN);
$('#cannot').innerHTML = rows(CANNOT);
$('#prov').innerHTML = rows(PROVENANCE);

// Try a pass: three cards, what the policeman reads, what it writes back.
const CARDS = [
  { ref: '#c3d4e5f6', title: 'Export the invoice register as CSV', status: 'doing', said: '"I need the production API key to continue." (30 h ago)', pr: null,
    after: { obs: ['asked-question', 'asked for the production API key 30 h ago, no answer'], flag: 'pinged 30 h ago, no branch, no PR; waiting on a credential only you have', move: null } },
  { ref: '#f6a1b2c3', title: 'Build the CSV endpoint', status: 'doing', said: '"Opened PR #9 with the endpoint; tests green." (2 h ago)', pr: { n: 9, head: 'feat/csv-endpoint', open: true },
    after: { obs: ['waiting-review', 'says PR #9 is up with green tests, 2 h ago'], flag: null, move: ['doing', 'pr-opened', 'PR #9 traced by head branch feat/csv-endpoint → sync_card → verifier: PR open'] } },
  { ref: '#b2c3d4e5', title: 'Fleet keep-alive column', status: 'pr-opened', said: '"Done, PR is open." (1 d ago)', pr: null,
    after: { obs: ['claims-done', 'says the PR is open, 1 d ago, but GitHub has no PR from this branch'], flag: null, move: null, dishonest: 'marked PR open, but no pull request has been found on GitHub yet' } },
];
const COL = { doing: 'Doing', 'pr-opened': 'PR open' };
function renderTry(done) {
  $('#try').innerHTML = CARDS.map((c) => {
    const o = c.after.obs;
    const [i, w] = OBSERVATIONS[o[0]];
    const status = done && c.after.move ? c.after.move[1] : c.status;
    return `<div class="card${done && c.after.flag ? ' is-flag' : ''}${done && c.after.dishonest ? ' is-warn' : ''}">
      <div class="title">${esc(c.title)} <span class="ref">${c.ref}</span></div>
      <div class="facts">column: <b>${COL[status]}</b>${done && c.after.move ? ` <span class="moved">← was ${COL[c.after.move[0]]}: ${esc(c.after.move[2])}</span>` : ''}</div>
      <div class="facts">agent said: ${esc(c.said)}</div>
      <div class="facts">GitHub: ${c.pr ? `PR #${c.pr.n} open, head ${c.pr.head}` : 'no PR for this card'}</div>
      ${done ? `<div class="sec"><span class="lbl">BOARD CHECK</span> ${c.after.flag ? '🆘 <b>Needs human</b> — ' + esc(c.after.flag) + ' <i>— the policeman, just now</i>' : c.after.dishonest ? '⚠️ <b>Not verified yet</b> — ' + esc(c.after.dishonest) + ' <i>— the auto-verifier</i>' : '✅ <b>Honest</b> — ' + esc(COL[status]) + ' is confirmed by the facts <i>— the auto-verifier</i>'}</div>
      <div class="sec"><span class="lbl">AGENT</span> ${i} <b>${esc(w)}</b> — ${esc(o[1])} <i>— seen by the policeman, just now · session b7e2d1c0</i></div>` : '<div class="sec dim">press ▶ run a pass</div>'}
    </div>`;
  }).join('');
}
renderTry(false);
$('#run').addEventListener('click', () => renderTry(true));
