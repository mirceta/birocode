// Understanding app — Status → Agents: split / merged + "finished, not yet checked" (fleet task 4a1fb7ee).
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
}));

// ── 1. the mark ────────────────────────────────────────────────────────────────────────────
let state = 'idle'; let expanded = false; let note = 'Idle: a plain chip. It is not in the running view.';
function paintMark() {
  const chip = $('#chip'); const dot = $('#dot');
  chip.className = 'chip' + (state === 'running' ? ' chip--running' : state === 'finished' ? ' chip--finished' : '');
  dot.className = 'dot' + (state === 'running' ? ' dot--running' : state === 'finished' ? ' dot--finished' : '');
  dot.textContent = state === 'finished' ? '!' : '';
  $('#chipSub').textContent = state === 'running' ? '⎇ feature/x · 1 min' : state === 'finished' ? '⎇ feature/x · finished' : '⎇ feature/x';
  $('#btnStart').disabled = state === 'running';
  $('#btnFinish').disabled = state !== 'running';
  $('#btnCheck').disabled = state !== 'finished';
  $('#runningView').textContent = state === 'idle' ? 'running view: not listed' : state === 'running' ? 'running view: listed (running)' : 'running view: STILL listed (finished, not checked)';
  $('#note').textContent = note + (expanded ? ' · details are open — the mark is untouched by that.' : '');
}
$('#btnStart').addEventListener('click', () => { state = 'running'; note = 'Running: the dot pulses; the agent is in the running view.'; paintMark(); });
$('#btnFinish').addEventListener('click', () => { state = 'finished'; note = 'The turn ended while you were away. The dock\'s unseen-result latch is set on the server; the chip repaints with "!" and STAYS in the running view.'; paintMark(); });
$('#btnExpand').addEventListener('click', () => { expanded = !expanded; paintMark(); });
$('#btnCheck').addEventListener('click', () => { state = 'idle'; note = 'You marked it checked: POST /api/arch/fleet/checked cleared the latch (here, or relayed to the peer). A normal idle agent again; it left the running view.'; paintMark(); });
paintMark();

// ── 2. split vs merged ─────────────────────────────────────────────────────────────────────
const AGENTS = [
  { name: 'prg#1', occ: 'occupied' }, { name: 'web#1', occ: 'occupied' }, { name: 'docs#1', occ: 'free' }, { name: 'api#1', occ: 'occupied' }, { name: 'shop#1', occ: 'free' },
];
const mini = (a, marker) => `<span class="mini mini--${a.occ}"><span class="dot"></span>${marker ? `<span class="marker marker--${a.occ}">${a.occ}</span>` : ''}${a.name}</span>`;
function paintLayout() {
  const merged = $('#mergedToggle').checked;
  const occ = AGENTS.filter((a) => a.occ === 'occupied'); const free = AGENTS.filter((a) => a.occ === 'free');
  $('#layoutDemo').innerHTML = `<div class="machineDemo"><h3>● spacex</h3>${merged
    ? `<div class="strip">${[...occ, ...free].map((a) => mini(a, true)).join('')}</div>`
    : `<div class="sec sec--occupied"><h4>Occupied ${occ.length}</h4><div class="strip">${occ.map((a) => mini(a, false)).join('')}</div></div><div class="sec sec--free"><h4>Free ${free.length}</h4><div class="strip">${free.map((a) => mini(a, false)).join('')}</div></div>`}</div>`;
}
$('#mergedToggle').addEventListener('change', paintLayout);
paintLayout();
