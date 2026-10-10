// Understanding app — the sofa → fleet bridge (fleet task 5afbb125). All content in ./data.js.
const D = window.BRIDGE;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const badge = ([kind, text]) => `<span class="b b--${kind}">${esc(text)}</span>`;
const table = (cols, rows) => `<tr>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>` + rows.join('');

// ---- header + tabs ----------------------------------------------------------------------------------
$('#question').textContent = D.question;
$('#answer').textContent = D.answer;
function show(view) {
  $$('#tabs button').forEach((b) => b.classList.toggle('is-on', b.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === view));
  if (view === 'map') initMap();
  history.replaceState(null, '', '#' + view);
}
$$('#tabs button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

// ---- 1 · overview -------------------------------------------------------------------------------------
$('#cards').innerHTML = D.cards.map((c) => `<div class="card card--${c.kind}"><div class="card__title">${esc(c.title)}</div><div class="card__big">${esc(c.big)}</div><div>${esc(c.text)}</div></div>`).join('');
$('#summary').innerHTML = D.summary.map(([q, a]) => `<tr><td>${esc(q)}</td><td>${esc(a)}</td></tr>`).join('');
$('#glossary').innerHTML = D.glossary.map(([t, d]) => `<tr><td>${esc(t)}</td><td>${esc(d)}</td></tr>`).join('');

// ---- 3 · today's pieces --------------------------------------------------------------------------------
$('#pieces').innerHTML = table(D.pieces.cols, D.pieces.rows.map((r) => {
  const risk = r[4];
  const cls = risk[0] === 'bad' ? 'row--bad' : risk[0] === 'dim' ? 'row--dim' : '';
  return `<tr class="${cls}"><td class="term">${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td>${badge(risk)}</td></tr>`;
}));

// ---- 4 · options matrix + threats ----------------------------------------------------------------------
const SYM = { good: '✓', mid: '~', bad: '✗', na: '' };
// one renderer for both option grids (bridge options and session options)
function matrix(tableSel, howSel, options, rows) {
  $(tableSel).innerHTML =
    `<tr><th>Criterion</th>${options.map((o, i) => `<th class="opt${o.pick ? ' is-pick' : ''}" data-col="${i}">${esc(o.id)}${o.pick ? ' ★' : ''}<small>${esc(o.name)}</small></th>`).join('')}</tr>` +
    rows.map((row) => {
      const [crit, ...cells] = row;
      return `<tr class="${crit === 'Verdict' ? 'verdict' : ''}"><td class="crit">${esc(crit)}</td>${cells.map(([r, t], i) => `<td class="cell r--${r}" data-col="${i}"><span class="sym">${SYM[r]}</span>${esc(t)}</td>`).join('')}</tr>`;
    }).join('');
  const pick = (i) => {
    $$(`${tableSel} [data-col]`).forEach((el) => el.classList.toggle('is-sel', Number(el.dataset.col) === i));
    $(howSel).innerHTML = `<b>${esc(options[i].id)} · ${esc(options[i].name)}.</b> ${esc(options[i].how)}`;
  };
  $$(`${tableSel} th.opt`).forEach((th) => th.addEventListener('click', () => pick(Number(th.dataset.col))));
  pick(options.findIndex((o) => o.pick));
}
matrix('#matrix', '#how', D.options, D.matrix);

// ---- 5 · network bridge ------------------------------------------------------------------------------
const B = D.bridge;
$('#bridgeFacts').innerHTML = B.facts.map(([k, v, n]) => `<tr><td>${esc(k)}</td><td><code>${esc(v)}</code> <span class="dim">${esc(n)}</span></td></tr>`).join('');
$('#bridgeWhy').textContent = B.why;
matrix('#bridgeMatrix', '#bridgeHow', B.options, B.matrix);
$('#bridgeCaveat').innerHTML = B.caveat.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');

$('#threats').innerHTML = table(D.threats.cols, D.threats.rows.map((r) =>
  `<tr><td class="term">${esc(r[0])}</td><td>${esc(r[1])}</td><td>${esc(r[2])}</td><td>${badge(r[3])}</td></tr>`));

// ---- 6 · plan ----------------------------------------------------------------------------------------
$('#phases').innerHTML = table(D.phases.cols, D.phases.rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`));
const YN = { yes: ['ok', 'yes'], no: ['dim', 'no'], gated: ['warn', 'gated'] };
$('#routes').innerHTML = table(D.routes.cols, D.routes.rows.map((r) =>
  `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td>${r.slice(2).map((v) => `<td class="yn">${badge(YN[v])}</td>`).join('')}</tr>`));

// ---- 7 · questions -----------------------------------------------------------------------------------
$('#questions').innerHTML = table(D.questions.cols, D.questions.rows.map((r) =>
  `<tr><td class="dim">${esc(r[0])}</td><td class="term" style="white-space:normal">${esc(r[1])}</td><td>${esc(r[2])}</td><td>${esc(r[3])}</td><td>${r[4] === '—' ? '' : badge(['warn', r[4]])}</td></tr>`));

// ---- 2 · the map (Cytoscape) -----------------------------------------------------------------------------
const C = { ok: '#3fb950', warn: '#d29922', bad: '#e5484d', violet: '#a371f7', muted: '#7d8590', accent: '#5ea0ef' };
const KIND = {
  admin: { color: C.bad, style: 'solid', name: 'Admin Session' },
  noauth: { color: C.bad, style: 'dashed', name: 'no login' },
  fleet: { color: C.violet, style: 'dashed', name: 'Fleet Channel (admin password)' },
  viewer: { color: C.ok, style: 'solid', name: 'Viewer Session' },
  send: { color: C.warn, style: 'solid', name: 'guarded send' },
  local: { color: C.muted, style: 'solid', name: 'on the same PC' },
  bridge: { color: C.accent, style: 'solid', name: 'Bridge (one way)' },
  missing: { color: C.muted, style: 'dotted', name: 'missing link' },
};
const NODE_FADE = { lrh: ['m1', 'm2', 'bridge'], dalj: ['m1', 'm2', 'bridge'] };
$('#legend').innerHTML = Object.values(KIND).map((k) => `<span><i style="border-top-color:${k.color};border-top-style:${k.style}"></i>${esc(k.name)}</span>`).join('');

let cy = null;
let mapView = 'today';
let step = -1;
let timer = null;

function initMap() {
  if (cy) { cy.resize(); cy.fit(undefined, 30); return; }
  const m = D.map;
  cy = cytoscape({
    container: $('#cy'),
    layout: { name: 'preset', padding: 30 },
    elements: [
      ...m.groups.map((g) => ({ data: { id: g.id, label: g.label }, classes: 'group' })),
      ...m.nodes.map((n) => ({ data: { id: n.id, parent: n.parent, label: n.label }, position: { x: n.x, y: n.y }, classes: n.id === 'hub' ? 'hub' : '' })),
      ...m.edges.map((e) => ({ data: { id: e.id, source: e.s, target: e.t, label: e.label, color: KIND[e.kind].color, line: KIND[e.kind].style }, classes: 'k-' + e.kind })),
    ],
    style: [
      { selector: 'node', style: {
        shape: 'round-rectangle', width: 210, height: 64, 'background-color': '#1b1e26', 'border-width': 2, 'border-color': '#3a3f4a',
        label: 'data(label)', color: '#e8e8e6', 'font-size': 15, 'font-weight': 600, 'text-wrap': 'wrap', 'text-max-width': 190,
        'text-valign': 'center', 'text-halign': 'center', 'transition-property': 'opacity, border-color', 'transition-duration': '250ms' } },
      { selector: 'node.hub', style: { 'border-color': C.accent, 'border-width': 3 } },
      { selector: 'node.group', style: {
        shape: 'round-rectangle', 'background-color': '#ffffff', 'background-opacity': 0.03, 'border-style': 'dashed', 'border-color': '#4a505c', 'border-width': 1.5,
        label: 'data(label)', 'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -6, color: '#9aa3b2', 'font-size': 13, 'font-weight': 600, padding: 34 } },
      { selector: 'edge', style: {
        width: 3, 'curve-style': 'bezier', 'line-color': 'data(color)', 'line-style': 'data(line)', 'target-arrow-shape': 'triangle', 'target-arrow-color': 'data(color)',
        label: 'data(label)', 'font-size': 13, color: '#e8e8e6', 'text-background-color': '#0f1117', 'text-background-opacity': 1, 'text-background-padding': 4,
        'text-background-shape': 'roundrectangle', 'text-border-width': 1, 'text-border-color': 'data(color)', 'text-border-opacity': 1,
        'transition-property': 'opacity, width', 'transition-duration': '250ms' } },
      { selector: 'edge.k-missing', style: { 'target-arrow-shape': 'none', color: C.bad } },
      { selector: '.hidden', style: { display: 'none' } },
      { selector: '.faded', style: { opacity: 0.28 } },
      { selector: '.dim', style: { opacity: 0.12 } },
      { selector: 'edge.hl', style: { width: 6, opacity: 1, 'z-index': 9 } },
      { selector: 'node.hl', style: { 'border-color': '#ffffff', 'border-width': 3, opacity: 1 } },
      { selector: ':selected', style: { 'overlay-opacity': 0.08, 'overlay-color': '#5ea0ef' } },
    ],
  });
  cy.on('tap', 'node[!parent], node[parent], edge', (ev) => showInfo(ev.target.id()));
  cy.on('tap', (ev) => { if (ev.target === cy) showInfo(null); });
  setMapView('today');
}

function setMapView(v) {
  mapView = v;
  $$('#mapViews button').forEach((b) => b.classList.toggle('is-on', b.dataset.map === v));
  for (const e of D.map.edges) {
    const el = cy.getElementById(e.id);
    el.toggleClass('hidden', !e.views.includes(v));
    el.toggleClass('faded', (e.fadeIn || []).includes(v));
  }
  for (const [id, views] of Object.entries(NODE_FADE)) cy.getElementById(id).toggleClass('faded', views.includes(v));
  stopPlay();
  renderTrace();
  setStep(-1);
  cy.fit(undefined, 30);
}
$$('#mapViews button').forEach((b) => b.addEventListener('click', () => setMapView(b.dataset.map)));

function renderTrace() {
  const t = D.map.traces[mapView];
  $('#traceName').textContent = 'Walk through: ' + t.name;
  $('#traceSteps').innerHTML = t.steps.map(([, text], i) => `<li data-i="${i}">${esc(text)}</li>`).join('');
  $$('#traceSteps li').forEach((li) => li.addEventListener('click', () => { stopPlay(); setStep(Number(li.dataset.i)); }));
}
function setStep(i) {
  const steps = D.map.traces[mapView].steps;
  step = Math.max(-1, Math.min(i, steps.length - 1));
  $$('#traceSteps li').forEach((li) => li.classList.toggle('is-on', Number(li.dataset.i) === step));
  cy.elements().removeClass('dim hl');
  if (step < 0) return;
  const ids = steps[step][0].split(' ');
  cy.elements().not('.group').addClass('dim');
  for (const id of ids) cy.getElementById(id).removeClass('dim').addClass('hl');
  const first = ids.find((id) => id.startsWith('e_')) || ids[0];
  showInfo(first);
}
function stopPlay() { clearInterval(timer); timer = null; $('#tracePlay').textContent = '▶ Play'; }
$('#tracePrev').addEventListener('click', () => { stopPlay(); setStep(step - 1); });
$('#traceNext').addEventListener('click', () => { stopPlay(); setStep(step + 1); });
$('#tracePlay').addEventListener('click', () => {
  if (timer) return stopPlay();
  const n = D.map.traces[mapView].steps.length;
  setStep(step >= n - 1 ? 0 : step + 1);
  $('#tracePlay').textContent = '■ Stop';
  timer = setInterval(() => { if (step >= n - 1) return stopPlay(); setStep(step + 1); }, 2600);
});

function showInfo(id) {
  if (!id) { $('#infoTitle').textContent = 'Click any box or arrow'; $('#info').innerHTML = '<tr><td class="dim">Details appear here.</td></tr>'; return; }
  const n = D.map.nodes.find((x) => x.id === id);
  const e = D.map.edges.find((x) => x.id === id);
  const g = D.map.groups.find((x) => x.id === id);
  if (g) { $('#infoTitle').textContent = g.label; $('#info').innerHTML = '<tr><td class="dim">A network segment. The Hub\'s LAN bypass covers only 192.168.0.0/24.</td></tr>'; return; }
  const item = n || e;
  if (!item) return;
  $('#infoTitle').innerHTML = n ? esc(n.label.split('\n')[0]) : `${esc(e.label)} <span class="b" style="color:${KIND[e.kind].color};border-color:${KIND[e.kind].color}">${esc(KIND[e.kind].name)}</span>`;
  $('#info').innerHTML = item.info.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
}

// deep link: #map, #options, …
const start = location.hash.slice(1);
if (start && $(`#tabs button[data-view="${start}"]`)) show(start);
