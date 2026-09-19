// Understanding app — recurring tasks design proposal (fleet task 31d0fd28, openspec
// recurring-tasks). View 1 is a CLICKABLE MOCK of the proposed Management tab over invented
// data: it shows the card, the run strip, holds, Run now, pause and the history the way
// the design describes them. Nothing here talks to the harness. Build-less, relative URLs.
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
const run = (agoMin, outcome, summary, o = {}) => ({ at: now() - agoMin * MIN, status: o.status || 'done', outcome, summary, trigger: o.trigger || 'schedule', durationS: o.durationS ?? 40 + Math.round(Math.random() * 80), missed: o.missed || 0, reason: o.reason || null });
const strip = (s) => s.split('').map((c) => ({ o: 'ok', a: 'attention', f: 'failed', u: 'unreported', s: 'skipped', r: 'refused' }[c]));
const cards = [
  { id: 'ci', title: 'CI health check', machine: 'DESKTOP-POAPPP3', self: true, agent: 'birocode', words: 'every 2 h', everyMin: 120, nextIn: 34 * MIN, enabled: true, busy: false,
    instructions: 'Look at the last 10 GitHub Actions runs on main (gh run list). If any failed, name the workflow and the failing step. Do not change anything.',
    past: strip('oooooosoooooaooooo'),
    runs: [run(86, 'attention', '2 of the last 10 runs on main failed (deploy.yml, step "swap") — see run 8841'), run(206, 'ok', 'all 10 runs green'), run(326, 'ok', 'all 10 runs green'), run(446, 'ok', 'all 10 runs green')] },
  { id: 'drift', title: 'Morning drift report', machine: 'spacex', agent: 'prg', words: 'daily at 07:00 (Mon–Fri)', everyMin: 1440, nextIn: 13 * H + 12 * MIN, enabled: true, busy: false,
    instructions: 'git fetch. Report how far this checkout is behind origin/main, any local commits not pushed, and any uncommitted files. Do not pull or change anything.',
    past: strip('oooouoooooo'),
    runs: [run(10 * 60 + 48, 'ok', 'even with origin/main, clean tree', { durationS: 22 }), run(34 * 60 + 48, 'ok', '3 behind origin/main, clean tree — nothing local', { durationS: 25 })] },
  { id: 'deps', title: 'Dependency audit', machine: 'laptop_pisarna', agent: 'biro-api', words: 'every day', everyMin: 1440, nextIn: -7 * MIN, enabled: true, busy: true,
    instructions: 'Run npm audit and dotnet list package --vulnerable. Report only high/critical findings with the package and the fixed version.',
    past: strip('ooaoooo'),
    runs: [run(24 * 60 + 7, 'ok', 'no high or critical findings', { durationS: 95 }), run(48 * 60 + 7, 'ok', 'no high or critical findings', { durationS: 101 })] },
  { id: 'backup', title: 'Backup verify', machine: 'living-room', agent: 'nas-scripts', words: 'every 6 h', everyMin: 360, nextIn: null, enabled: false, pausedReason: 'auto: 3 consecutive failures', busy: false,
    instructions: 'Check that last night\'s restic snapshot exists and restic check passes. Report the snapshot id and size.',
    past: strip('ooooooooooo'),
    runs: [run(3 * 60, null, null, { status: 'refused', reason: 'living-room is unreachable' }), run(9 * 60, null, null, { status: 'refused', reason: 'living-room is unreachable' }), run(15 * 60, null, null, { status: 'refused', reason: 'living-room is unreachable' }), run(21 * 60, 'ok', 'snapshot 4f1a9c02, 182 GB, check passed', { durationS: 140 })] },
];
const open = new Set(['ci']);
let gateOpen = true;
const base = now();
const dueAt = (c) => (c.nextIn == null ? null : base + c.nextIn);

