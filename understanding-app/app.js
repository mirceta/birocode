// Understanding app — the "finished, not yet checked" mark on old peers (fleet task 9c1120fe). Data in ./data.js.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const D = window.MARK_DATA;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
}));

$('#evidence').innerHTML = '<tr><th>When</th><th>What</th><th>Where it is written</th></tr>'
  + D.evidence.map(([w, t, src]) => `<tr><td class="num">${esc(w)}</td><td>${esc(t)}</td><td class="dim">${esc(src)}</td></tr>`).join('');
$('#links').innerHTML = '<tr><th>Link</th><th class="before">Before</th><th class="after">Now</th></tr>'
  + D.links.map((l) => `<tr><td><b>${esc(l.name)}</b><br><span class="dim">${esc(l.sub)}</span></td><td class="before">${esc(l.old)}</td><td class="after">${esc(l.neu)}</td></tr>`).join('');
$('#restart').innerHTML = '<tr><th>Case</th><th>What the hub does</th></tr>' + D.restart.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('');

function flow() {
  const build = $$('input[name=build]').find((r) => r.checked).value;
  const dock = $$('input[name=dock]').find((r) => r.checked).value;
  const c = D.cases[build === 'modern' ? (dock === 'docked' ? 'modernDocked' : 'modernUndocked') : (dock === 'docked' ? 'oldDocked' : 'oldUndocked')];
  const speaks = c.from === 'dock';
  const steps = [
    ['ok', 'A builder turn ends on the machine', 'turn.ended {status: done|error, readOnly: false} is published into its event feed' + (build === 'modern' && dock === 'docked' ? '; its dock latch sets' : '')],
    ['ok', 'The hub\'s collector pulls the event', 'on a cursor, in the background, Status tab open or not'],
    [speaks ? 'dim' : 'ok', 'FleetAttention records the finish', 'key sourceId|repoId · finishedAt = the event\'s at' + (speaks ? ' — recorded, but the latch outranks it' : '')],
    [speaks ? 'ok' : 'dim', 'The describe reports the latch', speaks ? 'unseenResult: true → the mark' : (build === 'old' ? 'unseenResult absent (null) — cannot speak' : 'docked: false — no tab to latch')],
    ['ok', 'The Status tab shows "!"', `unseenResult: true · unseenFrom: ${c.from}` + (speaks ? '' : ' · "seen by the hub from its turn events"')],
    ['ok', '✓ mark as checked', speaks ? 'relayed to the machine (its latch clears) and the hub record is acknowledged' : 'the hub record is acknowledged; nothing is relayed (the old build has no endpoint)'],
  ];
  $('#flowSteps').innerHTML = steps.map(([cls, name, text], i) => `<div class="step step--${cls}"><span class="step__n">${i + 1}</span><div><b>${esc(name)}</b><div class="dim">${esc(text)}</div></div></div>`).join('');
  $('#flowVerdict').className = 'verdict verdict--ok';
  $('#flowVerdict').textContent = `${c.title}: the mark comes from the ${c.from === 'dock' ? 'machine\'s dock latch' : 'hub\'s own record'}. ${c.text}`;
}
$$('input[name=build], input[name=dock]').forEach((r) => r.addEventListener('change', flow));
flow();
