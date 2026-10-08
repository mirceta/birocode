// Understanding app — Sofa mode (fleet task 68090860). Data in ./data.js.
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const D = window.SOFA;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
}));

// ---- Today ------------------------------------------------------------------------------------
$('#chain').innerHTML = D.today.map((n, i) => `${i ? '<span class="arrow">→</span>' : ''}<div class="node${i === 0 ? ' is-on' : ''}" data-i="${i}"><div class="ico">${n.ico}</div><b>${esc(n.name)}</b></div>`).join('');
const showNode = (i) => { $$('.node').forEach((n) => n.classList.toggle('is-on', Number(n.dataset.i) === i)); $('#chain-detail').textContent = D.today[i].what; };
$$('.node').forEach((n) => n.addEventListener('click', () => showNode(Number(n.dataset.i))));
showNode(0);
$('#gaps').innerHTML = '<tr><th>Gap</th><th>Why it matters from the sofa</th></tr>' + D.gaps.map(([a, b]) => `<tr><td><b>${esc(a)}</b></td><td class="dim">${esc(b)}</td></tr>`).join('');

// ---- Session (phone + the REAL harness on the projector) -----------------------------------
let si = 0, timer = null;
const agentColor = (name) => (D.agents.find((a) => a.name === name) || {}).color || '#5ea0ef';
function phoneHtml(p) {
  const hdr = `<div class="phone__hdr"><span>Harness · remote</span><span>📺 ${esc(p.showing || '—')}</span></div>`;
  const views = `<div class="phone__views"><span class="${p.screen === 'remote' && !p.pick && !p.arch && si === 0 ? 'is-on' : ''}">Kanban</span><span>Status</span><span class="${p.arch ? 'is-on' : ''}">Arch</span><span>Fleet</span></div>`;
  const list = D.agents.map((a) => `<div class="agent${p.pick === a.name ? ' is-on' : ''}"><i style="background:${a.color}"></i><b>${esc(a.name)}</b>${a.badge && p.pick !== a.name ? `<small>${esc(a.badge)}</small>` : ''}</div>`).join('');
  const ctl = (on) => `<div class="phone__ctl"><span class="${on === 'up' ? 'is-on' : ''}">▲</span><span>▼</span><span class="${on === 'latest' ? 'is-on' : ''}">Latest</span><span>A±</span></div>`;
  if (p.screen === 'compose') return `${hdr}${views}<div class="phone__compose">${esc(p.text)}<span class="cursor" style="height:12px"></span></div><div class="phone__send">Send → ${esc(p.pick)}</div><div class="phone__state">builder lane · idle</div>${ctl()}`;
  if (p.screen === 'question') return `${hdr}${views}<div class="phone__q"><b>${esc(p.q)}</b>${p.opts.map((o) => `<span>${esc(o)}</span>`).join('')}</div><div class="phone__state warn">waiting for you · 📳</div>${ctl()}`;
  const target = p.arch ? 'the arch' : p.pick;
  const send = p.state === 'running' ? '<div class="phone__send is-busy">running… · Stop</div>' : (target ? `<div class="phone__send">Write to ${esc(target)}</div>` : '');
  const state = p.state === 'running' ? 'running · tool calls: 3' : (p.arch ? 'Operator conversation' : p.pick ? 'builder lane · idle' : 'tap an agent or a view');
  return `${hdr}${views}<div class="phone__list">${list}</div>${send}<div class="phone__state${p.state === 'running' ? ' run' : ''}">${state}</div>${ctl(p.ctl || (p.pick ? 'latest' : ''))}`;
}
function harnessShell(active, inner) {
  const tabs = ['Chat', 'Agent', 'Agents', 'Arch', 'Tasks', 'Local', 'Settings'];
  return `<div class="hz__bar"><b>Claude Web</b>${tabs.map((t) => `<span class="${t === active ? 'is-on' : ''}">${t}</span>`).join('')}<span class="hz__pill">📺 big screen · listening</span></div><div class="hz__body">${inner}</div>`;
}
function kanbanHtml() {
  return `<div class="kb"><div class="kb__bar">▸ Filters <i>2</i> · machine: living room · 5 of 9 tasks</div><div class="kb__cols">${D.kanban.map((c) => `<div class="kb__col"><b>${esc(c.col)}</b>${c.cards.map(([t, who, col]) => `<div class="kb__card">${esc(t)}<span class="chip"><i style="background:${col}"></i>${esc(who)}</span></div>`).join('')}</div>`).join('')}</div></div>`;
}
function dockHtml(pr) {
  let body;
  if (pr.scroll === 'up') body = `<div class="bubble tool">▸ Read src/ledger/import.ts</div><div class="bubble">Yesterday I reconciled September: 41 rows matched, 2 left for you (the Revolut fee and the duplicated rent).</div><div class="bubble tool">▸ Edit src/ledger/rules.json</div>`;
  else if (pr.run) body = `<div class="bubble me">Pull this month's bank statement into the ledger and show me the diff.</div><div class="bubble tool">▸ Bash  ls statements/2026-10*</div><div class="bubble tool">▸ Read  statements/2026-10-nlb.csv</div><div class="bubble">Importing 38 rows from the NLB export… 36 matched existing rules, 2 new payees<span class="cursor"></span></div>`;
  else if (pr.question) body = `<div class="bubble me">Pull this month's bank statement into the ledger and show me the diff.</div><div class="bubble q">Two statements match October. Which one should I import?<br><span>NLB · 1.–31.10.</span><span>Revolut · Oct</span><span>Both</span></div>`;
  else body = `<div class="bubble">Imported 38 rows (NLB). Diff: +36 matched, 2 new payees added to rules.json. Nothing left for you.</div><div class="bubble tool">✓ done · 1m 42s</div>`;
  const state = pr.run ? '<em class="ok">● running</em>' : pr.question ? '<em class="warn">● waiting for you</em>' : '<em>○ idle</em>';
  return `<div class="dock"><div class="dock__hdr"><i style="background:${agentColor(pr.agent)}"></i><b>${esc(pr.agent)}</b><span class="lane is-on">Builder</span><span class="lane">Ask</span><span class="lane">Files</span>${state}<span class="dock__git">main · clean</span></div><div class="dock__msgs${pr.scroll === 'up' ? ' up' : ''}">${body}</div><div class="dock__compose">Message ${esc(pr.agent)}…</div></div>`;
}
function archHtml() {
  return `<div class="dock arch"><div class="dock__hdr"><i style="background:#e8e8e6"></i><b>@arch</b><span class="lane is-on">Chat</span><span class="lane">Tools</span><span class="lane">History</span><em>○ idle</em></div><div class="dock__msgs"><div class="bubble">Fleet: 4 machines, 14 agents. living room is on 5e2d4450. pers-dec is waiting for your answer; the sofa-mode plan is committed on feat/sofa-mode.</div><div class="bubble me">What is still open on the board for this week?</div><div class="bubble">Three cards: finances into the app (pers-dec, waiting on you), daljinski text send (living-room, in progress), sofa mode (plan, awaiting your approval).</div></div><div class="dock__compose">Message the arch…</div></div>`;
}
function projHtml(pr) {
  if (pr.screen === 'kanban') return harnessShell('Tasks', kanbanHtml());
  if (pr.screen === 'arch') return harnessShell('Arch', archHtml());
  return harnessShell('Agent', dockHtml(pr));
}
function renderSession() {
  const s = D.session[si];
  $('#steps').innerHTML = D.session.map((x, i) => `<span class="step${i === si ? ' is-on' : ''}${i < si ? ' is-done' : ''}" data-i="${i}">${i + 1}. ${esc(x.t)}</span>`).join('');
  $$('.step').forEach((b) => b.addEventListener('click', () => { si = Number(b.dataset.i); stop(); renderSession(); }));
  $('#phone').innerHTML = phoneHtml(s.phone);
  $('#proj').innerHTML = projHtml(s.proj);
  $('#s-phone').textContent = s.phone.note; $('#s-proj').textContent = s.proj.note; $('#s-api').textContent = s.api;
  $('#prev').disabled = si === 0; $('#next').disabled = si === D.session.length - 1;
}
function stop() { if (timer) { clearInterval(timer); timer = null; $('#play').textContent = '▶ Play the session'; $('#play').classList.remove('is-on'); } }
$('#prev').addEventListener('click', () => { si = Math.max(0, si - 1); stop(); renderSession(); });
$('#next').addEventListener('click', () => { si = Math.min(D.session.length - 1, si + 1); stop(); renderSession(); });
$('#play').addEventListener('click', () => {
  if (timer) return stop();
  $('#play').textContent = '⏸ Pause'; $('#play').classList.add('is-on');
  timer = setInterval(() => { si = (si + 1) % D.session.length; renderSession(); $('#play').textContent = '⏸ Pause'; $('#play').classList.add('is-on'); }, 2800);
});
renderSession();

