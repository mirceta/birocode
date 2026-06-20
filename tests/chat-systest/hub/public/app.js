// Chat system-test hub — vanilla SPA. Relative URLs only (it runs under the
// /api/localview/<repo>/app/<id>/ proxy sub-path on the Local tab).

const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

let manifest = null;
let busy = false;            // a run / lifecycle op is streaming
const consoleEl = $('#console');

// ---- console -----------------------------------------------------------------
function clearConsole() { consoleEl.innerHTML = ''; }
function logLine(text, kind) {
  const span = el('span', kind || '');
  span.textContent = text + '\n';
  consoleEl.appendChild(span);
  consoleEl.scrollTop = consoleEl.scrollHeight;
}
function setSummary(text, state) {
  const s = $('#summary');
  s.textContent = text || '';
  s.className = 'summary' + (state ? ' ' + state : '');
}

// ---- generic SSE-over-fetch reader ------------------------------------------
async function streamPost(url, onEvent) {
  const res = await fetch(url, { method: 'POST' });
  if (!res.ok && !res.body) { onEvent({ type: 'err', msg: `HTTP ${res.status}` }); return; }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      for (const line of frame.split('\n')) {
        const t = line.trim();
        if (!t.startsWith('data:')) continue;
        try { onEvent(JSON.parse(t.slice(5).trim())); } catch { /* */ }
      }
    }
  }
}

// ---- instance status ---------------------------------------------------------
async function refreshInstance() {
  let info;
  try { info = await (await fetch('./api/instance')).json(); } catch { info = { up: false }; }
  const pill = $('#instPill'), dot = $('#brandDot');
  if (info.up) {
    pill.textContent = `instance up · ${info.base}${info.rid ? ' · rid ' + info.rid.slice(0, 8) : ' · no rid'}`;
    pill.className = 'pill up'; dot.className = 'dot up';
  } else {
    pill.textContent = info.hasState ? 'instance down (state stale)' : 'no instance';
    pill.className = 'pill down'; dot.className = 'dot down';
  }
  $('#btnUp').disabled = busy || info.up;
  $('#btnDown').disabled = busy || (!info.up && !info.hasState);
  return info;
}

// ---- render catalog ----------------------------------------------------------
function renderSuites() {
  const wrap = $('#suites'); wrap.innerHTML = '';
  for (const s of manifest.suites) {
    const card = el('div', 'card');
    const row1 = el('div', 'row1');
    row1.append(el('span', 'title', s.title));
    const costLabel = { none: 'no tokens', tiny: 'tiny spend', small: 'small spend', tokens: 'spends tokens' };
    row1.append(el('span', `cost ${s.cost}`, costLabel[s.cost] || s.cost));
    card.append(row1);
    card.append(el('div', 'blurb', s.blurb));

    const list = el('ul', 'scen');
    for (const id of s.scenarios) {
      const li = el('li'); const b = el('b', null, `#${id} `); li.append(b);
      li.append(document.createTextNode(manifest.scenarios[id] || '')); list.append(li);
    }
    const toggle = el('button', 'linkish', `show ${s.scenarios.length} scenarios`);
    toggle.onclick = () => { const open = list.classList.toggle('open'); toggle.textContent = `${open ? 'hide' : 'show'} ${s.scenarios.length} scenarios`; };

    const actions = el('div', 'actions');
    const run = el('button', 'btn', 'Run headless');
    run.title = 'Run end-to-end and read the verdict (how an agent runs it)';
    run.onclick = () => runSuite(s, 'headless');
    const stepThrough = el('button', 'btn ghost', 'Step through');
    stepThrough.title = 'Advance one step at a time and watch each step pass/fail';
    stepThrough.onclick = () => runSuite(s, 'interactive');
    actions.append(run, stepThrough, toggle);
    card.append(actions, list);
    wrap.append(card);
  }
}

