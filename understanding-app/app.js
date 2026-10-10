// Understanding app — the sofa → fleet bridge analysis (fleet task 5afbb125). Data in ./data.js.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const D = window.BRIDGE;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
}));

$('#facts').innerHTML = '<tr><th>Piece</th><th>What is true today</th><th>Where</th></tr>' + D.facts.map(([a, b, c]) => `<tr><td><b>${esc(a)}</b></td><td>${esc(b)}</td><td class="dim">${esc(c)}</td></tr>`).join('');
$('#experience').innerHTML = '<tr><th>Step</th><th>From the sofa</th></tr>' + D.experience.map(([a, b]) => `<tr><td><b>${esc(a)}</b></td><td>${esc(b)}</td></tr>`).join('');
$('#questions').innerHTML = D.questions.map((q) => `<li>${esc(q)}</li>`).join('');
$('#plan').innerHTML = D.plan.map(([name, what, done], i) => `<div class="pstep"><span class="pstep__n">${i + 1}</span><div><b>${esc(name)}</b><div>${esc(what)}</div><div class="dim">${esc(done)}</div></div></div>`).join('');
$('#missing').textContent = D.topology.missing;

function topo(el, nodes, edges) {
  const pos = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const H = 64;
  const centre = (n) => ({ x: n.x + n.w / 2, y: n.y + H / 2 });
  const svg = edges.map(([a, b, label, cls]) => {
    const p = centre(pos[a]), q = centre(pos[b]);
    const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
    return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" class="${cls || ''}" /><text x="${mx}" y="${my - 5}" text-anchor="middle">${esc(label)}</text>`;
  }).join('');
  el.innerHTML = `<svg>${svg}</svg>` + nodes.map((n) => `<div class="node${n.hub ? ' node--hub' : ''}" style="left:${n.x}px;top:${n.y}px;width:${n.w}px"><b>${esc(n.label)}</b><small>${esc(n.sub)}</small></div>`).join('');
}
topo($('#topoNow'), D.topology.now, D.topology.nowEdges);
topo($('#topoTarget'), D.topology.target, D.topology.targetEdges);

let picked = 'c';
function options() {
  $('#optPick').innerHTML = D.options.map((o) => `<label><input type="radio" name="opt" value="${o.id}" ${o.id === picked ? 'checked' : ''}/> ${esc(o.name.split(' · ')[0])}</label>`).join('');
  $$('input[name=opt]').forEach((r) => r.addEventListener('change', () => { picked = r.value; options(); }));
  const o = D.options.find((x) => x.id === picked);
  const pick = /RECOMMENDED/.test(o.name);
  $('#opt').innerHTML = `<div class="opt${pick ? ' opt--pick' : ''}" data-option="${o.id}"><h3>${esc(o.name)}</h3>
    <div class="eff__row"><span>exposes</span><b>${esc(o.exposes)}</b></div>
    <div class="eff__row"><span>threat model (home LAN)</span><b class="bad">${esc(o.threats)}</b></div>
    <div class="eff__row"><span>required controls</span><b>${esc(o.controls)}</b></div>
    <div class="eff__row"><span>effort</span><b>${esc(o.effort)}</b></div>
    <div class="eff__row"><span>view → control later</span><b>${esc(o.later)}</b></div>
    <div class="verdict ${pick ? 'verdict--pick' : /Reject|Not recommended/.test(o.verdict) ? 'verdict--bad' : 'verdict--warn'}">${esc(o.verdict)}</div></div>`;
}
options();
