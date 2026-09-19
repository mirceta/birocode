// Understanding app — recurring tasks design proposal, REVISION 2 (fleet task 31d0fd28,
// openspec recurring-tasks): a scheduled run is a GOAL LOOP — work until LOOP_DONE, verify,
// GOAL_VERIFIED — not one prompt. View 1 is a CLICKABLE MOCK of the proposed Management tab
// over invented data. Nothing here talks to the harness. Build-less, relative URLs.
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MIN = 60_000, H = 60 * MIN;
const now = () => Date.now();

// ── tabs ───────────────────────────────────────────────────────────────────────────────
$$('.tab').forEach((b) => b.addEventListener('click', () => {
  $$('.tab').forEach((x) => x.classList.toggle('is-on', x === b));
  $$('.view').forEach((v) => v.classList.toggle('is-on', v.dataset.view === b.dataset.view));
}));

// ── view 1: the mock ───────────────────────────────────────────────────────────────────
// status is the LOOP's: running | done (verified) | escalated | capped | error | stopped — or skipped | refused (never armed).
const run = (agoMin, outcome, summary, o = {}) => ({ at: now() - agoMin * MIN, status: o.status || 'done', outcome, summary, trigger: o.trigger || 'schedule',
  durationS: o.durationS ?? 90 + Math.round(Math.random() * 160), missed: o.missed || 0, reason: o.reason || null, turns: o.turns ?? (outcome ? 2 : 0) });
const strip = (s) => s.split('').map((c) => ({ o: 'ok', a: 'attention', f: 'failed', u: 'unreported', s: 'skipped', r: 'refused' }[c]));
const cards = [
  { id: 'ci', title: 'CI health check', machine: 'DESKTOP-POAPPP3', self: true, agent: 'birocode', words: 'every 2 h', everyMin: 120, nextIn: 34 * MIN, enabled: true, busy: false,
    instructions: 'Look at the last 10 GitHub Actions runs on main (gh run list). If any failed, name the workflow and the failing step. Do not change anything.',
    past: strip('oooooosoooooaoooo'),
    runs: [run(86, 'attention', '2 of the last 10 runs on main failed (deploy.yml, step "swap") — see run 8841', { turns: 4 }), run(206, 'ok', 'all 10 runs green'), run(326, 'ok', 'all 10 runs green'), run(446, 'failed', 'not verified within 6 turns', { status: 'capped', turns: 6, durationS: 610 }), run(566, 'ok', 'all 10 runs green')] },
  { id: 'drift', title: 'Morning drift report', machine: 'spacex', agent: 'prg', words: 'daily at 07:00 (Mon–Fri)', everyMin: 1440, nextIn: 13 * H + 12 * MIN, enabled: true, busy: false,
    instructions: 'git fetch. Report how far this checkout is behind origin/main, any local commits not pushed, and any uncommitted files. Do not pull or change anything.',
    past: strip('oooouooooo'),
    runs: [run(10 * 60 + 48, 'ok', 'even with origin/main, clean tree', { durationS: 62 }), run(34 * 60 + 48, 'attention', 'the agent asks: origin/main was force-pushed — reset this checkout or keep the 2 local commits?', { status: 'escalated', turns: 1, durationS: 41 }), run(58 * 60 + 48, 'ok', '3 behind origin/main, clean tree — nothing local', { durationS: 70 })] },
  { id: 'deps', title: 'Dependency audit', machine: 'laptop_pisarna', agent: 'biro-api', words: 'every day', everyMin: 1440, nextIn: -7 * MIN, enabled: true, busy: true,
    instructions: 'Run npm audit and dotnet list package --vulnerable. Report only high/critical findings with the package and the fixed version.',
    past: strip('ooaoooo'),
    runs: [run(24 * 60 + 7, 'ok', 'no high or critical findings', { durationS: 195 }), run(48 * 60 + 7, 'ok', 'no high or critical findings', { durationS: 201 })] },
  { id: 'backup', title: 'Backup verify', machine: 'living-room', agent: 'nas-scripts', words: 'every 6 h', everyMin: 360, nextIn: null, enabled: false, pausedReason: 'auto: 3 consecutive failures', busy: false,
    instructions: 'Check that last night\'s restic snapshot exists and restic check passes. Report the snapshot id and size.',
    past: strip('ooooooooooo'),
    runs: [run(3 * 60, null, null, { status: 'refused', reason: 'living-room is unreachable' }), run(9 * 60, null, null, { status: 'refused', reason: 'living-room is unreachable' }), run(15 * 60, null, null, { status: 'refused', reason: 'living-room is unreachable' }), run(21 * 60, 'ok', 'snapshot 4f1a9c02, 182 GB, check passed', { durationS: 240 })] },
];
const open = new Set(['ci']);
let gateOpen = true;
const base = now();
const dueAt = (c) => (c.nextIn == null ? null : base + c.nextIn);

