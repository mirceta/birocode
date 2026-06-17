// Autopilot local app (plans/loop-autopilot.md). Build-less, vanilla JS.
// Served under /api/localview/{repoId}/app/autopilot/ — so we derive the API base
// from our own location (handles both direct :5099 and the off-box /preview/ prefix)
// and call the SAME-ORIGIN /api/autopilot endpoints, which carry the session cookie.
//
// The markup + classes mirror the design in understanding-app/ (the "What you'd
// see — the Autopilot tab" mock): a subtabbed card with a control bar, .agent
// rows carrying .st-* state pills, and columned .log lists with a flash on new rows.

const API = (() => {
  const path = location.pathname;
  const marker = '/api/localview/';
  const i = path.indexOf(marker);
  const prefix = i >= 0 ? path.slice(0, i) : ''; // '' direct, '/preview' behind IIS
  return prefix + '/api/autopilot';
})();

const $ = (id) => document.getElementById(id);
const POLL_MS = 4000;
let busy = false;          // suppress polling reconcile while a mutation is in flight
let lastEnabled = true;    // remember kill-switch state for the kill button handler
const seenLog = new Set(); // keys of log rows already rendered (so only NEW rows flash)
const seenAudit = new Set();
// Intercepted feed: keep the latest entries so reveal timers can re-render a single
// row without waiting for the next poll; track first-seen-by-client for the spinner.
let lastIntercepts = [];
const seenIntercept = new Set();
const interceptFirstSeen = new Map(); // id -> client ms when first rendered
const REVEAL_MS = 1500;               // brief "processing" spinner on a freshly-arrived row

function show(el, on) { el.hidden = !on; }
const fmtTime = (ms) => new Date(ms).toLocaleTimeString();

// ---- subtab switching ----
$('subtabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-sub]');
  if (!btn) return;
  for (const b of $('subtabs').querySelectorAll('button')) b.classList.toggle('on', b === btn);
  for (const p of document.querySelectorAll('.subpanel'))
    p.hidden = p.dataset.panel !== btn.dataset.sub;
});

async function load() {
  if (busy) return;
  try {
    const res = await fetch(API, { headers: { 'Accept': 'application/json' } });
    if (res.status === 403) {            // operator gate is off
      show($('gate-off'), true); show($('err'), false); show($('live'), false);
      $('poll').textContent = 'gated';
      return;
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const state = await res.json();
    show($('gate-off'), false); show($('err'), false); show($('live'), true);
    render(state);
    $('poll').textContent = 'updated ' + fmtTime(Date.now());
  } catch (e) {
    show($('err'), true);
    $('err').textContent = 'Could not reach the autopilot API: ' + e.message;
  }
}

function render(s) {
  lastEnabled = !!s.enabled;
  const auto = !!s.autoAdvance;

  // Control bar.
  $('autoAdvance').classList.toggle('on', auto);
  $('aa-note').textContent = auto ? 'sends confident replies' : 'suggest only';
  $('th-val').textContent = (s.threshold ?? 0).toFixed(2);
  $('denylist').innerHTML = (s.denyList || []).length
    ? (s.denyList).map((d) => `<code>${esc(d)}</code>`).join(' ')
    : '<span class="muted">none</span>';

  const kill = $('kill');
  if (lastEnabled) { kill.textContent = '■ Kill switch'; kill.classList.remove('kill--resume'); }
  else { kill.textContent = '▶ Resume engine'; kill.classList.add('kill--resume'); }

  // Agents.
  const agents = s.agents || [];
  $('n-agents').textContent = agents.length;
  const list = $('agents');
  list.innerHTML = '';
  if (!agents.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No agents discovered on this machine yet.';
    list.appendChild(li);
  }
  for (const a of agents) list.appendChild(agentRow(a, auto));

  // Intercepted feed (live): every message the engine grabbed and processed.
  lastIntercepts = s.intercepts || [];
  renderIntercepts();

  // Suggestion history (engine log) + auto-sent audit trail.
  renderLog($('log'), (s.log || []), seenLog, logRow);
  const audit = s.audit || [];
  $('n-audit').textContent = audit.length;
  renderLog($('audit'), audit, seenAudit, auditRow);
}

// --- intercepted feed ---
function renderIntercepts() {
  const ul = $('intercepts');
  ul.innerHTML = '';
  if (!lastIntercepts.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'No interceptions yet — arm an agent and the engine will start grabbing its replies.';
    ul.appendChild(li);
    return;
  }
  const now = Date.now(); // backend sends newest-first already
  for (const e of lastIntercepts) {
    if (!interceptFirstSeen.has(e.id)) interceptFirstSeen.set(e.id, now);
    const li = document.createElement('li');
    if (!seenIntercept.has(e.id)) { li.classList.add('new'); seenIntercept.add(e.id); }
    li.appendChild(span('t', fmtTime(e.at)));
    li.appendChild(span('ag', e.repoName));
    const snip = span('snip', e.snippet || '');
    snip.title = e.snippet || '';
    li.appendChild(snip);

    const status = document.createElement('span');
    status.className = 'status';
    li.appendChild(status);

    const processing = e.phase === 'processing';
    const revealLeft = REVEAL_MS - (now - interceptFirstSeen.get(e.id));
    if (processing) {
      li.classList.add('processing');
      fillProcessing(status, 'processing…');
    } else if (revealLeft > 0) {
      // freshly arrived & already resolved: show the spinner briefly, then reveal
      // the outcome in place (no full rebuild, so the flash isn't cut short).
      li.classList.add('processing');
      fillProcessing(status, 'intercepted…');
      setTimeout(() => {
        if (!status.isConnected) return;
        li.classList.remove('processing');
        fillOutcome(status, e);
      }, revealLeft);
    } else {
      fillOutcome(status, e);
    }
    ul.appendChild(li);
  }
}

function fillProcessing(status, label) {
  status.innerHTML = '';
  const sp = document.createElement('span');
  sp.className = 'spinner';
  status.append(sp, span('proc-label', label));
}

function fillOutcome(status, e) {
  status.innerHTML = '';
  const out = e.outcome || 'suggested';
  status.appendChild(span('outcome ' + out, out));
  if (e.label && (out === 'sent' || out === 'suggested')) {
    const code = document.createElement('code');
    code.textContent = e.label;
    status.appendChild(code);
  }
}

// --- agents ---
function agentRow(a, auto) {
  const li = document.createElement('li');
  li.className = 'agent';
  const d = a.decision;
  if (d === 'escalate') li.classList.add('agent--esc');
  if (d === 'off') li.classList.add('agent--off');

  // state pill: a confident suggestion shows as "advancing" only when auto-advance is on.
  let cls = 'st-off', txt = d;
  if (d === 'escalate') { cls = 'st-esc'; txt = 'needs you'; }
  else if (d === 'suggestion') { cls = auto ? 'st-send' : 'st-sugg'; txt = auto ? 'advancing' : 'suggestion'; }

  li.appendChild(span('agent__state ' + cls, txt));
  li.appendChild(span('agent__id', a.repoName));
  li.appendChild(predCell(a, d));

  const btn = document.createElement('button');
  btn.className = 'mini' + (a.armed ? ' on' : '');
  btn.textContent = a.armed ? 'armed' : 'Arm';
  btn.title = a.armed ? 'Click to disarm' : 'Click to arm';
  btn.onclick = () => post({ repoId: a.repoId, armed: !a.armed });
  li.appendChild(btn);
  return li;
}

function predCell(a, d) {
  const el = document.createElement('span');
  if (d === 'suggestion') {
    el.className = 'agent__pred';
    el.innerHTML = `→ <code>${esc(a.label || '…')}</code>` +
      (a.confidence ? ` <span class="conf">${a.confidence.toFixed(2)}</span>` : '');
  } else if (d === 'escalate') {
    el.className = 'agent__pred muted';
    el.textContent = 'escalated · ' + (a.reason || a.lastMessage || '');
  } else {
    el.className = 'agent__pred muted';
    el.textContent = a.reason || '—';
  }
  return el;
}

// --- log lists ---
function renderLog(ul, entries, seen, rowFn) {
  ul.innerHTML = '';
  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Nothing yet.';
    ul.appendChild(li);
    return;
  }
  // newest first
  for (const e of [...entries].reverse()) {
    const { li, key } = rowFn(e);
    if (!seen.has(key)) { li.classList.add('new'); seen.add(key); }
    ul.appendChild(li);
  }
}

