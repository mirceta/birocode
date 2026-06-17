// Autopilot dev local app (plans/loop-autopilot.md). Build-less, vanilla JS.
// Served under /api/localview/{repoId}/app/autopilot/ — so we derive the API base
// from our own location (handles both direct :5099 and the off-box /preview/ prefix)
// and call the SAME-ORIGIN /api/autopilot endpoints, which carry the session cookie.

const API = (() => {
  const path = location.pathname;
  const marker = '/api/localview/';
  const i = path.indexOf(marker);
  const prefix = i >= 0 ? path.slice(0, i) : ''; // '' direct, '/preview' behind IIS
  return prefix + '/api/autopilot';
})();

const $ = (id) => document.getElementById(id);
const POLL_MS = 4000;
let busy = false; // suppress polling reconcile while a mutation is in flight

function show(el, on) { el.hidden = !on; }

async function load() {
  if (busy) return;
  try {
    const res = await fetch(API, { headers: { 'Accept': 'application/json' } });
    if (res.status === 403) {            // operator gate is off
      show($('gate-off'), true);
      show($('err'), false);
      show($('live'), false);
      $('poll').textContent = 'gated';
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const state = await res.json();
    show($('gate-off'), false);
    show($('err'), false);
    show($('live'), true);
    render(state);
    $('poll').textContent = 'updated ' + new Date().toLocaleTimeString();
  } catch (e) {
    show($('err'), true);
    $('err').textContent = 'Could not reach the autopilot API: ' + e.message;
  }
}

function render(s) {
  $('enabled').checked = !!s.enabled;
  $('th-val').textContent = (s.threshold ?? 0).toFixed(2);
  $('denylist').textContent = (s.denyList || []).join(', ') || '(none)';

  const tbody = $('agents');
  tbody.innerHTML = '';
  for (const a of (s.agents || [])) {
    const tr = document.createElement('tr');
    tr.appendChild(td(a.repoName));
    tr.appendChild(armCell(a));
    tr.appendChild(pillCell(a.decision));
    tr.appendChild(td(a.label || '—'));
    tr.appendChild(td(a.confidence ? a.confidence.toFixed(2) : '—', 'conf'));
    tr.appendChild(reasonCell(a));
    tbody.appendChild(tr);
  }

  const log = $('log');
  log.innerHTML = '';
  for (const e of (s.log || [])) {
    const li = document.createElement('li');
    const t = document.createElement('time');
    t.textContent = new Date(e.at).toLocaleTimeString();
    const txt = document.createElement('span');
    txt.textContent = `${e.repoName}: ${e.outcome}` +
      (e.label ? ` "${e.label}"` : '') +
      (e.confidence ? ` (${e.confidence.toFixed(2)})` : '');
    li.append(t, txt);
    log.appendChild(li);
  }
}

function td(text, cls) {
  const el = document.createElement('td');
  el.textContent = text;
  if (cls) el.className = cls;
  return el;
}

function pillCell(decision) {
  const el = document.createElement('td');
  const span = document.createElement('span');
  span.className = 'pill pill--' + decision;
  span.textContent = decision;
  el.appendChild(span);
  return el;
}

function reasonCell(a) {
  const el = document.createElement('td');
  el.textContent = a.reason || '';
  if (a.lastMessage) {
    const s = document.createElement('div');
    s.className = 'snippet';
    s.textContent = a.lastMessage;
    el.appendChild(s);
  }
  return el;
}

function armCell(a) {
  const el = document.createElement('td');
  const btn = document.createElement('button');
  btn.className = 'armbtn' + (a.armed ? ' armbtn--on' : '');
  btn.textContent = a.armed ? 'Armed' : 'Disarmed';
  btn.onclick = () => post({ repoId: a.repoId, armed: !a.armed });
  el.appendChild(btn);
  return el;
}

async function post(body) {
  busy = true;
  try {
    const res = await fetch(API + '/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res.status === 403) { busy = false; return load(); }
    if (res.ok) render(await res.json());
  } catch (e) {
    show($('err'), true);
    $('err').textContent = 'Update failed: ' + e.message;
  } finally {
    busy = false;
  }
}

// Controls
$('enabled').addEventListener('change', (e) => post({ enabled: e.target.checked }));
$('th-up').addEventListener('click', () => bumpThreshold(+0.05));
$('th-down').addEventListener('click', () => bumpThreshold(-0.05));

function bumpThreshold(delta) {
  const cur = parseFloat($('th-val').textContent) || 0.85;
  const next = Math.min(0.99, Math.max(0.50, Math.round((cur + delta) * 100) / 100));
  post({ threshold: next });
}

load();
setInterval(load, POLL_MS);
