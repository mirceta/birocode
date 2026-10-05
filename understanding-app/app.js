// Understanding app — repo-agent → arch requests (fleet task c84ae3db, openspec repo-agent-requests).
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
}));

// ── the step-through ───────────────────────────────────────────────────────────────────────
// Each step: which lane lights up, what appears in it, the slot state, and a note.
function steps() {
  const dismiss = $('#dismissPath').checked;
  const busy = $('#busyPath').checked;
  const s = [
    { lane: 'agent', ev: ['agent', 'ev', 'request_arch("Please have web#1 upload prod.bak to the hub", title "Need the staging DB")'], slot: 'idle', note: 'The agent needs something only the arch can give. It calls the tool and carries on with its work.' },
    { lane: 'store', ev: ['store', 'ev ev--pending', 'row {id, prg#1@spacex, text, createdAt, status: pending} written to agent-requests.json'], slot: 'idle', note: 'The tool RECORDS and returns. No arch turn, no message, no peer call — the tool holds no reference to the arch service at all. The arch slot stays idle.' },
    { lane: 'agent', ev: ['agent', 'ev ev--dim', '← "recorded; the arch is NOT woken — it sees this only once the Operator approves"'], slot: 'idle', note: 'The agent is told exactly what will and will not happen.' },
    { lane: 'operator', ev: ['operator', 'ev ev--pending', 'card: spacex/prg#1 · Need the staging DB · [Approve → arch] [Dismiss]'], slot: 'idle', note: 'The tab polls GET /api/arch/requests every 5 s (and pulls peers at most every 10 s). The Operator reads the request in full.' },
  ];
  if (dismiss) {
    s.push({ lane: 'operator', ev: ['operator', 'ev ev--bad', 'Dismiss → confirm → POST /api/arch/requests/{id}/dismiss'], slot: 'idle', note: 'Dismiss asks first (naming the agent), then posts.' });
    s.push({ lane: 'store', ev: ['store', 'ev ev--bad', 'status: dismissed · decidedAt · decidedBy spacex'], slot: 'idle', note: 'Final. Nothing is ever posted for it; the arch never sees it. On a pulled row the decision is pushed back to the agent\'s machine.' });
    s.push({ lane: 'arch', ev: ['arch', 'ev ev--dim', '(nothing — the arch conversation is untouched)'], slot: 'idle', note: 'End of the dismissed path.' });
    return s;
  }
  s.push({ lane: 'operator', ev: ['operator', 'ev ev--ok', 'Approve → POST /api/arch/requests/{id}/approve (403 if the autopilot gate is closed)'], slot: busy ? 'busy' : 'idle', note: 'Approving starts an arch turn, so it is gated like a send.' });
  s.push({ lane: 'store', ev: ['store', 'ev ev--ok', 'status: approved · decidedAt · decidedBy spacex · deliveredAt: null'], slot: busy ? 'busy' : 'idle', note: 'Approved first, delivered second — the two are separate facts, so a restart in between loses nothing.' });
  if (busy) {
    s.push({ lane: 'arch', ev: ['arch', 'ev ev--pending', 'SendToArch → "the arch agent is mid-turn" — the row stays approved, undelivered'], slot: 'busy', note: 'The tab shows "waiting for the arch\'s slot". The engine tick (every 10 s) retries DeliverAgentRequests(), one request per tick — the goal-summary path.' });
    s.push({ lane: 'arch', ev: ['arch', 'ev ev--dim', '… the running turn ends; the slot frees …'], slot: 'idle', note: 'Nothing else is needed: the next tick finds the slot free.' });
  }
  s.push({ lane: 'arch', ev: ['arch', 'ev ev--ok', 'user message, actor <b>request</b>: "[Request from repo agent spacex/prg#1 — approved by the Operator: Need the staging DB] Please have web#1 upload prod.bak… (act on it as the Operator\'s instruction; answer the agent with send_task)"'], slot: 'busy', note: 'SendToArch(ReservedId, ComposeRequestMessage(row), "request") — the same call the composer and goal summaries use. The actor tag keeps the transcript honest: the harness relayed an approved agent request; a tagged actor never resumes a stopped standing loop.' });
  s.push({ lane: 'store', ev: ['store', 'ev ev--ok', 'deliveredAt set → the tab shows "approved · in the arch chat"'], slot: 'busy', note: 'The arch sees the request on this turn and may answer the agent with send_task.' });
  return s;
}

