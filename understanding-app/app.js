// Understanding app — "open harness" from a card (fleet task 720b3e0c). Data in ./data.js.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const D = window.OPEN2_DATA;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
}));
$('#card').innerHTML = '<tr><th>Fact</th><th>Found</th></tr>' + D.card.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('');
$('#before').innerHTML = '<tr><th>Surface</th><th>Its path</th><th class="before">What the Operator saw</th></tr>' + D.before.map(([a, b, c]) => `<tr><td><b>${esc(a)}</b></td><td class="dim">${esc(b)}</td><td class="before">${esc(c)}</td></tr>`).join('');
$('#reasons').innerHTML = '<tr><th>Reason</th><th>Meaning</th><th class="after">The line</th></tr>' + D.reasons.map(([a, b, c]) => `<tr><td><code>${esc(a)}</code></td><td class="dim">${esc(b)}</td><td class="after">${esc(c)}</td></tr>`).join('');
$('#steps').innerHTML = D.steps.map(([name, text], i) => `<div class="step step--ok"><span class="step__n">${i + 1}</span><div><b>${esc(name)}</b><div class="dim">${esc(text)}</div></div></div>`).join('');
