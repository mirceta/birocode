// Understanding app — arch state off the request path (fleet task 6124c147). Numbers in ./data.js.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const D = window.PERF_DATA;
const fmt = (n) => Number(n).toLocaleString('en-US');

$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
  if (b.dataset.view === 'backoff') drawBackoff();
}));

// ── 1. the poll model ───────────────────────────────────────────────────────────────────
function path() {
  const fixed = $('#fixToggle').checked;
  const repos = +$('#repos').value; const gitMs = +$('#gitMs').value;
  $('#reposOut').value = repos; $('#gitMsOut').value = gitMs;
  $('#pipe').classList.toggle('fixed', fixed);
  // Before: the 20 s cache expires for every repo at once, so one poll in three pays the whole
  // serial walk; after: the request thread reads the snapshot and git runs in the worker.
  const walkMs = repos * gitMs;
  $('#mReq').textContent = fixed ? '2–40 ms (a dictionary read + JSON)' : `${fmt(walkMs)} ms on a cold cache (one poll in ~3), queued behind the git gate`;
  $('#mReq').className = fixed ? 'ok' : walkMs > 5000 ? 'bad' : 'warn';
  $('#mGit').textContent = fixed ? `0 on the request thread · ${repos} × 9–17 in the worker, once per 20 s, 4 at a time` : `${repos} × 9–17 = ${fmt(repos * 9)}–${fmt(repos * 17)}, serial`;
  $('#mSee').textContent = fixed ? 'the Arch tab repaints every 3 s; a branch change shows within ~30 s' : `the Arch tab "takes forever to load"; every proxied page waits behind it`;
  $('#mSee').className = fixed ? 'ok' : 'bad';
  $$('.stage').forEach((s) => { s.classList.remove('hot', 'cool'); if (s.dataset.k === 'list' || s.dataset.k === 'git') s.classList.add(fixed ? 'cool' : 'hot'); });
}
['#fixToggle', '#repos', '#gitMs'].forEach((s) => $(s).addEventListener('input', path));
path();

// ── 2. evidence ─────────────────────────────────────────────────────────────────────────
$('#logTable').innerHTML = '<tr><th>What</th><th class="num">Count</th><th>Note</th></tr>'
  + D.hubLog.map((r) => `<tr><td>${r.what}</td><td class="num">${fmt(r.count)}</td><td class="dim">${r.note}</td></tr>`).join('');

// ── 3. backoff ──────────────────────────────────────────────────────────────────────────
const backoffMs = (k) => k <= 0 ? 0 : Math.min(120000, 8000 * 2 ** Math.min(k - 1, 8));
function dialsIn(hours) {
  const total = hours * 3600 * 1000; let t = 0, k = 0, dials = 0;
  while (t < total) { k++; dials++; t += backoffMs(k); }
  return { dials, steps: Math.min(k, 5) };
}
function backoff() {
  const h = +$('#hoursDown').value; $('#hoursDownOut').value = h;
  const passes = Math.round(h * 3600 / 2.5);
  const { dials, steps } = dialsIn(h);
  $('#mDials').innerHTML = `<span class="before">${fmt(passes)}</span> → <span class="after">${fmt(dials)}</span>`;
  $('#mLogLines').innerHTML = `<span class="before">${fmt(passes)}</span> → <span class="after">${steps} (+1 every ~50 min at the cap, +1 on recovery)</span>`;
  const reads = Math.round(h * 3600 / 10);
  $('#mWait').innerHTML = `<span class="before">${fmt(reads)} pulls × 8 s = ${fmt(Math.round(reads * 8 / 60))} min</span> → <span class="after">0 — answered at once</span>`;
  drawBackoff();
}
function drawBackoff() {
  const c = $('#backoffChart'); if (!c) return; const ctx = c.getContext('2d'); const W = c.width, H = c.height;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0f1117'; ctx.fillRect(0, 0, W, H);
  const span = 10 * 60 * 1000; const x = (t) => 40 + (t / span) * (W - 60);
  ctx.strokeStyle = '#3a3f4a'; ctx.fillStyle = '#9aa3b2'; ctx.font = '12px system-ui';
  for (let m = 0; m <= 10; m += 2) { ctx.beginPath(); ctx.moveTo(x(m * 60000), 20); ctx.lineTo(x(m * 60000), H - 30); ctx.stroke(); ctx.fillText(m + ' min', x(m * 60000) - 14, H - 12); }
  ctx.fillText('before: a dial every 2.5 s', 44, 36); ctx.fillText('after: 8 · 16 · 32 · 64 s, then every 2 min', 44, 116);
  ctx.strokeStyle = '#e5484d'; for (let t = 0; t < span; t += 2500) { ctx.beginPath(); ctx.moveTo(x(t), 44); ctx.lineTo(x(t), 84); ctx.stroke(); }
  ctx.strokeStyle = '#3fb950'; ctx.lineWidth = 3; let t = 0, k = 0; while (t < span) { ctx.beginPath(); ctx.moveTo(x(t), 124); ctx.lineTo(x(t), 164); ctx.stroke(); k++; t += backoffMs(k); } ctx.lineWidth = 1;
}
$('#hoursDown').addEventListener('input', backoff); backoff();

// ── 4. numbers ──────────────────────────────────────────────────────────────────────────
if (D.lab) {
  const rows = Object.keys(D.lab.before.latency);
  $('#latTable').innerHTML = '<tr><th>Endpoint</th><th class="num">before p50 / p95 / max</th><th class="num">after p50 / p95 / max</th></tr>'
    + rows.map((k) => { const b = D.lab.before.latency[k], a = D.lab.after.latency[k]; const hot = k === 'arch' || k === 'fleetStatus' || k === 'requests';
      return `<tr><td><code>${k}</code></td><td class="num ${hot ? 'before' : ''}">${b.p50} / ${b.p95} / ${fmt(b.max)} ms</td><td class="num ${hot ? 'after' : ''}">${a.p50} / ${a.p95} / ${fmt(a.max)} ms</td></tr>`; }).join('');
  $('#bars').innerHTML = D.lab.bars.map((m) => {
    const max = Math.max(m.before, m.after) || 1;
    return `<div class="bar"><div class="bar__label"><span>${m.label}</span><span class="dim">${m.unit}</span></div>
      <div class="bar__track"><div class="bar__fill before" style="width:${(m.before / max) * 100}%">before · ${fmt(m.before)}</div></div>
      <div class="bar__track"><div class="bar__fill after" style="width:${(m.after / max) * 100}%">after · ${fmt(m.after)}</div></div></div>`;
  }).join('');
  $('#numbersNote').textContent = D.lab.note;
}

// ── 5. polling audit ────────────────────────────────────────────────────────────────────
$('#pollTable').innerHTML = '<tr><th>Surface</th><th>Poller</th><th>Cadence</th><th>Hidden-tab guard</th><th>Change</th></tr>'
  + D.pollers.map((p) => `<tr><td>${p.surface}</td><td><code>${p.poller}</code></td><td>${p.cadence}</td><td>${p.guard}</td><td class="${p.change && p.change !== '—' ? 'after' : 'dim'}">${p.change || '—'}</td></tr>`).join('');