function logRow(e) {
  const li = document.createElement('li');
  const out = outcomeClass(e.outcome);
  li.appendChild(span('t', fmtTime(e.at)));
  li.appendChild(span('ag', e.repoName));
  li.appendChild(span('out ' + out.cls, out.txt));
  const pred = document.createElement('span');
  pred.className = 'pred';
  pred.innerHTML = e.label ? `<code>${esc(e.label)}</code>` : '<span class="muted">—</span>';
  li.appendChild(pred);
  li.appendChild(span('cf', e.confidence ? e.confidence.toFixed(2) : ''));
  return { li, key: e.at + '|' + e.repoName + '|' + (e.label || '') + '|' + e.outcome };
}

function auditRow(e) {
  const li = document.createElement('li');
  li.appendChild(span('t', fmtTime(e.at)));
  li.appendChild(span('ag', e.repoName));
  li.appendChild(span('out out-sent', 'sent'));
  const pred = document.createElement('span');
  pred.className = 'pred';
  pred.innerHTML = `<code>${esc(e.prompt || '')}</code>`;
  pred.title = e.answeredMessage || '';
  li.appendChild(pred);
  li.appendChild(span('cf', e.confidence ? e.confidence.toFixed(2) : ''));
  return { li, key: e.at + '|' + e.repoName + '|' + (e.prompt || '') };
}

function outcomeClass(o) {
  const v = (o || '').toLowerCase();
  if (v.includes('sent') || v.includes('advance')) return { cls: 'out-sent', txt: 'sent' };
  if (v.includes('esc')) return { cls: 'out-esc', txt: 'escalate' };
  if (v.includes('skip')) return { cls: 'out-skip', txt: 'skipped' };
  return { cls: 'out-sugg', txt: 'suggestion' };
}

// ---- helpers ----
function span(cls, text) { const el = document.createElement('span'); el.className = cls; el.textContent = text; return el; }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

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

// ---- control wiring ----
$('autoAdvance').addEventListener('click', () => post({ autoAdvance: !$('autoAdvance').classList.contains('on') }));
$('kill').addEventListener('click', () => post({ enabled: !lastEnabled }));
$('th-up').addEventListener('click', () => bumpThreshold(+0.05));
$('th-down').addEventListener('click', () => bumpThreshold(-0.05));

function bumpThreshold(delta) {
  const cur = parseFloat($('th-val').textContent) || 0.85;
  const next = Math.min(0.99, Math.max(0.50, Math.round((cur + delta) * 100) / 100));
  post({ threshold: next });
}

load();
setInterval(load, POLL_MS);
