// Understanding app — the Arch examples tab (fleet task 7914195c). Data in ./data.js.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const D = window.AX_DATA;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
}));

let pick = 0;
function walk() {
  $('#walkPick').innerHTML = D.walk.map((w, i) => `<label><input type="radio" name="w" value="${i}" ${i === pick ? 'checked' : ''}/> ${esc(w.text.slice(0, 70))}…</label>`).join('');
  $$('input[name=w]').forEach((r) => r.addEventListener('change', () => { pick = Number(r.value); walk(); }));
  const w = D.walk[pick];
  $('#walkSteps').innerHTML = `<div class="step step--dim"><span class="step__n">✎</span><div><b>the Operator wrote</b><div class="dim">${esc(w.text)}</div></div></div>`
    + w.hits.map(([id, hit], i) => `<div class="step step--${hit ? 'ok' : 'dim'}"><span class="step__n">${i + 1}</span><div><b>${esc(id)}</b><div class="dim">${hit ? 'a pattern matches → this is the category' : 'no pattern matches, next rule'}</div></div></div>`).join('');
  const last = w.hits[w.hits.length - 1];
  $('#walkVerdict').className = 'verdict verdict--ok';
  $('#walkVerdict').textContent = `→ ${last[0]} — counted there, and eligible as one of its two examples when it is typical, clean and of medium length.`;
}
walk();
$('#pipeline').innerHTML = D.pipeline.map(([name, text], i) => `<div class="step step--ok"><span class="step__n">${i + 1}</span><div><b>${esc(name)}</b><div class="dim">${esc(text)}</div></div></div>`).join('');
$('#sources').innerHTML = '<tr><th>Source</th><th>Where</th><th>On the hub, 2026-10-07</th></tr>' + D.sources.map(([a, b, c]) => `<tr><td><b>${esc(a)}</b></td><td class="dim">${esc(b)}</td><td>${esc(c)}</td></tr>`).join('');
$('#dropped').innerHTML = '<tr><th>Prefix</th><th>What it is</th></tr>' + D.dropped.map(([a, b]) => `<tr><td><code>${esc(a)}</code></td><td>${esc(b)}</td></tr>`).join('');