function ago(ms) { const m = Math.max(0, Math.round(ms / MIN)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; }
function inWords(ms) { const s = Math.round(ms / 1000); if (s < 60) return `in ${s} s`; const m = Math.round(s / 60); return m < 60 ? `in ${m} min` : m < 48 * 60 ? `in ${Math.floor(m / 60)} h ${m % 60} min` : `in ${Math.round(m / 1440)} d`; }
const lastRun = (c) => c.runs[0];
const RESOLVED = ['done', 'escalated', 'capped', 'error', 'stopped'];
const stateOf = (r) => (r.status === 'running' ? 'running' : RESOLVED.includes(r.status) ? r.outcome : r.status);
const loopWord = (r) => ({ done: 'verified ✓', escalated: 'needs-human', capped: 'capped', error: 'error', stopped: 'stopped', running: `${r.phase}…` }[r.status] || '—');
const needsAttention = (c) => !c.enabled && c.pausedReason?.startsWith('auto') ? 'failed' : lastRun(c) && ['attention', 'failed'].includes(stateOf(lastRun(c))) ? stateOf(lastRun(c)) : null;
const phases = (r) => `<span class="phases"><i class="ph ${r.phase === 'work' ? 'ph--on' : ''}">work</i>→<i class="ph ${r.phase === 'verify' ? 'ph--on' : ''}">verify</i></span>`;

function nextLine(c) {
  if (!c.enabled) return `<span class="badge badge--skipped">paused — ${esc(c.pausedReason || 'by the Operator')}</span>`;
  const lr = lastRun(c);
  if (lr?.status === 'running') return `<span class="badge badge--running">goal loop ${phases(lr)} · turn ${lr.turns}</span>`;
  const d = dueAt(c) - now();
  if (d > 0) return `<span class="next">next run ${inWords(d)}</span>`;
  const why = !gateOpen ? 'the Operator\'s autopilot gate is closed' : c.busy ? 'the agent is busy or its loop slot is in use — it runs when free' : 'arming…';
  return `<span class="badge badge--hold">due ${ago(-d)} — held: ${esc(why)}</span>`;
}

function cardHtml(c) {
  const lr = lastRun(c); const st = lr ? stateOf(lr) : null; const attn = needsAttention(c);
  const squares = [...c.past.slice(-(20 - c.runs.length)), ...c.runs.slice().reverse().map(stateOf)].slice(-20);
  const running = lr?.status === 'running';
  return `<article class="card ${attn ? `card--${attn}` : ''} ${c.enabled ? '' : 'card--paused'} ${open.has(c.id) ? 'is-open' : ''}" data-card="${c.id}">
    <div class="card__top" data-toggle>
      <div>
        <div class="card__title">${esc(c.title)}</div>
        <div class="card__meta">
          <span class="chip"><i class="dot ${c.busy || running ? 'dot--busy' : c.enabled ? 'dot--idle' : ''}"></i>${c.self ? '⌂ ' : ''}${esc(c.machine)}/<b>${esc(c.agent)}</b><button class="open" title="open this agent in the worker window" data-noop>⧉</button></span>
          <span>🔁 ${esc(c.words)}</span><span>· 🎯 goal loop, ≤ 6 turns</span><span>· ${c.runs.length + c.past.length} runs</span>
        </div>
      </div>
      <div class="card__right">${nextLine(c)}<span class="strip" title="last ${squares.length} runs, newest on the right">${squares.map((s) => `<i class="sq sq--${s}"></i>`).join('')}</span></div>
      ${lr ? `<div class="summaryline"><span class="badge badge--${st}">${st === 'ok' ? 'OK' : st.toUpperCase()}</span> ${esc(lr.summary || lr.reason || 'the agent is working toward the goal…')} <span class="dim">· ${ago(now() - lr.at)}</span></div>` : ''}
    </div>
    <div class="card__body">
      <div class="row">
        <label class="f" style="flex:3 1 420px">instructions — the GOAL of every run (the loop works until it is verified)<textarea>${esc(c.instructions)}</textarea></label>
        <label class="f">assigned repo agent<select><option>${esc(c.machine)}/${esc(c.agent)}</option><option>DESKTOP-POAPPP3/birocode</option><option>spacex/prg</option><option>laptop_pisarna/biro-api</option></select>
          <span>schedule</span><select><option>${esc(c.words)}</option><option>every 30 min</option><option>every 2 h</option><option>daily at 07:00 (Mon–Fri)</option></select></label>
        <label class="f" style="flex:1 1 170px">run as<select><option>🎯 goal loop — work, then verify</option><option>single prompt (trivial checks)</option></select>
          <span>turn budget per run</span><input type="number" value="6" min="2" max="30" /></label>
      </div>
      <div class="opts">
        <label><input type="checkbox" checked /> catch up after downtime (once)</label>
        <label><input type="checkbox" /> skip instead of waiting when the agent / its loop slot is busy</label>
        <label><input type="checkbox" checked /> skip when the plan's 5-hour window is above 85 %</label>
        <label><input type="checkbox" /> only when the repo is on its default branch</label>
      </div>
      <div class="note dim">Needs the agent's one loop slot: held while any other loop uses it; the Operator's previous loop settings are put back afterwards. The run is visible live in the agent's dock Loop panel.</div>
      <div class="row" style="margin-top:10px">
        <button class="btn btn--accent" data-run ${gateOpen && !running && !c.busy ? '' : 'disabled'}>▶ Run now</button>
        ${running ? '<button class="btn" data-stop>■ Stop run</button>' : ''}
        <button class="btn" data-pause>${c.enabled ? '⏸ Pause' : '▶ Resume'}</button>
        <button class="btn" data-busy ${running ? 'disabled' : ''}>${c.busy ? 'demo: free the agent / loop slot' : 'demo: agent busy / loop slot in use'}</button>
        <span class="dim" style="margin-left:auto">Delete…</span>
      </div>
      <table class="hist"><thead><tr><th>when</th><th>trigger</th><th>outcome</th><th>summary</th><th>loop ended</th><th>turns</th><th>took</th></tr></thead><tbody>
        ${c.runs.map((r) => `<tr><td class="num">${ago(now() - r.at)}</td><td>${esc(r.trigger)}${r.missed ? ` <span class="dim">(covers ${r.missed})</span>` : ''}</td><td><span class="badge badge--${stateOf(r)}">${esc(stateOf(r))}</span></td><td>${esc(r.summary || r.reason || 'working toward the goal…')}</td><td>${esc(loopWord(r))}</td><td class="num">${r.turns || '—'}</td><td class="num">${RESOLVED.includes(r.status) ? `${r.durationS} s` : '—'}</td></tr>`).join('')}
      </tbody></table>
      <div class="dim" style="margin-top:6px">↳ each row opens the run's turns in the agent's transcript (⧉) and its sends in the autopilot audit. Older runs load on demand.</div>
    </div>
  </article>`;
}

function order(list) {
  const rank = (c) => (needsAttention(c) && c.enabled ? 0 : !c.enabled ? 3 : 1);
  return list.slice().sort((a, b) => rank(a) - rank(b) || (dueAt(a) ?? Infinity) - (dueAt(b) ?? Infinity));
}

function render() {
  $('#cards').innerHTML = order(cards).map(cardHtml).join('');
  const attn = cards.filter(needsAttention).length;
  $('#attn-count').textContent = attn || '';
  const active = cards.filter((c) => c.enabled);
  const next = active.map(dueAt).filter((d) => d > now()).sort((a, b) => a - b)[0];
  $('#summary').textContent = `${active.length} active · ${cards.length - active.length} paused · ${attn} need attention${next ? ` · next run ${inWords(next - now())}` : ''}`;
  $('#gate-banner').hidden = gateOpen;
}

// A mock goal-loop run: work … LOOP_DONE → verify → (sometimes gaps → work → verify) → GOAL_VERIFIED.
const OUTCOMES = [['ok', 'all 10 runs green'], ['ok', 'nothing to report'], ['attention', 'one new failure on main since the last run — test job, flaky?'], ['ok', 'nothing to report']];
function fire(c, trigger) {
  const r = { at: now(), status: 'running', phase: 'work', turns: 1, outcome: null, summary: null, trigger, durationS: 0, missed: 0 };
  c.runs.unshift(r); render();
  const script = Math.random() < 0.35 ? ['verify', 'work', 'verify'] : ['verify'];
  const step = () => {
    if (r.status !== 'running') return;
    const next = script.shift();
    if (next) { r.phase = next; r.turns += 1; r.note = next === 'work' ? 'verification found a gap — back to work' : null; if (r.note) r.summary = r.note; render(); setTimeout(step, 1700); return; }
    const [o, s] = OUTCOMES[Math.floor(Math.random() * OUTCOMES.length)];
    Object.assign(r, { status: 'done', outcome: o, summary: s, durationS: Math.round((now() - r.at) / 1000) }); render();
  };
  setTimeout(step, 1700);
}

$('#cards').addEventListener('click', (e) => {
  const el = e.target.closest('[data-card]'); if (!el) return;
  const c = cards.find((x) => x.id === el.dataset.card);
  if (e.target.closest('[data-noop]')) { e.stopPropagation(); return; }
  if (e.target.closest('[data-run]')) { fire(c, 'manual'); return; }
  if (e.target.closest('[data-stop]')) { const r = lastRun(c); Object.assign(r, { status: 'stopped', outcome: 'failed', summary: 'stopped by the Operator', durationS: Math.round((now() - r.at) / 1000) }); render(); return; }
  if (e.target.closest('[data-pause]')) { c.enabled = !c.enabled; c.pausedReason = c.enabled ? null : 'by the Operator'; if (c.enabled && c.nextIn == null) c.nextIn = (now() - base) + c.everyMin * MIN; render(); return; }
  if (e.target.closest('[data-busy]')) { c.busy = !c.busy; render(); return; }
  if (e.target.closest('[data-toggle]')) { open.has(c.id) ? open.delete(c.id) : open.add(c.id); render(); }
});
$('#gate').addEventListener('change', (e) => { gateOpen = e.target.checked; render(); });
$('#add').addEventListener('click', () => {
  const id = `new${cards.length}`;
  cards.push({ id, title: 'New recurring task', machine: 'DESKTOP-POAPPP3', self: true, agent: 'birocode', words: 'every 30 min', everyMin: 30, nextIn: (now() - base) + 30 * MIN, enabled: true, busy: false, instructions: 'What is the goal of every run?', past: [], runs: [] });
  open.add(id); render();
});
// The scheduler tick of the mock: a due card whose agent + loop slot are free (and gate open) arms; the grid moves on.
setInterval(() => {
  for (const c of cards) {
    if (!c.enabled || c.nextIn == null || lastRun(c)?.status === 'running') continue;
    if (dueAt(c) <= now() && gateOpen && !c.busy) { const late = now() - dueAt(c) > 10 * MIN; while (dueAt(c) <= now()) c.nextIn += c.everyMin * MIN; fire(c, late ? 'catch-up' : 'schedule'); }
  }
  if (!document.activeElement || !['TEXTAREA', 'SELECT', 'INPUT'].includes(document.activeElement.tagName) || document.activeElement.id === 'gate') render();
}, 1000);
render();

// ── view 2: the flow ───────────────────────────────────────────────────────────────────
const STEPS = [
  { t: 'Tick', tag: 'new', d: '<b>RecurringScheduler</b>, a hosted service, every 10 s (the loop engine\'s cadence). It yields before its first pass so it can never delay the harness coming up — the verifier-startup lesson.' },
  { t: 'Due?', tag: 'new', d: '<code>Recurrence.Decide</code> (pure, unit-tested): the first occurrence after the last handled one. Not due → <b>idle</b>. Several passed → the pending one is the <b>newest</b>, the rest are counted as <i>missed</i> (one catch-up run, never a burst).' },
  { t: 'Gate', tag: 'reuse', d: 'The Operator\'s <b>AutopilotGate</b> (host GUI only, default off). Arming a loop already requires it and the engine stops ticking when it closes. Closed → <b>hold</b>: nothing armed, nothing recorded, the card says why.' },
  { t: 'Slot free?', tag: 'reuse', d: 'Two existing arbiters: the builder <b>run slot</b> (a turn is running) and the agent\'s <b>one loop slot</b> (<code>LoopConfigStore</code>: "exclusive arming is structural"). Either in use — the Operator\'s loop, the arch\'s, another recurring card\'s run — → <b>hold</b> in the scheduler. Nothing is queued in the agent; nothing is pre-empted. Two cards on one agent therefore run one after the other.' },
  { t: 'Arm the goal loop', tag: 'reuse', d: '<code>LoopArmer.Start(kind: goal, mode: drive, goal: …, maxIterations: turn budget, by: "recurring")</code> — the one arming path the dock panel, the arch\'s <code>start_loop</code> and the agent\'s <code>arm_my_loop</code> share. For a peer: <code>FleetClient.Loop</code> → <code>POST /api/arch/peer/loop</code> (exists). The inactive slot\'s previous parameters are snapshotted first — the slot is <b>borrowed</b>. A refusal (unmanaged, unreachable, not accepting) → a <b>refused</b> run with the named reason.' },
  { t: 'Work turns', tag: 'reuse', d: '<b>The existing engine drives it.</b> <code>GoalLoop</code>: the work prompt ("Work toward this goal until it is genuinely achieved…") goes out on every idle tick until a reply ends with <code>LOOP_DONE</code>. Every send carries the operator-editable <b>briefing</b>, is written to the <b>autopilot audit</b>, reply-less runs are retried, <code>NEEDS_HUMAN:</code> anywhere escalates, the cap bounds it. The agent\'s dock Loop panel shows all of it live.' },
  { t: 'Verify turn', tag: 'reuse', d: '<code>LOOP_DONE</code> → the verify prompt: "You declared the goal done… <b>Critically verify it against the ACTUAL state of the repository</b> — do not trust your memory of the work." Only a reply ending in <code>GOAL_VERIFIED</code> completes the run; listed gaps send the loop <b>back to work</b>. This is what makes an unattended "OK" worth believing.' },
  { t: 'Resolution → outcome', tag: 'new', d: '<code>LoopConfigStore.Resolve</code> already publishes <code>loop.done | escalated | capped | error | stopped</code> (with reason, detail, iterations, armedBy) on the feed — collected fleet-wide. <code>Recurrence.OutcomeOfLoop</code> maps it: <b>verified</b> → the result line above GOAL_VERIFIED (<code>RUN OK</code> / <code>RUN ATTENTION</code>; none → ok) · <b>needs-human</b> → attention, the agent\'s question · <b>capped / error / Operator stop</b> → failed. Deterministic; no model.' },
  { t: 'History', tag: 'new', d: 'The run record is completed in <code>recurring-runs.jsonl</code> (loop status, stop reason, turns, duration, cost, outcome, summary); the card\'s strip gains a square; ATTENTION/FAILED badge the card and the tab; the borrowed loop slot gets the Operator\'s previous parameters back. <b>Three consecutive failed/refused runs pause the task</b> (an escalation is not a failure).' },
];
$('#flow').innerHTML = STEPS.map((s, i) => `<div class="step ${i === 0 ? 'is-on' : ''}" data-step="${i}"><span class="tag tag--${s.tag}">${s.tag === 'new' ? 'new' : 'reused'}</span><div class="n">${i + 1}</div><div class="t">${s.t}</div></div>`).join('');
const showStep = (i) => { $$('.step').forEach((x) => x.classList.toggle('is-on', +x.dataset.step === i)); $('#flow-detail').innerHTML = `<b>${i + 1} · ${STEPS[i].t}</b> <span class="tag tag--${STEPS[i].tag}" style="position:static">${STEPS[i].tag === 'new' ? 'new code' : 'existing machinery'}</span><p style="margin:6px 0 0">${STEPS[i].d}</p>`; };
$('#flow').addEventListener('click', (e) => { const s = e.target.closest('[data-step]'); if (s) showStep(+s.dataset.step); });
showStep(0);
$('#grid-demo').innerHTML = ['10:00', '12:00', '14:00', '16:00', '18:00'].map((t, i) => `<span class="${i === 1 ? 'late' : ''}">${t}</span>`).join('');
$('#loop-diagram').textContent = `work prompt ──▶ reply … ──▶ work prompt ──▶ reply ends LOOP_DONE
                                              │
                          verify prompt ◀─────┘   "Critically verify against the ACTUAL state…"
                              │
   reply ends GOAL_VERIFIED ──▶ done · verified   ──▶ outcome = RUN OK / RUN ATTENTION line (none → ok)
   gaps listed              ──▶ back to work
   NEEDS_HUMAN: … anywhere  ──▶ escalate          ──▶ outcome = attention, the agent's question
   turn budget reached      ──▶ capped            ──▶ outcome = failed
   no reply ×3 / crash      ──▶ error             ──▶ outcome = failed`;

// ── view 3: reuse ──────────────────────────────────────────────────────────────────────
const REUSE = [
  ['GoalLoop + AutopilotService (the engine)', '<b>The run itself.</b> Work until LOOP_DONE, verify, GOAL_VERIFIED or back to work; NEEDS_HUMAN escalation; the cap; no-reply retries; stale-reply guards. Unchanged.'],
  ['LoopArmer.Start / Stop', 'The one arming path (dock panel, arch <code>start_loop</code>, agent <code>arm_my_loop</code>). Gains the attribution <code>recurring</code>. Stop = the card\'s "Stop run".'],
  ['FleetClient.Loop → POST /api/arch/peer/loop', 'Arming the loop on a <b>peer\'s</b> agent — exists for the arch loop tools; the receiver\'s accept-sends, gate and scope apply.'],
  ['LoopConfigStore.Resolve → loop.* feed events', 'How the scheduler learns a run ended, locally and (collected) fleet-wide: status, reason, detail, iterations, armedBy.'],
  ['Situational briefing · autopilot-audit.jsonl', 'Every send of a run is briefed with the operator-editable rules and audited with the exact text — the per-turn trail of a run is free.'],
  ['DockLoopControl · LoopStateStrip', 'The agent\'s dock already shows the armed loop, its phase chips and the pending send; the card reuses the phase vocabulary.'],
  ['AutopilotGate', 'The Operator\'s master fence; arming requires it, mutations answer 403 while closed.'],
  ['RunSessionService run slot · RestoreStandingLoopIfNeeded', 'Busy arbitration; the precedent for borrowing the loop slot and handing it back.'],
  ['IAgentDirectory.SendToAgent + RunCompleted', 'The <code>single</code> run mode (one prompt, closing line) for trivial checks.'],
  ['GET /arch/fleet/status (agents + plan usage)', 'The assignee picker, and the plan-usage guard\'s data.'],
  ['Kanban chip · AgentStatusDot · ⧉ worker window · StatusBadge · PolicemanPanel history', 'The card and its history look and behave like what is already on the dashboard.'],
  ['ManageApp TABS / weights / labelOf / renderPane', 'Four small edits register the tab; order, hidden set and <code>?tab=recurring</code> come free.'],
];
$('#reuse-table').innerHTML = `<tr><th>existing piece</th><th>used for</th></tr>` + REUSE.map(([a, b]) => `<tr><td><code>${esc(a)}</code></td><td>${b}</td></tr>`).join('')
  + `<tr><td><b>new</b>: RecurringTaskStore · RecurringRunLog · RecurringScheduler · run closer · slot borrowing · RecurringController · RecurringTab.jsx + recurringCards.js</td><td>The card, the clock, the history, the API and the tab. The pure core (<code>Recurrence.cs</code>: grid, coalescing, ladder, goal text, result line, loop-resolution → outcome) is prototyped with tests on this branch.</td></tr>`;

// ── view 4: model ──────────────────────────────────────────────────────────────────────
$('#json-card').textContent = JSON.stringify({ id: '9f2c…', title: 'CI health check', sourceId: null, repoId: 'c7a98baf…', instructions: 'Look at the last 10 GitHub Actions runs on main…', schedule: { kind: 'interval', everyMinutes: 120 }, run: { mode: 'goal', maxTurns: 6 }, policy: { catchUp: true, skipWhenBusy: false, skipAbovePlanUsage: 85, requireDefaultBranch: false }, enabled: true, pausedReason: null, anchorAt: 1789800000000, lastHandledDueAt: 1789807200000, runCount: 41, createdBy: 'operator' }, null, 2)
  + '\n\n// or: "schedule": { "kind": "daily", "at": "07:00", "days": ["Monday", …] }\n// or: "run": { "mode": "single" }';
$('#json-run').textContent = JSON.stringify({ id: 'r-…', taskId: '9f2c…', n: 42, dueAt: 1789814400000, missed: 0, trigger: 'schedule', status: 'done', stopReason: 'verified', turns: 4, phase: null, armedAt: 1789814408000, endedAt: 1789814656211, durationMs: 248211, costUsd: 0.21, outcome: 'attention', summary: '2 of the last 10 runs on main failed (deploy.yml) — see run 8841', reason: null, sessionId: '…', machine: 'DESKTOP-POAPPP3', agent: 'birocode' }, null, 2)
  + '\n\n// status: running | done | escalated | capped | error | stopped | skipped | refused\n// outcome: ok | attention | failed | unreported\n// trigger: schedule | catch-up | manual';
$('#envelope').textContent = `[Recurring task] CI health check
Recurring id: 9f2c… · run #42 · due 2026-09-19 14:00 · every 2 h · armed by the harness scheduler on DESKTOP-POAPPP3
Previous run: 2026-09-19 12:00 — OK: all 10 runs green

Look at the last 10 GitHub Actions runs on main (gh run list). If any failed, name the workflow and the failing step. Do not change anything.

This is an unattended, recurring run. Do what the instructions say and nothing else; if there is nothing to do, say so in one sentence. Do not push, merge or deploy unless the instructions explicitly say so. When you confirm the goal is verified, put ONE result line directly above GOAL_VERIFIED: "RUN OK: <one-line result>" or "RUN ATTENTION: <what the Operator should look at>".`;

// ── view 5: ideas + questions ──────────────────────────────────────────────────────────
const IDEAS = [
  ['A run is a goal loop (Operator, revision 2)', 'Unattended work gets the harness\'s own discipline: work until LOOP_DONE, then a verification turn against the actual repo state, and only GOAL_VERIFIED counts. With it, for free: escalation, caps, briefing, audit, the dock\'s live loop display, the Stop button.'],
  ['RUN ATTENTION as a first-class outcome', 'A recurring check mostly says "fine". The valuable run is the one that says "look at this" — it badges the card and the tab, so the tab is a to-look-at list, not a log. A NEEDS_HUMAN question lands in the same place.'],
  ['The loop slot as the arbiter — borrowed, not taken', 'One loop per agent is structural. Recurring runs queue up behind whatever holds the slot (in the scheduler, never in the agent) and hand the Operator\'s loop settings back afterwards.'],
  ['The run strip', 'Twenty squares per card, the way CI history reads: health at a glance without opening anything.'],
  ['"Previous run: …" in the goal', 'Continuity across runs ("last time 3 behind, now 5") without the task owning a session or growing a private context.'],
  ['Coalesced catch-up · self-pause', 'After a night off, each card runs once and says how many occurrences it covers. Three failed/refused runs in a row pause the task.'],
  ['Plan-usage guard — now in the first build', 'A goal run is at least two turns. Skip (and record it) when the account\'s 5-hour window is above the card\'s threshold — the data is already on the fleet poll.'],
  ['Found while building · a fresh agent', 'The loop engine refused to drive a repo agent that has no conversation yet — the first real run armed the loop and sat forever. Loops armed by a recurring task may now start the conversation themselves, the exemption arch conversations already had.'],
  ['Later · escalate to the board · agents may propose', 'On ATTENTION/FAILED, optionally create a Kanban card for the same agent: recurring tasks detect, board cards track the fix. Arch / repo agents may propose a recurring task — always created paused.'],
];
$('#ideas').innerHTML = IDEAS.map(([t, d]) => `<div class="box box--idea"><h4>${esc(t)}</h4><p>${esc(d)}</p></div>`).join('');
const QS = [
  ['Keep a "single prompt" run mode next to the goal loop?', 'A goal run costs at least two turns (work + verify). For a trivial read-only check every 15 minutes that may be more than it is worth.', ['yes — per card, default goal loop', 'no — goal loops only'], 0],
  ['Turn budget per run', 'The goal loop\'s cap: work + verify + one repair round + slack. Reaching it records the run as failed.', ['6 turns', '4 turns', '10 turns'], 0],
  ['Agent busy or its loop slot in use at the scheduled time', 'Wait for it to be free (run late), or drop this occurrence?', ['hold until free', 'skip the occurrence', 'per card, default hold'], 2],
  ['Borrowing the loop slot', 'An inactive slot still holds the Operator\'s last loop parameters (the dock panel rehydrates from them). Put them back after a recurring run?', ['restore them (a build task)', 'fine to leave the recurring goal there'], 0],
  ['Who owns a card assigned to a peer\'s agent?', 'Hub-owned: one store, one tab, arms over the fleet, fires only while the hub is up. Assignee-owned: fires without the hub, but the tab must aggregate cards from every machine.', ['the hub owns it and arms over the fleet', 'the assignee\'s harness owns it'], 0],
  ['Claimed repos', 'Should an unattended run start on a repo sitting on a branch nobody assigned?', ['arm anyway', 'per card: "only on the default branch"', 'never'], 1],
  ['Schedules', 'Every N min/h/d and daily-at-HH:mm-on-weekdays are proposed. Needed beyond that?', ['these two are enough', 'also cron-style expressions'], 0],
  ['Who may create recurring tasks?', '', ['the Operator only (v1)', 'also arch / repo agents — created paused'], 0],
  ['Which conversation does a run live in?', 'The goal loop pins the dock\'s session, so runs land in the agent\'s own conversation — visible where you already look, but it grows that context. A card-owned thread is possible later.', ['the agent\'s own conversation (v1)', 'a dedicated thread per card'], 0],
];
$('#questions').innerHTML = QS.map(([t, d, opts, def], i) => `<div class="q"><h4>${i + 1}. ${esc(t)}</h4>${d ? `<div class="dim">${esc(d)}</div>` : ''}<div class="optrow">${opts.map((o, j) => `<span class="opt ${j === def ? 'opt--default' : ''}">${j === def ? '✓ built: ' : ''}${esc(o)}</span>`).join('')}</div></div>`).join('');
