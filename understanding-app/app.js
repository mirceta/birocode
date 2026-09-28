// Understanding app — hub performance (fleet task 3bcaff3a). All numbers come from ./data.js,
// which is a transcription of the lab runs recorded in openspec/changes/hub-perf-log-path/design.md.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const D = window.PERF_DATA;
const fmt = (n) => n.toLocaleString('en-US');

// ── tabs ───────────────────────────────────────────────────────────────────────────────
$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
  if (b.dataset.view === 'pump') drawChart();
}));

// ── 1. the pipeline model ──────────────────────────────────────────────────────────────
// Per-line costs are the lab's: ~0.35–0.5 ms CPU and ~700 B RSS per admitted request on the
// unmodified build, with the append getting dearer as the box grows; the box is trimmed after.
function story() {
  const fixed = $('#fixToggle').checked;
  const rate = +$('#rate').value; const hours = +$('#hours').value;
  $('#rateOut').value = rate; $('#hoursOut').value = hours;
  $('#pipe').classList.toggle('fixed', fixed);
  const linesPerHour = fixed ? Math.round(2 * 12 + rate * 3600 * 0.05) : rate * 3600;   // after: 1 admission line per address per 5 min + the ~5 % of requests that log on their own
  const invokesPerHour = fixed ? 4 * 3600 : linesPerHour;
  const boxBytes = fixed ? Math.min(600_000, linesPerHour * hours * 95) : linesPerHour * hours * 95;
  const uiShare = fixed ? 0.5 : Math.min(100, 4 + (rate / 7) * (8 + hours * 6));            // % of the UI thread's time
  const risk = fixed ? 'none from the activity box' : boxBytes > 20e6 ? 'AccessViolationException territory — the hub has died here twice' : boxBytes > 8e6 ? 'the lab crashed at ~15 MB of box text' : 'growing';
  $('#mLines').textContent = fmt(linesPerHour);
  $('#mInvokes').textContent = fmt(invokesPerHour) + (fixed ? ' (one batch per 250 ms, whatever the load)' : '');
  $('#mBox').textContent = boxBytes > 1e6 ? (boxBytes / 1e6).toFixed(1) + ' MB' : Math.round(boxBytes / 1e3) + ' KB';
  $('#mUi').textContent = fixed ? 'idle between batches' : `${Math.round(uiShare)} % of the second appending + scrolling the box`;
  $('#mUi').className = fixed ? 'ok' : uiShare > 60 ? 'bad' : uiShare > 25 ? 'warn' : '';
  $('#mRisk').textContent = risk; $('#mRisk').className = fixed ? 'ok' : boxBytes > 8e6 ? 'bad' : 'warn';
  $$('.stage').forEach((s) => { s.classList.remove('hot', 'cool'); if (s.dataset.k !== 'req') s.classList.add(fixed ? 'cool' : 'hot'); });
}
['#fixToggle', '#rate', '#hours'].forEach((s) => $(s).addEventListener('input', story));
story();

// ── 2. evidence tables ─────────────────────────────────────────────────────────────────
$('#logTable').innerHTML = '<tr><th>Day</th><th class="num">Size</th><th class="num">Lines</th><th class="num">Admitted (LAN)</th><th class="num">[GIT]</th></tr>'
  + D.hubLogs.map((r) => `<tr><td>${r.day}</td><td class="num">${r.size}</td><td class="num">${fmt(r.lines)}</td><td class="num">${fmt(r.admitted)} <span class="dim">(${Math.round(r.admitted / r.lines * 100)} %)</span></td><td class="num">${fmt(r.git)}</td></tr>`).join('');

