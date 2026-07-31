/* Understanding app — queue-based loop, final design.
   The stash IS the queue; verification defaults ON. Build-less, self-contained, relative URLs only. */
'use strict';

/* ---------- the six properties ---------- */
const PROPS = [
  'The stash IS the queue — no frozen copy',
  'Reorderable — new, works while armed',
  'Head item unloads at each free turn-end',
  'Consumed only when the send lands',
  'Verified by default — STEP_VERIFIED or stop',
  'Stops are lossless — re-arm resumes from the head',
];

/* ---------- prompt catalogue ---------- */
const CAT = {
  P1: { id: 'P1', label: 'Refactor the auth module' },
  P2: { id: 'P2', label: 'Add unit tests for auth' },
  P3: { id: 'P3', label: 'Update the API docs' },
  P4: { id: 'P4', label: 'Fix the flaky login test' }, // flagged mid-run
};
const QUESTION = '“Which test runner should these use? The suite doesn’t run on CI yet.”';
const ANSWER = '“Use vitest — the CI config lives in .github/workflows.”';

/* Replayed pure state machine. mode: 'verify' (default) | 'blind' (opt-out). */
const LAST = { verify: 11, blind: 8 };

function computeState(mode, step) {
  const s = {
    mode, step,
    stash: ['P1', 'P2', 'P3'],
    convo: [],                 // {t:'step'|'vok'|'vfail'|'areply'|'human', id?, text?, buried?}
    armed: false, busy: false, stopped: false, done: false,
    stopLabel: '', phase: '',
    flaggedIds: [], fresh: null,
    marker: 'def', markerText: '', note: '', tone: '',
    delivered: 0, caught: 0, buriedCount: 0,
  };
  const send = () => {
    const id = s.stash.shift();           // head of the live stash-queue
    if (id) { s.convo.push({ t: 'step', id }); s.delivered++; s.fresh = 'step:' + id; }
    return id;
  };

  for (let i = 1; i <= step; i++) {
    if (mode === 'verify') switch (i) {
      case 1:
        s.armed = true; s.phase = 'step';
        s.marker = 'def'; s.markerText = 'ARM';
        s.note = 'Arm over a non-empty stash. Settings: drive mode, cap, verification <b>ON — the default</b>. The stash strip above the composer stays the only editor.';
        break;
      case 2:
        s.busy = true; send();
        s.marker = 'def'; s.markerText = 'UNLOAD 1';
        s.note = 'Agent free at turn-end → the <b>head</b> stash item unloads, and leaves the stash only as the send lands (consume-on-land).';
        break;
      case 3:
        s.busy = true; s.stash.push('P4'); s.flaggedIds.push('P4'); s.fresh = 'stash:P4';
        s.marker = 'flag'; s.markerText = 'FLAG P4';
        s.note = 'You flag a new prompt <b>while the agent works</b>. It appends to the live queue — no re-arm, no copy. This is why the stash isn’t snapshotted.';
        break;
      case 4:
        s.busy = true; s.phase = 'verify';
        s.convo.push({ t: 'vok', id: 'P1' }); s.fresh = 'vok:P1';
        s.marker = 'win'; s.markerText = 'VERIFY ✓';
        s.note = 'P1’s turn ended. Before unloading P2, the engine sends a <b>verification turn</b> (stored template + P1’s text). The reply’s final line is <code>STEP_VERIFIED</code> → advance.';
        break;
      case 5:
        s.busy = true; s.phase = 'step'; send();
        s.marker = 'def'; s.markerText = 'UNLOAD 2';
        s.note = 'Verified → the next head item unloads.';
        break;
      case 6:
        s.busy = false; s.phase = 'verify';
        s.convo.push({ t: 'vfail', id: 'P2', text: QUESTION }); s.fresh = 'vfail:P2';
        s.armed = false; s.stopped = true; s.caught = 1;
        s.stopLabel = 'escalate · step-unverified';
        s.marker = 'div'; s.markerText = 'CAUGHT';
        s.note = '<b>The amendment at work.</b> P2’s verification reply is a question, not <code>STEP_VERIFIED</code> → the loop <b>stops and escalates</b> instead of burying it under P3. And the stop is lossless: P3 and P4 are still sitting in the stash.';
        break;
      case 7:
        s.busy = true; s.phase = '';
        s.convo.push({ t: 'human', text: ANSWER }); s.fresh = 'human';
        s.stopped = true;
        s.marker = 'flag'; s.markerText = 'CHAT';
        s.note = '<b>Interleaving, solved.</b> The queue is stopped, so you just answer the agent normally — no special “insert a prompt” mechanism needed. Unsent items wait safely in the stash.';
        break;
      case 8:
        s.busy = false; s.stopped = false; s.armed = true; s.phase = 'step';
        s.marker = 'def'; s.markerText = 'RE-ARM';
        s.note = 'One tap re-arms. There’s no cursor to restore — the queue simply resumes from the current stash head (P3).';
        break;
      case 9:
        s.busy = true; send(); s.convo.push({ t: 'vok', id: 'P3' });
        s.marker = 'def'; s.markerText = 'UNLOAD 3';
        s.note = 'P3 unloads and verifies clean.';
        break;
      case 10:
        s.busy = true; send(); s.convo.push({ t: 'vok', id: 'P4' });
        s.marker = 'def'; s.markerText = 'UNLOAD 4';
        s.note = 'P4 — the prompt you flagged mid-run — unloads and verifies clean.';
        break;
      case 11:
        s.busy = false; s.armed = false; s.done = true; s.phase = '';
        s.marker = 'win'; s.markerText = 'DONE';
        s.note = 'Stash empty at the unload point → the loop resolves <b>done · drained</b>. Four prompts delivered, one real blocker caught and answered instead of buried.';
        break;
    } else switch (i) {
      case 1:
        s.armed = true; s.phase = 'step';
        s.marker = 'def'; s.markerText = 'ARM';
        s.note = 'Arm with verification <b>opted out</b> — the fire-and-forget posture. Fine for steps you’ll eyeball yourself.';
        break;
      case 2:
        s.busy = true; send();
        s.marker = 'def'; s.markerText = 'UNLOAD 1';
        s.note = 'Head item unloads at the free turn-end, same as before.';
        break;
      case 3:
        s.busy = true; s.stash.push('P4'); s.flaggedIds.push('P4'); s.fresh = 'stash:P4';
        s.marker = 'flag'; s.markerText = 'FLAG P4';
        s.note = 'Mid-run flag still joins the live queue — that part is independent of verification.';
        break;
      case 4:
        s.busy = true; send();
        s.marker = 'def'; s.markerText = 'UNLOAD 2';
        s.note = 'P1’s turn ended → no verification turn; P2 unloads straight away.';
        break;
      case 5:
        s.busy = false;
        s.convo.push({ t: 'areply', id: 'P2', text: QUESTION }); s.fresh = 'areply:P2';
        s.marker = 'def'; s.markerText = 'REPLY';
        s.note = 'The agent ends P2’s turn with a <b>question</b>. It doesn’t know <code>NEEDS_HUMAN:</code> — it’s an ordinary chat agent — so the ladder has nothing to catch.';
        break;
      case 6:
        s.busy = true; send();
        s.convo.forEach((c) => { if (c.t === 'areply') c.buried = true; });
        s.buriedCount = 1;
        s.marker = 'div'; s.markerText = 'BURIED';
        s.note = 'Turn-end → blind unload sends P3 <b>on top of the question</b>. It scrolls away unanswered. This is exactly the failure the default-on verification exists to prevent.';
        break;
      case 7:
        s.busy = true; send();
        s.buriedCount = 1;
        s.marker = 'def'; s.markerText = 'UNLOAD 4';
        s.note = 'P4 unloads. The queue is happy; P2 still isn’t actually solved.';
        break;
      case 8:
        s.busy = false; s.armed = false; s.done = true; s.buriedCount = 1;
        s.marker = 'div'; s.markerText = 'DONE?';
        s.note = 'The loop resolves <b>done · drained</b> — all four prompts delivered, but <b>delivered ≠ solved</b>: P2’s blocker was never addressed. That gap is why verification defaults ON.';
        break;
    }
  }
  return s;
}