function ago(ms) { const m = Math.max(0, Math.round(ms / MIN)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; }
function inWords(ms) { const s = Math.round(ms / 1000); if (s < 60) return `in ${s} s`; const m = Math.round(s / 60); return m < 60 ? `in ${m} min` : m < 48 * 60 ? `in ${Math.floor(m / 60)} h ${m % 60} min` : `in ${Math.round(m / 1440)} d`; }
const lastRun = (c) => c.runs[0];
const stateOf = (r) => (r.status === 'running' ? 'running' : r.status === 'done' ? r.outcome : r.status);
const needsAttention = (c) => !c.enabled && c.pausedReason?.startsWith('auto') ? 'failed' : lastRun(c) && ['attention', 'failed'].includes(stateOf(lastRun(c))) ? stateOf(lastRun(c)) : null;

function nextLine(c) {
  if (!c.enabled) return `<span class="badge badge--skipped">paused — ${esc(c.pausedReason || 'by the Operator')}</span>`;
  if (lastRun(c)?.status === 'running') return `<span class="badge badge--running">running now…</span>`;
  const d = dueAt(c) - now();
  if (d > 0) return `<span class="next">next run ${inWords(d)}</span>`;
  const why = !gateOpen ? 'the Operator\'s autopilot gate is closed' : c.busy ? 'the agent is busy — it runs when the agent is idle' : 'sending…';
  return `<span class="badge badge--hold">due ${ago(-d)} — held: ${esc(why)}</span>`;
}

function cardHtml(c) {
  const lr = lastRun(c); const st = lr ? stateOf(lr) : null; const attn = needsAttention(c);
  const squares = [...c.past.slice(-(20 - c.runs.length)), ...c.runs.slice().reverse().map(stateOf)].slice(-20);
  return `<article class="card ${attn ? `card--${attn}` : ''} ${c.enabled ? '' : 'card--paused'} ${open.has(c.id) ? 'is-open' : ''}" data-card="${c.id}">
    <div class="card__top" data-toggle>
      <div>
        <div class="card__title">${esc(c.title)}</div>
        <div class="card__meta">
          <span class="chip"><i class="dot ${c.busy || lr?.status === 'running' ? 'dot--busy' : c.enabled ? 'dot--idle' : ''}"></i>${c.self ? '⌂ ' : ''}${esc(c.machine)}/<b>${esc(c.agent)}</b><button class="open" title="open this agent in the worker window" data-noop>⧉</button></span>
          <span>🔁 ${esc(c.words)}</span><span>· ${c.runs.length + c.past.length} runs</span>
        </div>
      </div>
      <div class="card__right">${nextLine(c)}<span class="strip" title="last ${squares.length} runs, newest on the right">${squares.map((s) => `<i class="sq sq--${s}"></i>`).join('')}</span></div>
      ${lr ? `<div class="summaryline"><span class="badge badge--${st}">${st === 'ok' ? 'OK' : st.toUpperCase()}</span> ${esc(lr.summary || lr.reason || '…')} <span class="dim">· ${ago(now() - lr.at)}</span></div>` : ''}
    </div>
    <div class="card__body">
      <div class="row">
        <label class="f" style="flex:3 1 420px">instructions — what the agent does on every run<textarea>${esc(c.instructions)}</textarea></label>
        <label class="f">assigned repo agent<select><option>${esc(c.machine)}/${esc(c.agent)}</option><option>DESKTOP-POAPPP3/birocode</option><option>spacex/prg</option><option>laptop_pisarna/biro-api</option></select>
          <span>schedule</span><select><option>${esc(c.words)}</option><option>every 30 min</option><option>every 2 h</option><option>daily at 07:00 (Mon–Fri)</option></select></label>
      </div>
      <div class="opts">
        <label><input type="checkbox" checked /> catch up after downtime (once)</label>
        <label><input type="checkbox" /> skip instead of waiting when the agent is busy</label>
        <label><input type="checkbox" checked /> hold while the agent has an active drive loop</label>
        <label><input type="checkbox" /> only when the repo is on its default branch</label>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn btn--accent" data-run ${gateOpen && lr?.status !== 'running' ? '' : 'disabled'}>▶ Run now</button>
        <button class="btn" data-pause>${c.enabled ? '⏸ Pause' : '▶ Resume'}</button>
        <button class="btn" data-busy>${c.busy ? 'demo: make the agent idle' : 'demo: make the agent busy'}</button>
        <span class="dim" style="margin-left:auto">Delete…</span>
      </div>
      <table class="hist"><thead><tr><th>when</th><th>trigger</th><th>outcome</th><th>summary</th><th>took</th></tr></thead><tbody>
        ${c.runs.map((r) => `<tr><td class="num">${ago(now() - r.at)}</td><td>${esc(r.trigger)}${r.missed ? ` <span class="dim">(covers ${r.missed})</span>` : ''}</td><td><span class="badge badge--${stateOf(r)}">${esc(stateOf(r))}</span></td><td>${esc(r.summary || r.reason || 'waiting for the agent\'s closing line…')}</td><td class="num">${r.status === 'done' ? `${r.durationS} s` : '—'}</td></tr>`).join('')}
      </tbody></table>
      <div class="dim" style="margin-top:6px">↳ each row links to the run's turn in the agent's transcript (⧉). Older runs load on demand.</div>
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

const OUTCOMES = [['ok', 'all 10 runs green'], ['ok', 'nothing to report'], ['attention', 'one new failure on main since the last run — test job, flaky?'], ['ok', 'nothing to report']];
function fire(c, trigger) {
  const r = { at: now(), status: 'running', outcome: null, summary: null, trigger, durationS: 0, missed: 0 };
  c.runs.unshift(r); c.busy = true; render();
  setTimeout(() => {
    const [o, s] = OUTCOMES[Math.floor(Math.random() * OUTCOMES.length)];
    Object.assign(r, { status: 'done', outcome: o, summary: s, durationS: 3 }); c.busy = false; render();
  }, 3000);
}

$('#cards').addEventListener('click', (e) => {
  const el = e.target.closest('[data-card]'); if (!el) return;
  const c = cards.find((x) => x.id === el.dataset.card);
  if (e.target.closest('[data-noop]')) { e.stopPropagation(); return; }
  if (e.target.closest('[data-run]')) { fire(c, 'manual'); return; }
  if (e.target.closest('[data-pause]')) { c.enabled = !c.enabled; c.pausedReason = c.enabled ? null : 'by the Operator'; if (c.enabled && c.nextIn == null) c.nextIn = (now() - base) + c.everyMin * MIN; render(); return; }
  if (e.target.closest('[data-busy]')) { c.busy = !c.busy; render(); return; }
  if (e.target.closest('[data-toggle]')) { open.has(c.id) ? open.delete(c.id) : open.add(c.id); render(); }
});
$('#gate').addEventListener('change', (e) => { gateOpen = e.target.checked; render(); });
$('#add').addEventListener('click', () => {
  const id = `new${cards.length}`;
  cards.push({ id, title: 'New recurring task', machine: 'DESKTOP-POAPPP3', self: true, agent: 'birocode', words: 'every 30 min', everyMin: 30, nextIn: (now() - base) + 30 * MIN, enabled: true, busy: false, instructions: 'What should the agent do on every run?', past: [], runs: [] });
  open.add(id); render();
});
// The scheduler tick of the mock: a due card whose agent is idle (and gate open) fires; the grid moves on.
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
  { t: 'Due?', tag: 'new', d: '<code>Recurrence.Decide</code> (pure, unit-tested): the first occurrence after the last handled one. Not due → <b>idle</b>, the card shows "next run in …". Several passed → the pending one is the <b>newest</b>, the rest are counted as <i>missed</i>.' },
  { t: 'Gate', tag: 'reuse', d: 'The Operator\'s <b>AutopilotGate</b> (host GUI only, default off) fences every unattended send in the harness; recurring sends are no different. Closed → <b>hold</b>: nothing sent, nothing recorded, the card says why.' },
  { t: 'Holds', tag: 'new', d: 'Reasons to wait that are not failures: the agent has an <b>active drive loop</b> (the loop would judge our turn\'s reply as its own), an optional precondition (repo on its default branch). Shown on the card; no history row.' },
  { t: 'Busy?', tag: 'reuse', d: 'The builder <b>run slot</b> (<code>RunSessionService.TryBeginRun</code>) is the only arbiter, shared with the human, the loops and the arch. Busy → <b>hold</b> in the scheduler and try again next tick — never queued or stashed in the agent, never pre-empted. With "skip when busy": a <b>skipped</b> run instead.' },
  { t: 'Send', tag: 'reuse', d: '<code>IAgentDirectory.SendToAgent</code> with actor <b>recurring</b>: locally <code>StartRepoTurn</code> (user bubble "🔁 recurring · CI health check", the dock\'s session, MCP config); for a peer the fleet posture checks, then <code>POST /api/arch/peer/send</code>. A refusal (unmanaged, unreachable, not accepting) is recorded as a <b>refused</b> run with the named reason.' },
  { t: 'Run ends', tag: 'reuse', d: 'Local: <code>RunSessionService.RunCompleted</code> — exactly once per turn, with the witnessed reply on the RunSession. Peer: the collected feed\'s <code>turn.ended</code> for that machine+repo, then <code>ReadTranscript</code>.' },
  { t: 'Outcome', tag: 'new', d: 'The reply\'s <b>final line</b> is parsed deterministically: <code>RUN OK:</code> / <code>RUN ATTENTION:</code> / <code>RUN FAILED:</code> + a one-line summary. No such line → <i>unreported</i>. An errored or Operator-stopped turn → failed. No model in the loop.' },
  { t: 'History', tag: 'new', d: 'The run record is completed in <code>recurring-runs.jsonl</code>; the card\'s strip gains a square; ATTENTION/FAILED badge the card and the tab; a <code>recurring.ended</code> event goes on the harness feed. <b>Three consecutive failed/refused runs pause the task.</b>' },
];
$('#flow').innerHTML = STEPS.map((s, i) => `<div class="step ${i === 0 ? 'is-on' : ''}" data-step="${i}"><span class="tag tag--${s.tag}">${s.tag === 'new' ? 'new' : 'reused'}</span><div class="n">${i + 1}</div><div class="t">${s.t}</div></div>`).join('');
const showStep = (i) => { $$('.step').forEach((x) => x.classList.toggle('is-on', +x.dataset.step === i)); $('#flow-detail').innerHTML = `<b>${i + 1} · ${STEPS[i].t}</b> <span class="tag tag--${STEPS[i].tag}" style="position:static">${STEPS[i].tag === 'new' ? 'new code' : 'existing machinery'}</span><p style="margin:6px 0 0">${STEPS[i].d}</p>`; };
$('#flow').addEventListener('click', (e) => { const s = e.target.closest('[data-step]'); if (s) showStep(+s.dataset.step); });
showStep(0);
$('#grid-demo').innerHTML = ['10:00', '12:00', '14:00', '16:00', '18:00'].map((t, i) => `<span class="${i === 1 ? 'late' : ''}">${t}</span>`).join('');

// ── view 3: reuse ──────────────────────────────────────────────────────────────────────
const REUSE = [
  ['IAgentDirectory.SendToAgent → SendTask / StartRepoTurn / FleetClient', 'The one send path: local and peer, provenance, audit, refusals. Gains an <code>actor</code> parameter.'],
  ['RunSessionService (run slot, RunCompleted, ReplyText)', 'Busy arbitration and "the run ended, here is what it said" — locally.'],
  ['Collector feed turn.ended + ReadTranscript', 'The same, for a peer\'s agent.'],
  ['AutopilotGate', 'The Operator\'s master fence for unattended sends; mutations answer 403 while closed.'],
  ['AutopilotService tick pattern · DockUnseenResultTrigger', 'Templates for the scheduler\'s hosted service and the run closer.'],
  ['DrivenLoop.FinalLineContains', 'Precedent for reading a contract token from the reply\'s final line only.'],
  ['GET /arch/fleet/status', 'The assignee picker: every repo agent on every machine, as the Kanban uses it.'],
  ['Kanban assignee chip · AgentStatusDot · ⧉ worker window · useTaskColors · StatusBadge', 'The card looks and behaves like a board card where it overlaps.'],
  ['PolicemanPanel history table + policemanLoop.js', 'The model for the run-history table and its pure, tested formatting module.'],
  ['ManageApp TABS / weights / labelOf / renderPane', 'Four small edits register the tab; order, hidden set and <code>?tab=recurring</code> come free.'],
];
$('#reuse-table').innerHTML = `<tr><th>existing piece</th><th>used for</th></tr>` + REUSE.map(([a, b]) => `<tr><td><code>${esc(a)}</code></td><td>${b}</td></tr>`).join('')
  + `<tr><td><b>new</b>: RecurringTaskStore · RecurringRunLog · RecurringScheduler · run closer · RecurringController · RecurringTab.jsx + recurringCards.js</td><td>The entity, the clock, the history, the API and the tab. The pure core (<code>Recurrence.cs</code>) is prototyped with tests on this branch.</td></tr>`;

// ── view 4: model ──────────────────────────────────────────────────────────────────────
$('#json-card').textContent = JSON.stringify({ id: '9f2c…', title: 'CI health check', sourceId: null, repoId: 'c7a98baf…', instructions: 'Look at the last 10 GitHub Actions runs on main…', schedule: { kind: 'interval', everyMinutes: 120 }, policy: { catchUp: true, skipWhenBusy: false, holdWhileLoopActive: true, requireDefaultBranch: false }, enabled: true, pausedReason: null, anchorAt: 1789800000000, lastHandledDueAt: 1789807200000, runCount: 41, createdBy: 'operator' }, null, 2)
  + '\n\n// or: "schedule": { "kind": "daily", "at": "07:00", "days": ["Monday", …] }';
$('#json-run').textContent = JSON.stringify({ id: 'r-…', taskId: '9f2c…', n: 42, dueAt: 1789814400000, missed: 0, trigger: 'schedule', status: 'done', sentAt: 1789814408000, endedAt: 1789814456211, durationMs: 48211, costUsd: 0.07, outcome: 'attention', summary: '2 of the last 10 runs on main failed (deploy.yml) — see run 8841', reason: null, sessionId: '…', machine: 'DESKTOP-POAPPP3', agent: 'birocode' }, null, 2)
  + '\n\n// status: running | done | error | stopped | skipped | refused\n// outcome: ok | attention | failed | unreported\n// trigger: schedule | catch-up | manual';
$('#envelope').textContent = `[Recurring task] CI health check
Recurring id: 9f2c… · run #42 · due 2026-09-19 14:00 · every 2 h · sent by the harness scheduler on DESKTOP-POAPPP3
Previous run: 2026-09-19 12:00 — OK: all 10 runs green

Look at the last 10 GitHub Actions runs on main (gh run list). If any failed, name the workflow and the failing step. Do not change anything.

This is an unattended, recurring run. Do what the instructions say and nothing else; if there is nothing to do, say so in one sentence. Do not push, merge or deploy unless the instructions explicitly say so. End your reply with ONE closing line, exactly one of:
"RUN OK: <one-line result>" · "RUN ATTENTION: <what the Operator should look at>" · "RUN FAILED: <why>".
The harness reads that line into this task's run history.`;

// ── view 5: ideas + questions ──────────────────────────────────────────────────────────
const IDEAS = [
  ['RUN ATTENTION as a first-class outcome', 'A recurring check mostly says "fine". The valuable run is the one that says "look at this" — it badges the card and the tab, so the tab is a to-look-at list, not a log.'],
  ['The run strip', 'Twenty squares per card, the way CI history reads: health at a glance without opening anything.'],
  ['"Previous run: …" in the envelope', 'Continuity across runs ("last time 3 behind, now 5") without the task owning a session or growing a private context.'],
  ['Coalesced catch-up', 'After a night off, each card runs once and says how many occurrences it covers — never a burst of replays.'],
  ['Self-pause on repeated failure', 'Three failed/refused runs in a row pause the task and flag it. A broken schedule cannot burn the plan every 15 minutes.'],
  ['Next step · plan-usage guard', 'Skip a run when the account\'s 5-hour window is above X % — the data is already on the fleet poll (By plan / accounts). Chores should not eat the plan.'],
  ['Next step · escalate to the board', 'On ATTENTION/FAILED, optionally create a Kanban card for the same agent. Recurring tasks detect; board cards track the fix.'],
  ['Next step · agents may propose', 'Arch / repo-agent tools to propose a recurring task — always created paused, the Operator enables it.'],
];
$('#ideas').innerHTML = IDEAS.map(([t, d]) => `<div class="box box--idea"><h4>${esc(t)}</h4><p>${esc(d)}</p></div>`).join('');
const QS = [
  ['Which conversation does a run land in?', 'Sending into the agent\'s own dock conversation is what "sent to that repo agent" says and is visible where you already look — but it puts recurring chatter into the working conversation and grows its context. A thread per task is clean and cheap, but needs the send path to run a session the dock tab does not follow.', ['the agent\'s own conversation', 'a dedicated thread per task'], 0],
  ['Agent busy at the scheduled time', 'Wait for it to be idle (run late), or drop this occurrence?', ['hold until idle', 'skip the occurrence', 'per card (proposed: both, default hold)'], 2],
  ['The agent has an active drive loop', 'A loop judges "the reply after my send"; an interleaved recurring turn would be judged as the loop\'s reply.', ['hold until the loop ends', 'skip', 'send anyway'], 0],
  ['Who owns a card assigned to a peer\'s agent?', 'Hub-owned: one store, one tab, fires only while the hub is up, goes over the fleet send. Assignee-owned: fires without the hub, but the tab must aggregate cards from every machine and each harness needs the feature.', ['the hub owns and sends over the fleet', 'the assignee\'s harness owns it'], 0],
  ['Claimed repos', 'SendToAgent overrides a "claimed" repo (one sitting on a branch nobody assigned). Should an unattended send respect the claim?', ['override (like the board\'s Ping)', 'per card: "only on the default branch"', 'always respect the claim'], 1],
  ['Schedules', 'Every N min/h/d and daily-at-HH:mm-on-weekdays are proposed. Needed beyond that?', ['these two are enough', 'also cron-style expressions'], 0],
  ['Who may create recurring tasks?', '', ['the Operator only (v1)', 'also arch / repo agents — created paused'], 0],
];
$('#questions').innerHTML = QS.map(([t, d, opts, def], i) => `<div class="q"><h4>${i + 1}. ${esc(t)}</h4>${d ? `<div class="dim">${esc(d)}</div>` : ''}<div class="optrow">${opts.map((o, j) => `<span class="opt ${j === def ? 'opt--default' : ''}">${j === def ? '✓ proposed: ' : ''}${esc(o)}</span>`).join('')}</div></div>`).join('');