// ── 3. pump chart ──────────────────────────────────────────────────────────────────────
const COLORS = { 'before, admissions': '#e5484d', 'before, admissions (long)': '#ff8a8e', 'before, file line': '#d29922', 'after, admissions': '#3fb950', 'after, file line': '#5ea0ef' };
function drawChart() {
  const metric = $$('input[name=metric]').find((r) => r.checked).value;
  const c = $('#chart'); const ctx = c.getContext('2d'); const W = c.width; const H = c.height;
  ctx.clearRect(0, 0, W, H); ctx.fillStyle = '#0f1117'; ctx.fillRect(0, 0, W, H);
  const runs = D.pump.filter((r) => r.samples.length > 1);
  const maxX = Math.max(...runs.flatMap((r) => r.samples.map((s) => s.lines)));
  const maxY = Math.max(...runs.flatMap((r) => r.samples.map((s) => s[metric] || 0))) * 1.1 || 1;
  const L = 56, R = 16, T = 16, B = 40;
  const x = (v) => L + (v / maxX) * (W - L - R); const y = (v) => H - B - (v / maxY) * (H - T - B);
  ctx.strokeStyle = '#3a3f4a'; ctx.fillStyle = '#9aa3b2'; ctx.font = '12px system-ui'; ctx.lineWidth = 1;
  for (let i = 0; i <= 5; i++) { const v = (maxY / 5) * i; ctx.beginPath(); ctx.moveTo(L, y(v)); ctx.lineTo(W - R, y(v)); ctx.stroke(); ctx.fillText(Math.round(v), 6, y(v) + 4); }
  for (let v = 0; v <= maxX; v += 50000) { ctx.fillText((v / 1000) + 'k', x(v) - 8, H - B + 16); }
  ctx.fillText('log lines written', W / 2 - 40, H - 6);
  ctx.fillText({ rssMB: 'RSS (MB)', cpuMsPer1k: 'CPU ms / 1k req', probeMs: 'probe ms' }[metric], L + 4, T + 4);
  for (const r of runs) {
    ctx.strokeStyle = COLORS[r.label] || '#fff'; ctx.lineWidth = 2.5; ctx.beginPath();
    r.samples.forEach((s, i) => { const px = x(s.lines), py = y(s[metric] || 0); i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); });
    ctx.stroke();
    const last = r.samples[r.samples.length - 1];
    if (r.crashed) { ctx.fillStyle = COLORS[r.label]; ctx.font = 'bold 16px system-ui'; ctx.fillText('✖ crash', x(last.lines) + 4, y(last[metric] || 0) - 6); ctx.font = '12px system-ui'; }
  }
  $('#legend').innerHTML = runs.map((r) => `<span><i style="background:${COLORS[r.label]}"></i>${r.label}${r.crashed ? ' — <b>crashed</b>' : ''}</span>`).join('');
  $('#pumpNote').textContent = D.pumpNote;
}
$$('input[name=metric]').forEach((r) => r.addEventListener('change', drawChart));
drawChart();

// ── 4. numbers ─────────────────────────────────────────────────────────────────────────
$('#bars').innerHTML = D.mix.map((m) => {
  const max = Math.max(m.before, m.after);
  return `<div class="bar"><div class="bar__label"><span>${m.label}</span><span class="dim">${m.unit}</span></div>
    <div class="bar__track"><div class="bar__fill before" style="width:${(m.before / max) * 100}%">before · ${fmt(m.before)}</div></div>
    <div class="bar__track"><div class="bar__fill after" style="width:${(m.after / max) * 100}%">after · ${fmt(m.after)}</div></div></div>`;
}).join('');
$('#pageTable').innerHTML = '<tr><th>Page</th><th class="num">before</th><th class="num">after</th></tr>'
  + D.pages.map((p) => `<tr><td>${p.page}</td><td class="num">${p.before} ms</td><td class="num">${p.after} ms</td></tr>`).join('');
$('#epTable').innerHTML = '<tr><th>Endpoint</th><th class="num">before</th><th class="num">after</th></tr>'
  + D.endpoints.map((e) => `<tr><td><code>${e.path}</code></td><td class="num before">${e.before}</td><td class="num ${e.changed ? 'after' : ''}">${e.after}</td></tr>`).join('');