/* ---------- render ---------- */
let mode = 'verify';
let step = 0;
let playing = null;
const $ = (id) => document.getElementById(id);

function stepCard(id, cls, extra) {
  const p = CAT[id];
  return `<div class="card ${cls}${extra || ''}"><span class="cid">${p.id}</span><span class="clabel">${p.label}</span></div>`;
}

function convoCard(c, fresh) {
  const f = fresh ? ' fresh' : '';
  switch (c.t) {
    case 'step': return stepCard(c.id, 'sent', f);
    case 'vok': return `<div class="card vok${f}"><span class="cid">✓</span><span class="clabel">verify: ${CAT[c.id].label}</span></div>`;
    case 'vfail': return `<div class="card vfail${f}"><span class="cid">?</span><span class="clabel">verify: ${c.text}</span></div>`;
    case 'areply': return `<div class="card areply${c.buried ? ' buried' : ''}${f}"><span class="cid">?</span><span class="clabel">${c.text}</span></div>`;
    case 'human': return `<div class="card human${f}"><span class="cid">💬</span><span class="clabel">${c.text}</span></div>`;
  }
  return '';
}

function renderSim() {
  const s = computeState(mode, step);
  const last = LAST[mode];

  const items = s.stash.map((id, idx) => {
    const isNew = s.fresh === 'stash:' + id;
    const isFlag = s.flaggedIds.includes(id);
    return stepCard(id, 'q' + (idx === 0 && s.armed ? ' head' : ''), (isNew ? ' fresh' : '') + (isFlag ? ' new-flag' : ''));
  }).join('') || '<div class="empty">empty — fully drained</div>';

  const convo = s.convo.map((c) => {
    const key = c.t === 'human' ? 'human' : c.t + ':' + (c.id || '');
    return convoCard(c, s.fresh === key);
  }).join('') || '<div class="empty">nothing sent yet</div>';

  $('lanes').innerHTML = `
    <div class="lane merged">
      <h4><span class="dot stash"></span> Stash <span style="color:var(--dim)">=</span> <span class="dot queue"></span> Queue</h4>
      <p class="subh">${s.stash.length} remaining · reorderable anytime</p>
      ${items}
    </div>
    <div class="lane">
      <h4><span class="dot sent"></span> Conversation</h4>
      <p class="subh">${s.delivered} delivered${mode === 'verify' ? ' · verify turns interleaved' : ' · no verify turns'}</p>
      ${convo}
    </div>`;

  const ab = $('agent');
  ab.className = 'agentbox' + (s.busy ? '' : ' idle');
  $('agentst').innerHTML = s.busy
    ? `<b>Agent busy</b>${s.phase === 'verify' ? ' — answering a verification turn' : ' — working the current step'}`
    : (s.done ? '<b>Agent idle</b> — queue finished' : '<b>Agent idle</b> — free at the next turn-end');
  const chip = $('loopchip');
  if (s.done) { chip.className = 'loopchip done'; chip.textContent = 'done · drained'; }
  else if (s.stopped) { chip.className = 'loopchip stopped'; chip.textContent = s.stopLabel || 'stopped'; }
  else if (s.armed) { chip.className = 'loopchip armed'; chip.textContent = `armed · ${mode === 'verify' ? 'verified' : 'blind'}${s.phase ? ' · ' + s.phase : ''}`; }
  else { chip.className = 'loopchip'; chip.textContent = 'not armed'; }

  const n = $('narrate');
  n.className = 'narrate' + (s.marker === 'div' ? (mode === 'verify' ? ' good' : ' diverge') : '');
  n.innerHTML = `<span class="marker ${s.marker}">${s.markerText || '—'}</span><span>${s.note || 'Press Step to arm the queue over the stash.'}</span>`;

  const caughtColor = mode === 'verify' ? 'var(--green)' : 'var(--red)';
  const caughtTxt = mode === 'verify'
    ? `Blockers caught <b class="big" style="color:${s.caught ? 'var(--green)' : 'var(--ink)'}">${s.caught}/1</b>`
    : `Blockers buried <b class="big" style="color:${s.buriedCount ? 'var(--red)' : 'var(--ink)'}">${s.buriedCount}/1</b>`;
  $('score').innerHTML = `
    <span>Delivered <b class="big">${s.delivered}</b> / 4</span>
    <span style="color:${caughtColor}">${caughtTxt}</span>
    <span>Mid-run flag honoured <b class="big" style="color:${s.delivered === 4 || s.stash.includes('P4') ? 'var(--green)' : 'var(--ink)'}">${s.flaggedIds.length ? 'yes' : '—'}</b></span>`;

  $('steplbl').textContent = `step ${step} / ${last}`;
  $('back').disabled = step === 0;
  $('step').disabled = step === last;
  document.querySelectorAll('#modeToggle button').forEach((b) => {
    b.classList.toggle('on', b.dataset.mode === mode);
  });
}