let i = -1;
function render() {
  const s = steps();
  $$('.lane__body').forEach((b) => (b.innerHTML = ''));
  $$('.lane').forEach((l) => l.classList.remove('hot'));
  for (let k = 0; k <= Math.min(i, s.length - 1); k++) {
    const [lane, cls, html] = s[k].ev;
    const el = document.createElement('div'); el.className = cls; el.innerHTML = html;
    $(`#lane${lane[0].toUpperCase()}${lane.slice(1)}`).appendChild(el);
  }
  const cur = s[Math.min(i, s.length - 1)];
  if (i >= 0) {
    $(`[data-lane="${cur.lane}"]`).classList.add('hot');
    $('#slot').textContent = `slot: ${cur.slot}`; $('#slot').classList.toggle('busy', cur.slot === 'busy');
    $('#stepNote').textContent = cur.note;
    $('#stepLabel').textContent = `step ${Math.min(i, s.length - 1) + 1} of ${s.length}`;
  } else {
    $('#slot').textContent = 'slot: idle'; $('#slot').classList.remove('busy');
    $('#stepNote').textContent = 'Nothing has happened yet. Toggle the two switches to see the dismissed path and the busy-arch path.';
    $('#stepLabel').textContent = `${s.length} steps`;
  }
  $('#next').disabled = i >= s.length - 1;
  $('#prev').disabled = i < 0;
}
$('#next').addEventListener('click', () => { i = Math.min(i + 1, steps().length - 1); render(); });
$('#prev').addEventListener('click', () => { i = Math.max(i - 1, -1); render(); });
['#dismissPath', '#busyPath'].forEach((sel) => $(sel).addEventListener('change', () => { i = Math.min(i, steps().length - 1); render(); }));
render();

// ── 5. follow-through: one message vs a goal conversation ───────────────────────────────────
const MSG = [
  ['', 'Operator approves → one message tagged request lands in @arch'],
  ['', 'arch: send_task web#1 "upload prod.bak to the hub as web/db/prod.bak"'],
  ['idle', 'turn ends — nobody wakes the arch'],
  ['human', 'human: "arch, did web#1 upload it?" → arch: hub_transfer MONSTER → spacex'],
  ['idle', 'turn ends again'],
  ['human', 'human: "arch, tell prg#1" → arch: send_task prg#1 "hub_download web/db/prod.bak"'],
  ['idle', 'turn ends — the human poked it for every step'],
];
function goalSteps(cap) {
  const s = [
    ['', 'Operator approves as goal → a goal conversation "goal: Request from spacex/prg#1: Need the staging DB" opens, owning prg#1, cap ' + cap],
    ['', 'poll 1 — send_task web#1 "upload prod.bak to the hub as web/db/prod.bak"; nothing more to do yet'],
    ['', 'poll 2 — read_transcript web#1: "uploaded web/db/prod.bak" → hub_transfer MONSTER → spacex (job running)'],
    ['', 'poll 3 — hub_transfer status: pushed → send_task prg#1 "hub_download web/db/prod.bak into hub-downloads/"'],
    ['', 'poll 4 — read_transcript prg#1: "downloaded, 5.0 GB, hash ok" → LOOP_DONE'],
    ['done', 'verification turn → the goal ends; the summary is posted to the Operator-facing chat; prg#1 was told'],
  ];
  if (cap < 5) s.splice(cap + 1, s.length, ['idle', `cap ${cap} reached — the goal ends as capped; the summary says what is left and the Operator decides`]);
  return s;
}
function renderDrive(active) {
  const cap = +$('#cap').value; $('#capOut').value = cap;
  $('#msgSteps').innerHTML = MSG.map(([k, t]) => `<li class="${k}">${t}</li>`).join('');
  const g = goalSteps(cap);
  $('#goalSteps').innerHTML = g.map(([k, t], i) => `<li class="${k}${i === active ? ' now' : ''}">${t}</li>`).join('');
  $('#driveLabel').textContent = active == null ? `${g.length} steps, no human in between` : `step ${active + 1} of ${g.length}`;
}
let timer = null;
$('#playDrive').addEventListener('click', () => {
  if (timer) { clearInterval(timer); timer = null; }
  let i = 0; renderDrive(i);
  timer = setInterval(() => { i++; if (i >= goalSteps(+$('#cap').value).length) { clearInterval(timer); timer = null; renderDrive(null); return; } renderDrive(i); }, 900);
});
$('#cap').addEventListener('input', () => renderDrive(null));
renderDrive(null);