// ---- Split -----------------------------------------------------------------------------------
const kv = (rows) => `<div class="kv">${rows.map(([k, v]) => `<b>${esc(k)}</b><span>${esc(v)}</span>`).join('')}</div>`;
$('#split-h').innerHTML = kv(D.split.harness); $('#split-l').innerHTML = kv(D.split.living);

// ---- Designs ---------------------------------------------------------------------------------
const dots = (n) => `<span class="dots">${[1, 2, 3].map((i) => `<i class="${i <= n ? 'f' : ''}"></i>`).join('')}</span>`;
$('#designs').innerHTML = D.designs.map((d) => `<div class="design tone-${d.tone}${d.id === 'C' ? ' is-on' : ''}" data-id="${d.id}"><h3>D-${d.id} · ${esc(d.name)}</h3><div class="verdict ${d.tone}">${esc(d.verdict)}</div><p class="how">${esc(d.how)}</p><ul>${d.plus.map((p) => `<li class="p">${esc(p)}</li>`).join('')}${d.minus.map((m) => `<li class="m">${esc(m)}</li>`).join('')}</ul><div class="scores"><span>effort (less = more dots)</span>${dots(4 - d.score.effort)}<span>sofa comfort</span>${dots(d.score.comfort)}<span>reuse</span>${dots(d.score.reuse)}<span>security</span>${dots(d.score.security)}</div></div>`).join('');
$$('.design').forEach((el) => el.addEventListener('click', () => $$('.design').forEach((x) => x.classList.toggle('is-on', x === el))));

// ---- Plan ------------------------------------------------------------------------------------
let mi = 1;
function renderPlan() {
  $('#ms').innerHTML = D.plan.map((m, i) => `<div class="ms__item${i === mi ? ' is-on' : ''}" data-i="${i}"><span class="repo ${m.repo}">${esc(m.repo)}</span><b>${m.id}</b><small>${esc(m.name)}</small></div>`).join('');
  $$('.ms__item').forEach((el) => el.addEventListener('click', () => { mi = Number(el.dataset.i); renderPlan(); }));
  const m = D.plan[mi];
  $('#ms-detail').innerHTML = `<h3>${m.id} — ${esc(m.name)} <span class="dim">(${esc(m.repo)})</span></h3><div class="done"><b>Done when:</b> ${esc(m.done)}</div><ul>${m.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
}
renderPlan();

// ---- Questions -------------------------------------------------------------------------------
$('#qs').innerHTML = D.questions.map(([q, w]) => `<div class="q"><b>${esc(q)}</b><span>${esc(w)}</span></div>`).join('');
