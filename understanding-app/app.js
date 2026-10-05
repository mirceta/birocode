// Understanding app — Claude for Chrome readiness and repair (fleet task 20f936ec). Data in ./data.js.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const D = window.CHROME_DATA;
const REPAIR = { auto: ['ok', '🔧 the harness repairs it by itself'], spawn: ['ok', '🔧 fixed at every browser turn\'s start'], open: ['warn', '↗ the harness opens the page; the Operator finishes'], operator: ['bad', 'only the Operator'] };

$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
}));

// ── 1. the chain ────────────────────────────────────────────────────────────────────────
const broken = new Set();
function chain() {
  const repairOn = $('#repairOn').checked;
  $('#links').innerHTML = D.links.map((l) => `
    <button type="button" class="link${broken.has(l.id) ? ' link--broken' : ''}" data-link="${l.id}">
      <span class="link__ico">${l.icon}</span>
      <span class="link__text"><b>${l.name}</b><small>${l.sub}</small></span>
      <span class="link__check">${broken.has(l.id) ? '✗ broken' : 'check: ' + l.check}</span>
    </button>`).join('<div class="link__arrow">↓</div>');
  $$('.link').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.link; broken.has(id) ? broken.delete(id) : broken.add(id); chain(); }));
  const hit = D.links.filter((l) => broken.has(l.id));
  const left = repairOn ? hit.filter((l) => l.repair !== 'auto' && l.repair !== 'spawn') : hit;
  const healed = hit.length - left.length;
  let cls, text;
  if (hit.length === 0) { cls = 'ok'; text = 'Ready — every check passes (and a live probe or a real agent call has proven it).'; }
  else if (left.length === 0) { cls = 'ok'; text = `Ready again — ${healed} broken link${healed === 1 ? '' : 's'} repaired by the harness before the browser turn started. The agent noticed nothing.`; }
  else if (repairOn) { cls = 'bad'; text = `Blocked on the Operator — ${left.length} link${left.length === 1 ? '' : 's'} the harness cannot fix${healed ? ` (it repaired ${healed})` : ''}. The chat says so when the turn starts.`; }
  else { cls = 'bad'; text = `Not ready — ${hit.length} link${hit.length === 1 ? '' : 's'} broken, and the agent finds out halfway through its task.`; }
  $('#verdict').className = 'verdict verdict--' + cls;
  $('#verdict').textContent = text;
  $('#effects').innerHTML = hit.length === 0
    ? '<div class="meter__row"><span>the agent</span><b class="ok">opens tabs, reads pages, clicks, in the Operator\'s real profile</b></div>'
    : hit.map((l) => { const [rc, rl] = REPAIR[l.repair]; const fixed = repairOn && (l.repair === 'auto' || l.repair === 'spawn');
      return `<div class="eff${fixed ? ' eff--fixed' : ''}"><div class="eff__h">${l.icon} ${l.name}${fixed ? ' <span class="ok">— repaired</span>' : ''}</div>
        <div class="eff__row"><span>the agent sees</span><b>${fixed ? 'nothing — it was repaired first' : l.agent}</b></div>
        <div class="eff__row"><span>the Chrome section says</span><b class="dim">${l.section}</b></div>
        <div class="eff__row"><span>repair</span><b class="${rc}">${rl}</b></div>
        <div class="eff__row"><span></span><b class="dim">${l.repairText}</b></div></div>`; }).join('');
}
$('#reset').addEventListener('click', () => { broken.clear(); chain(); });
$('#repairOn').addEventListener('change', chain);
chain();

// ── 2. checks ───────────────────────────────────────────────────────────────────────────
$('#checkTable').innerHTML = '<tr><th>Check</th><th>Kind</th><th>How it is read</th><th>Repair</th></tr>'
  + D.checks.map((c) => `<tr><td><b>${c.what}</b><br><code>${c.id}</code></td><td><span class="kind kind--${c.kind.replace(/\s+/g, '-')}">${c.kind}</span></td><td class="dim">${c.how}</td><td class="${c.repair === 'auto' || c.repair.startsWith('at every') ? 'ok' : c.repair === '—' ? 'dim' : 'warn'}">${c.repair}</td></tr>`).join('');

// ── 3. repair ───────────────────────────────────────────────────────────────────────────
$('#triggerTable').innerHTML = '<tr><th>When</th><th>What the harness does</th><th>Verified on the hub</th></tr>'
  + D.triggers.map((t) => `<tr><td><b>${t.when}</b></td><td>${t.what}</td><td class="dim">${t.verified}</td></tr>`).join('');

// ── 4. probe ────────────────────────────────────────────────────────────────────────────
function probe() {
  const p = D.probe[$$('input[name=probeCase]').find((r) => r.checked).value];
  $('#probeSteps').innerHTML = p.steps.map(([cls, name, text], i) => `<div class="step step--${cls}"><span class="step__n">${i + 1}</span><div><b>${name}</b><div class="dim">${text}</div></div></div>`).join('');
  $('#probeVerdict').className = 'verdict verdict--' + p.verdict[0];
  $('#probeVerdict').textContent = p.verdict[1];
}
$$('input[name=probeCase]').forEach((r) => r.addEventListener('change', probe));
probe();

// ── 5. found ────────────────────────────────────────────────────────────────────────────
$('#foundTable').innerHTML = '<tr><th>Link</th><th>Found</th></tr>' + D.found.map(([k, v]) => `<tr><td><b>${k}</b></td><td>${v}</td></tr>`).join('');