function renderFindings() {
  const wrap = $('#findings'); wrap.innerHTML = '';
  $('#findCount').textContent = `(${manifest.findings.length})`;
  for (const f of manifest.findings) {
    const d = el('div', 'finding');
    const t = el('div', 'ft'); t.append(el('span', 'sev', f.severity), document.createTextNode(f.title));
    d.append(t, el('div', 'fd', f.detail));
    wrap.append(d);
  }
}

async function renderHistory() {
  let h = [];
  try { h = await (await fetch('./api/history')).json(); } catch { /* */ }
  const wrap = $('#history'); wrap.innerHTML = '';
  if (!h.length) { wrap.append(el('span', 'muted', 'none yet')); return; }
  for (const r of h.slice(0, 12)) {
    const row = el('div', 'hrow');
    row.append(el('span', `badge ${r.ok ? 'ok' : 'bad'}`, r.ok ? '✓' : '✗'));
    row.append(el('span', null, r.suite));
    row.append(el('span', 'muted', `${r.passed}/${r.total}`));
    row.append(el('span', 'muted', new Date(r.ts).toLocaleTimeString()));
    wrap.append(row);
  }
}

// ---- step list (interactive) -------------------------------------------------
const CTRL_IDS = ['btnNext', 'btnSkip', 'btnRest', 'btnAbort'];
let autoRest = false;   // "Run the rest" auto-advances each awaiting step
let awaiting = false;   // a step is paused, waiting for the operator

function showStepPanel(show) { $('#stepPanel').hidden = !show; if (show) $('#steps').innerHTML = ''; }
function setCtrlEnabled(on) { CTRL_IDS.forEach((id) => { const b = $('#' + id); if (b) b.disabled = !on; }); }

function stepCard(i) {
  let li = document.getElementById('step-' + i);
  if (!li) {
    li = el('li', 'stp'); li.id = 'step-' + i;
    li.innerHTML = '<span class="sdot"></span><div class="sbody"><div class="sname"></div>'
      + '<div class="sobs"></div><ul class="schecks"></ul></div><span class="stag"></span>';
    $('#steps').append(li);
  }
  return li;
}
function markStep(i, state, data = {}) {
  const li = stepCard(i);
  li.className = 'stp ' + state;
  if (data.name) li.querySelector('.sname').textContent = data.name;
  li.querySelector('.stag').textContent = state === 'await' ? 'ready' : state;
  const dot = li.querySelector('.sdot');
  dot.textContent = state === 'pass' ? '✓' : state === 'fail' ? '✗' : state === 'skip' ? '–' : (i + 1);
  if (data.observed) li.querySelector('.sobs').textContent = data.observed;
  if (data.checks) {
    const ul = li.querySelector('.schecks'); ul.innerHTML = '';
    for (const c of data.checks) {
      const ci = el('li', c.pass ? 'p' : 'f', c.name + (c.detail ? ` — ${c.detail}` : ''));
      ul.append(ci);
    }
  }
  if (state === 'await' || state === 'running') li.scrollIntoView({ block: 'nearest' });
}
async function sendCtrl(cmd) {
  awaiting = false; setCtrlEnabled(false);
  try { await fetch('./api/run/step', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd }) }); }
  catch (e) { logLine(`control error: ${e.message}`, 'err'); }
}

// ---- actions -----------------------------------------------------------------
// Disable suite/lifecycle buttons while busy, but NOT the step controls — the
// operator needs those live during an interactive run.
function setBusy(b) {
  busy = b;
  document.querySelectorAll('.btn').forEach((x) => {
    if (x.id === 'btnClear' || CTRL_IDS.includes(x.id)) return;
    x.disabled = b;
  });
}

