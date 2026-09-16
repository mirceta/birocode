// The one-policeman DEMO's DOM (openspec one-policeman): renders the proposed Policeman tab
// from demoModel.js and wires the clicks. Build-less, relative URLs only. Everything is fake.
import { initialState, runPass, answerFlag, timelineOf, STATES, COLUMNS, TRIGGERS, ago, short } from './demoModel.js';

const root = document.querySelector('#cy-demo');
let S = initialState();
let view = 'sweep';
let selected = null;
let auto = null;
S = runPass(S, 'startup');

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const st = (s) => STATES[s] || ['👁', s, ''];

function flagRow(f, verb) {
  return `<div class="dm__what"><span class="dm__verb">${verb}</span> 🆘 <b>#${short(f.id)}</b> ${esc(f.title)} <span class="dm__dim">— ${esc(f.reason)}</span></div>`;
}

function renderSweep() {
  const cards = S.cards.filter((c) => c.column !== 'done');
  const last = S.journal[0];
  const did = (c) => {
    const bits = [];
    for (const m of last.moves) if (m.id === c.id) bits.push(`<span class="dm__verb">moved</span> ${COLUMNS[m.from]} → <b>${COLUMNS[m.to]}</b> <span class="dm__dim">(${esc(m.fact)})</span>`);
    for (const q of last.questions) if (q.id === c.id) bits.push(`<span class="dm__verb dm__verb--brain">asked 🧠</span> one question · <span class="dm__dim">${q.tokens.toLocaleString()} tokens</span>`);
    for (const f of last.raised) if (f.id === c.id) bits.push(`<span class="dm__verb dm__verb--bad">raised</span> 🆘`);
    for (const f of last.cleared) if (f.id === c.id) bits.push(`<span class="dm__verb dm__verb--ok">cleared</span> 🆘`);
    return bits.length ? bits.join('<br>') : '<span class="dm__dim">nothing — facts unchanged, no new words</span>';
  };
  const rows = cards.map((c) => {
    const lastMsg = c.messages[c.messages.length - 1];
    const o = c.observation;
    const [icon, word] = o ? st(o.state) : ['—', 'not read yet'];
    const against = c.column !== c.verified && Object.keys(COLUMNS).indexOf(c.column) > Object.keys(COLUMNS).indexOf(c.verified);
    return `<tr class="dm__row${selected === c.id ? ' dm__row--on' : ''}${c.flag ? ' dm__row--flag' : ''}" data-demo-card="${c.id}">
      <td><b>#${short(c.id)}</b><br><span class="dm__title">${esc(c.title)}</span><br><span class="dm__dim">${esc(c.agent)}</span></td>
      <td><b>${COLUMNS[c.column]}</b><br><span class="dm__dim">facts: ${COLUMNS[c.verified]}${c.pr ? ` · PR #${c.pr.n} ${c.pr.state}` : ' · no PR'}</span>${against ? '<br><span class="dm__warn">⚠️ column ahead of the facts</span>' : ''}</td>
      <td class="dm__said">“${esc(lastMsg.text)}”<br><span class="dm__dim">${ago(S.now - lastMsg.t)} ago</span></td>
      <td class="dm__read"><span class="dm__brain">🧠</span> ${icon} <b>${word}</b>${o ? `<br><span class="dm__dim">${esc(o.summary)} · ${ago(S.now - o.at)} ago</span>` : ''}</td>
      <td>${did(c)}</td>
      <td>${c.flag ? `<span class="dm__flag">🆘 ${c.flag.answered ? 'answered — waiting for the agent' : 'needs you'}</span><br><span class="dm__dim">${esc(c.flag.reason)}</span>` : '<span class="dm__dim">—</span>'}</td>
    </tr>`;
  }).join('');
  const sel = S.cards.find((c) => c.id === selected);
  const drawer = !sel ? '' : `<div class="dm__drawer" data-demo-drawer>
    <div class="dm__drawer-head"><b>#${short(sel.id)} ${esc(sel.title)}</b> <span class="dm__dim">· ${esc(sel.agent)} · ${COLUMNS[sel.column]} (facts: ${COLUMNS[sel.verified]})</span><button class="dm__link" data-demo-close>close</button></div>
    ${sel.flag ? `<div class="dm__answer" data-demo-answer-box>
      <div>🆘 <b>${esc(sel.flag.reason)}</b> <span class="dm__dim">· raised ${ago(S.now - sel.flag.at)} ago by the policeman</span></div>
      ${sel.flag.answered ? `<div class="dm__dim">your answer: “${esc(sel.flag.answer)}” — the agent reads it on the next pass; the flag clears once it continues.</div>`
        : `<div class="dm__answer-row"><input type="text" placeholder="answer the agent here — this goes to its conversation, and the flag clears when it continues" data-demo-answer-text value="Use the sandbox key; the production one is only for the deploy job." /><button class="btn" data-demo-answer="${sel.id}">Answer</button></div>`}
    </div>` : ''}
    <div class="dm__dim">the agent’s last messages (what the model was shown):</div>
    <ul class="dm__msgs">${sel.messages.slice(-4).map((m) => `<li><span class="dm__dim">${ago(S.now - m.t)} ago</span> ${esc(m.text)}</li>`).join('')}</ul>
    <div class="dm__dim">this card’s timeline — every pass that touched it:</div>
    ${timelineOf(S, sel.id).map((e) => `<div class="dm__tl"><span class="dm__dim">${ago(S.now - e.at)} ago · ${TRIGGERS[e.trigger]}</span>
      ${e.moves.filter((m) => m.id === sel.id).map((m) => `<div class="dm__what"><span class="dm__verb">moved</span> ${COLUMNS[m.from]} → <b>${COLUMNS[m.to]}</b> <span class="dm__dim">(${esc(m.fact)})</span></div>`).join('')}
      ${e.questions.filter((q) => q.id === sel.id).map((q) => `<div class="dm__what"><span class="dm__verb dm__verb--brain">asked 🧠</span> “${esc(q.excerpt)}” → ${st(q.state)[0]} <b>${st(q.state)[1]}</b> <span class="dm__dim">— ${esc(q.summary)} · ${q.tokens.toLocaleString()} tokens</span></div>`).join('')}
      ${e.raised.filter((f) => f.id === sel.id).map((f) => flagRow(f, 'raised')).join('')}
      ${e.cleared.filter((f) => f.id === sel.id).map((f) => flagRow(f, 'cleared')).join('')}
    </div>`).join('') || '<div class="dm__dim">nothing yet</div>'}
  </div>`;
  return `<div class="dm__hint">one row per in-flight card · the 🧠 column is the only thing the model decides · click a row for its timeline and to answer a flag</div>
  <table class="dm__table"><thead><tr><th>card</th><th>column · facts</th><th>the agent last said</th><th>🧠 the model’s reading</th><th>this pass</th><th>🆘</th></tr></thead><tbody>${rows}</tbody></table>${drawer}`;
}

function renderHistory() {
  const rows = S.journal.map((e) => `<tr class="dm__row${e.quiet ? '' : ' dm__row--loud'}" data-demo-pass>
    <td class="dm__dim">${ago(S.now - e.at)} ago</td><td class="dm__dim">${TRIGGERS[e.trigger]}</td>
    <td>${e.quiet ? '<span class="dm__dim">quiet — nothing to move, nobody to ask, nothing to flag</span>' : `<b>${[e.moves.length && `moved ${e.moves.length}`, e.questions.length && `asked 🧠 ${e.questions.length} (${e.tokens.toLocaleString()} tokens)`, e.raised.length && `raised ${e.raised.length} 🆘`, e.cleared.length && `cleared ${e.cleared.length} 🆘`].filter(Boolean).join(' · ')}</b>`}
      ${e.moves.map((m) => `<div class="dm__what"><span class="dm__verb">moved</span> <b>#${short(m.id)}</b> ${esc(m.title)}: ${COLUMNS[m.from]} → <b>${COLUMNS[m.to]}</b> <span class="dm__dim">(${esc(m.fact)})</span></div>`).join('')}
      ${e.questions.map((q) => `<div class="dm__what"><span class="dm__verb dm__verb--brain">asked 🧠</span> <b>#${short(q.id)}</b> → ${st(q.state)[0]} ${st(q.state)[1]} <span class="dm__dim">— ${esc(q.summary)} · ${q.tokens.toLocaleString()} tokens</span></div>`).join('')}
      ${e.raised.map((f) => flagRow(f, 'raised')).join('')}${e.cleared.map((f) => flagRow(f, 'cleared')).join('')}</td>
    <td class="dm__dim dm__num">${e.checked}</td><td class="dm__dim dm__num">${e.durationMs} ms</td></tr>`).join('');
  return `<div class="dm__hint">every pass, newest first · what it moved, whom it asked and what the model answered, what it flagged · ${S.passes} passes</div>
  <table class="dm__table"><thead><tr><th>when</th><th>set off by</th><th>what it did</th><th>cards</th><th>took</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderExplain() {
  return `<div class="dm__explain">
    <h3>What the policeman is (in this proposal)</h3>
    <p><b>One loop, in harness code.</b> Every ${S.intervalS} s, and at startup or when you press Run now, it visits every in-flight card: reads git, GitHub and the deploy log, traces the card’s PR, and moves the card <b>forward</b> to what the facts prove — never backwards, never on a claim.</p>
    <p><b>One question per card.</b> If the assignee has said something new since the card’s last reading, the loop asks the model exactly one question — “here are its last messages: which state is it in, and why, in one line” — and writes the answer on the card as the <b>Agent</b> section. That 🧠 column is the only thing the model decides. No session, no context cap, no rollover, no prompt to follow.</p>
    <p><b>Flags by rule, informed by the reading.</b> Stuck by the mechanical rules (pinged, no PR, silent past the window), or the reading says asked / blocked / errored and nobody answered, or the column contradicts the facts for two sweeps → 🆘 with the reason, one name on it. You answer <b>on the card</b>; the answer goes to the agent’s conversation and the flag clears when the agent continues.</p>
    <p><b>Everything is journaled.</b> Every pass, every move, every question with its answer and token cost, every flag. There is no chat to read; there is a history to check.</p>
    <p class="dm__dim">Gone from today: the policeman conversation, its six-step prompt, its sessions strip, its tool fences, and the separate Board check. Kept: the card sections, the observation words, the verifier, the journal. Nothing here is built — openspec <code>one-policeman</code>.</p>
  </div>`;
}

function render() {
  const last = S.journal[0];
  const flagged = S.cards.filter((c) => c.flag).length;
  root.innerHTML = `<div class="dm" data-demo>
    <div class="dm__banner">DEMO — a clickable mock of the <b>proposed</b> Policeman tab (openspec one-policeman). Fake fleet, fake transcripts, scripted model answers. Press <b>Run a pass now</b> a few times; click a card; answer a flag.</div>
    <div class="dm__bar">
      <span class="dm__titlebar">👮 Policeman</span>
      <span class="dm__pill${S.running ? ' dm__pill--on' : ' dm__pill--off'}" data-demo-state>${S.running ? `every ${S.intervalS} s · ${S.passes} pass${S.passes === 1 ? '' : 'es'} since start` : 'stopped'}</span>
      <span class="dm__dim" data-demo-meta>last pass ${ago(S.now - last.at)} ago (${TRIGGERS[last.trigger]})${S.running ? ` · next in ${S.intervalS} s` : ''} · ${flagged ? `<span class="dm__flag">${flagged} card${flagged === 1 ? '' : 's'} need${flagged === 1 ? 's' : ''} you</span>` : 'nothing needs you'}</span>
      <span class="dm__spacer"></span>
      <label class="dm__auto"><input type="checkbox" data-demo-auto ${auto ? 'checked' : ''}/> auto: a pass every 3 s</label>
      <button class="btn btn--primary" data-demo-run>▶ Run a pass now</button>
      <button class="btn" data-demo-toggle>${S.running ? '■ Stop' : '▶ Start'}</button>
    </div>
    <div class="dm__lead"><b>Harness code runs the sweep; the model is asked one question per card with new words.</b> One name on the card. What the Board check and the policeman each did today, one loop does here.</div>
    <div class="dm__views">${[['sweep', '🧹 Sweep'], ['history', '📜 History'], ['explain', '❓ What it is']].map(([k, l]) => `<button class="dm__view${view === k ? ' dm__view--on' : ''}" data-demo-view="${k}">${l}</button>`).join('')}</div>
    <div class="dm__body">${view === 'sweep' ? renderSweep() : view === 'history' ? renderHistory() : renderExplain()}</div>
  </div>`;
}

root.addEventListener('click', (ev) => {
  const t = ev.target.closest('[data-demo-run],[data-demo-toggle],[data-demo-view],[data-demo-card],[data-demo-close],[data-demo-answer]');
  if (!t) return;
  if (t.dataset.demoRun !== undefined) { S = runPass(S, 'operator'); }
  else if (t.dataset.demoToggle !== undefined) { S = { ...S, running: !S.running }; }
  else if (t.dataset.demoView) { view = t.dataset.demoView; }
  else if (t.dataset.demoClose !== undefined) { selected = null; }
  else if (t.dataset.demoAnswer) { const text = root.querySelector('[data-demo-answer-text]')?.value?.trim() || 'answered'; S = answerFlag(S, t.dataset.demoAnswer, text); S = runPass(S, 'answer'); }
  else if (t.dataset.demoCard) { selected = selected === t.dataset.demoCard ? null : t.dataset.demoCard; }
  render();
  if (t.dataset.demoCard && selected) root.querySelector('[data-demo-drawer]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});
root.addEventListener('change', (ev) => {
  if (ev.target.matches('[data-demo-auto]')) {
    if (ev.target.checked) auto = setInterval(() => { if (S.running) { S = runPass(S, 'timer'); render(); } }, 3000);
    else { clearInterval(auto); auto = null; }
  }
});
window.demo = { get state() { return S; }, run: (trigger = 'operator') => { S = runPass(S, trigger); render(); }, answer: (id, text) => { S = answerFlag(S, id, text); S = runPass(S, 'answer'); render(); }, show: (v) => { view = v; render(); }, select: (id) => { selected = id; render(); } };
render();
