// Understanding app — the Kanban policeman (openspec policeman-observes-agents). Build-less,
// relative URLs only; the diagrams come from the vendored copy of the product's own data.
import { BOARD_CHECK, LIFECYCLE, PASS, CAN, CANNOT, PROVENANCE, toSvg } from './policemanDiagram.js';

// The same vocabulary as client/src/components/taskgraph/cardSections.js OBSERVATIONS.
const OBSERVATIONS = {
  working: ['⚙️', 'Working', 'the agent is actively on it'],
  'waiting-review': ['👀', 'Waiting for review', 'its work is up as a pull request; nothing more from the agent until someone reviews'],
  'asked-question': ['❓', 'Asked a question', 'the agent asked something and nobody has answered'],
  blocked: ['⛔', 'Blocked', 'the agent says it cannot proceed'],
  'claims-done': ['🗣', 'Says done', 'the agent says it finished, but the facts do not show it yet'],
  idle: ['💤', 'Idle', 'nothing has happened in its conversation'],
  errored: ['💥', 'Errored', "the agent's last turn failed"],
};

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Tabs
const tabs = document.querySelectorAll('.tab');
const views = document.querySelectorAll('.view');
tabs.forEach((t) => t.addEventListener('click', () => {
  tabs.forEach((x) => x.classList.toggle('is-on', x === t));
  views.forEach((v) => v.classList.toggle('is-on', v.dataset.view === t.dataset.view));
}));

// The pass
$('#pass').innerHTML = PASS.map((p) => `<li><code>${esc(p.tool)}</code><span>${esc(p.what)}</span></li>`).join('');

// The diagrams
$('#fig-board').innerHTML = `<figcaption>${esc(BOARD_CHECK.title)}</figcaption>${toSvg(BOARD_CHECK)}`;
$('#fig-lifecycle').innerHTML = `<figcaption>${esc(LIFECYCLE.title)}</figcaption>${toSvg(LIFECYCLE)}<p class="note">${esc(LIFECYCLE.note)}</p>`;

// The Agent vocabulary
$('#obs').innerHTML = Object.entries(OBSERVATIONS).map(([k, [i, w, m]]) => `<li data-observation="${k}"><b>${i} ${esc(w)}</b><span>${esc(m)}</span></li>`).join('');

// Can / cannot / provenance
const rows = (list) => list.map(([w, d]) => `<tr><th>${esc(w)}</th><td>${esc(d)}</td></tr>`).join('');
$('#can').innerHTML = rows(CAN);
$('#cannot').innerHTML = rows(CANNOT);
$('#prov').innerHTML = rows(PROVENANCE);

// Try a pass: three cards, what the policeman reads, what it writes back.
const CARDS = [
  { ref: '#c3d4e5f6', title: 'Export the invoice register as CSV', status: 'doing', said: '"I need the production API key to continue." (30 h ago)', pr: null,
    after: { obs: ['asked-question', 'asked for the production API key 30 h ago, no answer'], flag: 'pinged 30 h ago, no branch, no PR; waiting on a credential only you have', move: null } },
  { ref: '#f6a1b2c3', title: 'Build the CSV endpoint', status: 'doing', said: '"Opened PR #9 with the endpoint; tests green." (2 h ago)', pr: { n: 9, head: 'feat/csv-endpoint', open: true },
    after: { obs: ['waiting-review', 'says PR #9 is up with green tests, 2 h ago'], flag: null, move: ['doing', 'pr-opened', 'PR #9 traced by head branch feat/csv-endpoint → sync_card → verifier: PR open'] } },
  { ref: '#b2c3d4e5', title: 'Fleet keep-alive column', status: 'pr-opened', said: '"Done, PR is open." (1 d ago)', pr: null,
    after: { obs: ['claims-done', 'says the PR is open, 1 d ago, but GitHub has no PR from this branch'], flag: null, move: null, dishonest: 'marked PR open, but no pull request has been found on GitHub yet' } },
];
const COL = { doing: 'Doing', 'pr-opened': 'PR open' };
function renderTry(done) {
  $('#try').innerHTML = CARDS.map((c) => {
    const o = c.after.obs;
    const [i, w] = OBSERVATIONS[o[0]];
    const status = done && c.after.move ? c.after.move[1] : c.status;
    return `<div class="card${done && c.after.flag ? ' is-flag' : ''}${done && c.after.dishonest ? ' is-warn' : ''}">
      <div class="title">${esc(c.title)} <span class="ref">${c.ref}</span></div>
      <div class="facts">column: <b>${COL[status]}</b>${done && c.after.move ? ` <span class="moved">← was ${COL[c.after.move[0]]}: ${esc(c.after.move[2])}</span>` : ''}</div>
      <div class="facts">agent said: ${esc(c.said)}</div>
      <div class="facts">GitHub: ${c.pr ? `PR #${c.pr.n} open, head ${c.pr.head}` : 'no PR for this card'}</div>
      ${done ? `<div class="sec"><span class="lbl">BOARD CHECK</span> ${c.after.flag ? '🆘 <b>Needs human</b> — ' + esc(c.after.flag) + ' <i>— the policeman, just now</i>' : c.after.dishonest ? '⚠️ <b>Not verified yet</b> — ' + esc(c.after.dishonest) + ' <i>— the auto-verifier</i>' : '✅ <b>Honest</b> — ' + esc(COL[status]) + ' is confirmed by the facts <i>— the auto-verifier</i>'}</div>
      <div class="sec"><span class="lbl">AGENT</span> ${i} <b>${esc(w)}</b> — ${esc(o[1])} <i>— seen by the policeman, just now · session b7e2d1c0</i></div>` : '<div class="sec dim">press ▶ run a pass</div>'}
    </div>`;
  }).join('');
}
renderTry(false);
$('#run').addEventListener('click', () => renderTry(true));
