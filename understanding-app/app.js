// Understanding app — opening an agent from the Status tab (fleet task 608f281a). Data in ./data.js.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const D = window.OPEN_DATA;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
}));

let picked = 'self';
function handles() {
  $('#handles').innerHTML = D.handles.map((h) => `
    <button type="button" class="link${picked === h.id ? ' link--broken' : ''}" data-h="${h.id}">
      <span class="link__ico">${h.cls === 'ok' ? '🟢' : h.cls === 'warn' ? '🟡' : '🔴'}</span>
      <span class="link__text"><b>${esc(h.name)}</b><small>${esc(h.sub)}</small></span>
      <span class="link__check">${picked === h.id ? '▶' : ''}</span>
    </button>`).join('');
  $$('[data-h]').forEach((b) => b.addEventListener('click', () => { picked = b.dataset.h; handles(); }));
  const h = D.handles.find((x) => x.id === picked);
  $('#hVerdict').className = 'verdict verdict--' + (h.cls === 'bad' ? 'warn' : h.cls);
  $('#hVerdict').textContent = h.name + ' — ' + h.sub;
  $('#hEffects').innerHTML = `<div class="eff"><div class="eff__row"><span>before</span><b class="bad">${esc(h.before)}</b></div><div class="eff__row"><span>now</span><b class="ok">${esc(h.now)}</b></div></div>`;
}
handles();

$('#steps').innerHTML = D.steps.map(([name, text], i) => `<div class="step step--ok"><span class="step__n">${i + 1}</span><div><b>${esc(name)}</b><div class="dim">${esc(text)}</div></div></div>`).join('');
$('#facts').innerHTML = '<tr><th>Fact</th><th>Found</th></tr>' + D.facts.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('');
$('#verified').innerHTML = '<tr><th>Case</th><th>Result</th></tr>' + D.verified.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('');