async function runSuite(s, mode = 'headless') {
  if (busy) return;
  const interactive = mode === 'interactive';
  autoRest = false; awaiting = false;
  setBusy(true); clearConsole(); setSummary(interactive ? 'stepping…' : 'running…');
  showStepPanel(interactive); setCtrlEnabled(false);
  $('#consoleTitle').textContent = `Console — ${s.title}`;
  logLine(`▶ ${interactive ? 'stepping through' : 'running'} ${s.file}`, 'step');
  await streamPost(`./api/run/${s.id}?mode=${mode}`, (ev) => {
    if (ev.type === 'start') {
      logLine(`  mode=${ev.mode} · BASE=${ev.env.BASE} RID=${ev.env.RID || '(none)'} MODEL=${ev.env.MODEL}`, 'warn');
    } else if (ev.type === 'step') {
      if (ev.phase === 'await') {
        markStep(ev.i, 'await', { name: ev.name });
        if (autoRest) { sendCtrl('go'); }
        else { awaiting = true; setCtrlEnabled(true); setSummary(`step ${ev.i + 1} ready — click Next`); }
      } else if (ev.phase === 'start') {
        markStep(ev.i, 'running', { name: ev.name });
      } else if (ev.phase === 'end') {
        markStep(ev.i, ev.status, { name: ev.name, observed: ev.observed, checks: ev.checks });
      }
    } else if (ev.type === 'aborted') {
      logLine(`\n■ aborted at step ${ev.i + 1}`, 'fail');
    } else if (ev.type === 'summary') {
      setSummary(`${ev.passed}/${ev.total} passed`, ev.passed === ev.total ? 'ok' : 'bad');
    } else if (ev.type === 'line') {
      logLine(ev.line, ev.kind === 'pass' ? 'pass' : ev.kind === 'fail' ? 'fail' : ev.stream === 'err' ? 'err' : '');
    } else if (ev.type === 'exit') {
      const ok = ev.code === 0;
      setSummary(`${ev.passed}/${ev.total} passed`, ok ? 'ok' : 'bad');
      logLine(`\n■ exit ${ev.code} — ${ev.passed}/${ev.total} passed`, ok ? 'done' : 'fail');
    }
  }).catch((e) => logLine(`stream error: ${e.message}`, 'err'));
  setCtrlEnabled(false); awaiting = false;
  setBusy(false); await refreshInstance(); await renderHistory();
}

async function lifecycle(cmd) {
  if (busy) return;
  if (cmd === 'down' && !confirm('Kill the isolated instance and delete its scratch root?')) return;
  setBusy(true); clearConsole(); setSummary(cmd === 'up' ? 'launching…' : 'tearing down…');
  $('#consoleTitle').textContent = `Console — instance ${cmd}`;
  await streamPost(`./api/instance/${cmd}`, (ev) => {
    const map = { step: 'step', cmd: 'warn', out: '', err: 'err', warn: 'warn', done: 'done' };
    if (ev.type === 'exit') logLine(`\n■ exit ${ev.code}`, ev.code === 0 ? 'done' : 'fail');
    else logLine(`${ev.type === 'step' ? '› ' : ev.type === 'done' ? '✓ ' : '  '}${ev.msg || ''}`, map[ev.type] || '');
  }).catch((e) => logLine(`stream error: ${e.message}`, 'err'));
  setSummary('');
  setBusy(false); await refreshInstance();
}

// ---- boot --------------------------------------------------------------------
(async function boot() {
  $('#btnClear').onclick = clearConsole;
  $('#btnUp').onclick = () => lifecycle('up');
  $('#btnDown').onclick = () => lifecycle('down');
  $('#btnNext').onclick = () => { if (awaiting) sendCtrl('go'); };
  $('#btnSkip').onclick = () => { if (awaiting) sendCtrl('skip'); };
  $('#btnAbort').onclick = () => { autoRest = false; sendCtrl('abort'); };
  $('#btnRest').onclick = () => { autoRest = true; setSummary('running the rest…'); if (awaiting) sendCtrl('go'); };
  $('#planLink').onclick = (e) => { e.preventDefault(); alert('See plans/chat-system-tests.md in the repo for full scenario detail and results.'); };

  manifest = await (await fetch('./api/suites')).json();
  renderSuites(); renderFindings(); await renderHistory(); await refreshInstance();
  setInterval(() => { if (!busy) refreshInstance(); }, 5000);
})();