/* ---------- controls ---------- */
function setStep(v) { step = Math.max(0, Math.min(LAST[mode], v)); renderSim(); }
function stopPlay() { if (playing) { clearInterval(playing); playing = null; $('play').textContent = '▶ Play'; } }

$('step').addEventListener('click', () => { stopPlay(); setStep(step + 1); });
$('back').addEventListener('click', () => { stopPlay(); setStep(step - 1); });
$('reset').addEventListener('click', () => { stopPlay(); setStep(0); });
$('play').addEventListener('click', () => {
  if (playing) { stopPlay(); return; }
  if (step === LAST[mode]) setStep(0);
  $('play').textContent = '⏸ Pause';
  playing = setInterval(() => {
    if (step >= LAST[mode]) { stopPlay(); return; }
    setStep(step + 1);
  }, 1250);
});
document.querySelectorAll('#modeToggle button').forEach((b) => {
  b.addEventListener('click', () => { stopPlay(); mode = b.dataset.mode; step = Math.min(step, LAST[mode]); renderSim(); });
});

/* ---------- property chips ---------- */
$('chips').innerHTML = PROPS.map((c) => `<div class="chip"><span class="tick">✓</span>${c}</div>`).join('');

/* ---------- decision ledger (final, D1–D8) ---------- */
const LEDGER = [
  { id: 'D1', title: 'A driven QueueLoop kind', key: 'inherits the safety ladder',
    text: 'One more <b>ILoop</b> kind on the existing engine — so drive/suggest dispatch, the cap, audit, operator gate and the errored-run / NEEDS_HUMAN: / deny-list ladder all apply to queue sends for free.' },
  { id: 'D2', title: 'The stash IS the queue', key: 'no snapshot, no cursor',
    text: 'The loop record stores a <b>tab binding</b>, not a step list. Each tick reads the stash head; the item is removed only when the send <b>lands</b>. Add / remove / reorder while armed simply changes what unloads next — and because unsent items never leave the stash, every stop is lossless and re-arm needs no cursor.' },
  { id: 'D3', title: 'Drain semantics', key: 'head at free turn-end · done on empty',
    text: 'Idle tick → verification first if owed; else stash empty → <b>done · drained</b>; else unload the head. <code>LOOP_DONE</code> in a step reply is ignored — a queue is the operator’s ritual, not the agent’s claim.' },
  { id: 'D4', title: 'Verification ON by default', key: 'the amendment — delivered ≠ solved',
    text: 'After each step’s turn, a verification prompt (stored template + that step’s text, composed at send time) asks whether the step was <b>genuinely accomplished</b>. Final line <code>STEP_VERIFIED</code> → next item; anything else — a question, a blocker — → <b>escalate · step-unverified</b>, quoting the reply. Opt-out per arm for fire-and-forget queues.' },
  { id: 'D5', title: 'Interleaving = stop · converse · re-arm', key: 'no pause primitive',
    text: 'Answering the agent mid-queue needs no new machinery: verification (or the ladder) stops the loop at exactly that point, you chat normally, then re-arm — resuming from the head. Suggest mode remains the fully human-gated variant.' },
  { id: 'D6', title: 'Cap', key: 'a true bound on sends',
    text: 'A live queue has no arm-time length, so the cap uses the standard driven-kind default (overridable, 1..100). Verification roughly doubles sends per item — the arm UI says so.' },
  { id: 'D7', title: 'Three surfaces, one list', key: 'stash strip · dock control · console tab',
    text: 'The stash strip is the only editor (now reorderable). The dock loop control adds settings + a <b>full numbered unload-order preview</b>; the console’s Loops section gains a <b>Queue tab</b> as the settings home. Ungated status shows counts and phase only; texts stay behind the operator gate.' },
  { id: 'D8', title: 'API follows the existing arms', key: 'additive, migration-free',
    text: 'A queue arm endpoint beside recipe/goal — <code>{ tabId, mode, verifyEnabled?, maxIterations?, sessionId? }</code>, refused on an empty stash. New loop-record fields are additive nullable, normalized on read like every prior migration; plus <code>POST …/stash/reorder</code> for the strip.' },
  { id: 'D9', title: 'Consumption made visible', key: 'openspec queue-loop-visibility',
    text: 'Three visibility fixes, D2 untouched: the strip <b>reconciles engine consumption</b> on a ~10s visible-page poll (a draining queue visibly shrinks — the old strip never refreshed unless you refocused); while a queue is armed on a tab, that tab’s strip renders as the live queue (chips numbered in unload order, the head badged <b>▶ in flight</b> during work/verify and <b>next up</b> when idle); and the loop record keeps a bounded (last 20) <b>sent-history</b> of the step texts that actually landed — reset on re-arm, disclosed only through the gated detail/debug surfaces, rendered as “sent ✓” rows in the dock inspection and the console Queue tab.' },
];

$('ledger').innerHTML = LEDGER.map((d) => `
  <div class="drow" data-id="${d.id}">
    <div class="top">
      <span class="did">${d.id}</span>
      <span class="dtitle">${d.title}<span class="k">${d.key}</span></span>
    </div>
    <div class="detail"><p>${d.text}</p></div>
  </div>`).join('');

document.querySelectorAll('.drow .top').forEach((t) => {
  t.addEventListener('click', () => t.parentElement.classList.toggle('open'));
});
// open the two crux rows by default
document.querySelectorAll('.drow').forEach((r) => {
  if (r.dataset.id === 'D2' || r.dataset.id === 'D4') r.classList.add('open');
});

/* ---------- init ---------- */
renderSim();
