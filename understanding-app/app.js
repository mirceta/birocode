// Understanding app — Claude for Chrome readiness (fleet task 20f936ec). Data in ./data.js.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const D = window.CHROME_DATA;

$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
}));

// ── 1. the chain ────────────────────────────────────────────────────────────────────────
const broken = new Set();
function chain() {
  $('#links').innerHTML = D.links.map((l) => `
    <button type="button" class="link${broken.has(l.id) ? ' link--broken' : ''}" data-link="${l.id}">
      <span class="link__ico">${l.icon}</span>
      <span class="link__text"><b>${l.name}</b><small>${l.sub}</small></span>
      <span class="link__check">${broken.has(l.id) ? '✗ broken' : 'check: ' + l.check}</span>
    </button>`).join('<div class="link__arrow">↓</div>');
  $$('.link').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.link; broken.has(id) ? broken.delete(id) : broken.add(id); chain(); }));
  const probed = $('#probed').checked;
  const hit = D.links.filter((l) => broken.has(l.id));
  const blocking = hit.filter((l) => l.blocks);
  let cls, text;
  if (blocking.length === 0 && probed) { cls = 'ok'; text = 'Ready — every check passes and the live probe reached the extension.'; }
  else if (blocking.length === 0) { cls = 'warn'; text = 'Degraded — everything is in place, but nothing has proven it yet. Press Re-run.'; }
  else if (blocking.every((l) => l.id === 'account') && !probed) { cls = 'warn'; text = 'Degraded — the harness cannot see the extension\'s sign-in, so nothing looks wrong. Press Re-run and the live probe fails: that is the only way to find this one.'; }
  else { cls = 'bad'; text = `Not ready — ${blocking.length} link${blocking.length === 1 ? '' : 's'} broken.`; }
  $('#verdict').className = 'verdict verdict--' + cls;
  $('#verdict').textContent = text;
  $('#effects').innerHTML = hit.length === 0
    ? '<div class="meter__row"><span>the agent</span><b class="ok">opens tabs, reads pages, clicks, in the Operator\'s real profile</b></div>'
    : hit.map((l) => `<div class="eff"><div class="eff__h">${l.icon} ${l.name}</div>
        <div class="eff__row"><span>the agent sees</span><b>${l.agent}</b></div>
        <div class="eff__row"><span>the Chrome section says</span><b class="${l.state === 'fail' ? 'bad' : l.state === 'unknown' ? 'warn' : 'dim'}">${l.section}</b></div></div>`).join('');
}
$('#reset').addEventListener('click', () => { broken.clear(); chain(); });
$('#probed').addEventListener('change', chain);
chain();

// ── 2. checks ───────────────────────────────────────────────────────────────────────────
$('#checkTable').innerHTML = '<tr><th>Check</th><th>Kind</th><th>How it is read</th></tr>'
  + D.checks.map((c) => `<tr><td><b>${c.what}</b><br><code>${c.id}</code></td><td><span class="kind kind--${c.kind.replace(/\s+/g, '-')}">${c.kind}</span></td><td class="dim">${c.how}</td></tr>`).join('');

// ── 3. probe ────────────────────────────────────────────────────────────────────────────
function probe() {
  const p = D.probe[$$('input[name=probeCase]').find((r) => r.checked).value];
  $('#probeSteps').innerHTML = p.steps.map(([cls, name, text], i) => `<div class="step step--${cls}"><span class="step__n">${i + 1}</span><div><b>${name}</b><div class="dim">${text}</div></div></div>`).join('');
  $('#probeVerdict').className = 'verdict verdict--' + p.verdict[0];
  $('#probeVerdict').textContent = p.verdict[1];
}
$$('input[name=probeCase]').forEach((r) => r.addEventListener('change', probe));
probe();

// ── 4. found ────────────────────────────────────────────────────────────────────────────
$('#foundTable').innerHTML = '<tr><th>Link</th><th>Found</th></tr>' + D.found.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${v}</td></tr>`).join('');
