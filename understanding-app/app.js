// Understanding app — the management board's load on the live hub (fleet task 1a17afbe).
// Every number comes from ./data.js: the live trace and the four browser waterfalls.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const D = window.BOARD_DATA;
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const kb = (b) => (b == null ? '—' : b >= 1024 * 1024 ? (b / 1048576).toFixed(2) + ' MB' : Math.round(b / 1024) + ' KB');

$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
}));

// ── 1. the waterfall ────────────────────────────────────────────────────────────────────
const pick = (name) => $$(`input[name=${name}]`).find((r) => r.checked).value;
function waterfall() {
  const key = `${pick('wfBuild')}${pick('wfNet') === 'lan' ? '-lan' : ''}`;
  const run = D.waterfalls[key]?.[pick('wfLoad')];
  if (!run) { $('#waterfall').innerHTML = '<p class="dim">no data</p>'; return; }
  const reqs = run.requests;
  const end = Math.max(1000, ...reqs.map((r) => r.start + (r.ms ?? 0)), run.firstCardMs || 0);
  const scale = Math.min(end, run.firstCardMs ? Math.max(run.firstCardMs * 1.3, 1500) : 12000);
  const hung = reqs.filter((r) => r.ms == null).length;
  $('#wfSummary').innerHTML = [
    ['first card on screen', run.firstCardMs == null ? '<b class="bad">not within 90 s</b>' : `<b class="${run.firstCardMs > 2000 ? 'bad' : run.firstCardMs > 800 ? 'warn' : 'ok'}">${fmt(run.firstCardMs)} ms</b>`],
    ['bytes on the wire', `<b>${fmt(run.wireKB)} KB</b> <span class="dim">(${fmt(run.decodedKB)} KB uncompressed) · ${run.requestCount} requests${hung ? ` · <span class="bad">${hung} never answered</span>` : ''}</span>`],
    ['script + layout', `<b>${fmt(run.scriptMs)} + ${fmt(run.layoutMs)} ms</b> <span class="dim">— rendering was never the problem</span>`],
  ].map(([k, v]) => `<div class="meter__row"><span>${k}</span><span>${v}</span></div>`).join('');
  $('#waterfall').innerHTML = reqs.map((r) => {
    const left = Math.min(100, (r.start / scale) * 100);
    const width = r.ms == null ? 100 - left : Math.max(0.4, Math.min(100 - left, (r.ms / scale) * 100));
    const cls = r.ms == null ? 'hung' : r.url.startsWith('/api/') ? 'api' : 'static';
    return `<div class="wf__row"><span class="wf__url" title="${r.url}">${r.url.replace('manage/assets/', '').slice(0, 42)}</span>
      <span class="wf__track"><i class="wf__bar wf__bar--${cls}" style="left:${left}%;width:${width}%"></i></span>
      <span class="wf__meta">${r.ms == null ? '<b class="bad">never answered</b>' : `${fmt(r.ms)} ms`} · ${kb(r.wire)}${r.encoding ? ` <span class="ok">${r.encoding}</span>` : ''}${r.cached ? ' <span class="ok">cached</span>' : ''}</span></div>`;
  }).join('') + (run.firstCardMs ? `<div class="wf__mark" style="left:calc(260px + (100% - 520px) * ${Math.min(1, run.firstCardMs / scale)})"><span>first card ${fmt(run.firstCardMs)} ms</span></div>` : '');
  $('#wfNote').textContent = run.note || '';
}
$$('input[name=wfBuild], input[name=wfNet], input[name=wfLoad]').forEach((r) => r.addEventListener('change', waterfall));
waterfall();

// ── 2. the live trace ───────────────────────────────────────────────────────────────────
$('#liveTable').innerHTML = '<tr><th>Request</th><th class="num">calls</th><th class="num">p50</th><th class="num">p95</th><th class="num">max</th><th class="num">server time</th><th>blocked on</th></tr>'
  + D.live.map((r) => `<tr><td><code>${r.path}</code></td><td class="num">${fmt(r.n)}</td><td class="num">${fmt(r.p50)} ms</td><td class="num ${r.p95 > 1000 ? 'before' : ''}">${fmt(r.p95)} ms</td><td class="num ${r.max > 1000 ? 'before' : ''}">${fmt(r.max)} ms</td><td class="num">${r.total} s <span class="dim">(${r.share} %)</span></td><td class="dim">${r.why || ''}</td></tr>`).join('');

// ── 3. causes ───────────────────────────────────────────────────────────────────────────
$('#causeTable').innerHTML = '<tr><th>What was found</th><th>Evidence</th><th>Fix</th></tr>'
  + D.causes.map((c) => `<tr><td><b>${c.what}</b></td><td class="dim">${c.evidence}</td><td>${c.fix}</td></tr>`).join('');

// ── 4. numbers ──────────────────────────────────────────────────────────────────────────
$('#browserTable').innerHTML = '<tr><th></th><th class="num">live build</th><th class="num">this branch</th></tr>'
  + D.browser.map((r) => `<tr><td>${r.label}</td><td class="num before">${r.before}</td><td class="num after">${r.after}</td></tr>`).join('');
$('#serverTable').innerHTML = '<tr><th>Endpoint</th><th class="num">before p50 / p95 / max</th><th class="num">after p50 / p95 / max</th></tr>'
  + D.server.map((r) => `<tr><td><code>${r.path}</code></td><td class="num before">${r.before}</td><td class="num after">${r.after}</td></tr>`).join('');
$('#bars').innerHTML = D.bars.map((m) => {
  const max = Math.max(m.before, m.after) || 1;
  return `<div class="bar"><div class="bar__label"><span>${m.label}</span><span class="dim">${m.unit}</span></div>
    <div class="bar__track"><div class="bar__fill before" style="width:${Math.max(1, (m.before / max) * 100)}%">before · ${fmt(m.before)}</div></div>
    <div class="bar__track"><div class="bar__fill after" style="width:${Math.max(1, (m.after / max) * 100)}%">after · ${fmt(m.after)}</div></div></div>`;
}).join('');
