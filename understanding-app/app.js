/* Understanding app — research-informed-loops.
   Self-contained snapshot of docs/research/agent-loops/techniques.md +
   adoption-map.md (2026-08-04). The committed dossier is the source of truth;
   this app is the interactive companion (rolling-latest, overwritten by the
   next non-trivial explanation). */

const T = [
  // id, name, section, evidence, bucket, rank?, gist, sources[], verdict (cite/land/why)
  { id:'T01', name:'Minimal inner agent loop', sec:'Architecture', ev:'demonstrated', b:'have',
    gist:'LLM + tools + environment feedback in a loop; the harness just executes and echoes. Ball: ~300 lines of Go, three tools. Anthropic: gather context → act → verify → repeat.',
    src:['thorsten-ball','anthropic-building-effective-agents','anthropic-claude-agent-sdk'],
    v:'Delegated by design: the engine drives the Claude Code CLI, which IS the inner loop; our framework is deliberately the outer layer.' },
  { id:'T02', name:'Fresh-context outer loop over durable state', sec:'Architecture', ev:'demonstrated', b:'adopt', rank:2,
    gist:'Ralph: `while :; do cat PROMPT.md | claude; done` — fresh session every iteration, all state in files/git. Anthropic ran ~2,000 such sessions to build a C compiler.',
    src:['geoffrey-huntley','anthropic-building-c-compiler','anthropic-effective-harnesses-long-running-agents'],
    v:'Our loops resume a pinned session, so context accumulates — the opposite. Landing: a LOOP-WIDE per-arm toggle "fresh session each iteration" in the engine; re-orientation via the T21 progress ledger; dock toggle + convention doc.' },
  { id:'T03', name:'Outer work-queue harness decides completion', sec:'Architecture', ev:'demonstrated', b:'have',
    gist:'A harness above the agent loop holds a queue, runs attempts, and itself decides done/again — "the task stays alive beyond the point where the model would have said: I am done" (Ronacher).',
    src:['armin-ronacher','boris-cherny','anthropic-effective-harnesses-long-running-agents'],
    v:'The queue kind end-to-end: stash as work queue, consume-on-land, verify phases + reply ladder decide. Baseline: queue resume, "Activation resets phase state", queue binding requirements.' },
  { id:'T04', name:'Plan-then-build phase separation', sec:'Architecture', ev:'demonstrated', b:'adopt', rank:6,
    gist:'Two-mode loops: a planning prompt refreshing a prioritized plan, a building prompt executing the top item (Huntley); initializer vs coding agent (Anthropic); plan mode then one-shot (Cherny).',
    src:['geoffrey-huntley','anthropic-effective-harnesses-long-running-agents','boris-cherny','anthropic-claude-code-best-practices'],
    v:'Goal loops jump straight to WORKING_STATE. Landing: optional PLANNING_STATE ahead of WORKING_STATE producing/refreshing a plan file; the dock state-machine panel already has the section grammar.' },
  { id:'T05', name:'Orchestrator–workers fan-out', sec:'Architecture', ev:'demonstrated', b:'na',
    gist:'A lead agent spawns 3–5 parallel workers and synthesizes; Anthropic production: +90.2% over single-agent at ~15× tokens.',
    src:['anthropic-multi-agent-research-system','anthropic-building-effective-agents'],
    v:'Not applicable: in-turn subagents belong to the CLI; a harness-level LLM orchestrator contradicts one-driven-session-per-tab, and Ronacher’s mixed-write subagent failures caution against it. Human + dock is our orchestrator.' },
  { id:'T06', name:'Uncoordinated parallel agents, git task claiming', sec:'Architecture', ev:'demonstrated', b:'na',
    gist:'No orchestrator: parallel agents claim tasks via lock-file commits, merge each other, self-select "the next most obvious problem" (C-compiler run).',
    src:['anthropic-building-c-compiler'],
    v:'Not applicable: concurrent writers on one repo are out of scope — tabs are per-repo, and orphaned-run double-drive history is exactly why the XOR coordinator exists.' },
  { id:'T07', name:'Heartbeat tick, idle sentinel, defer-while-busy', sec:'Architecture', ev:'demonstrated', b:'have',
    gist:'Periodic "anything need attention?" turn; a bare HEARTBEAT_OK reply is suppressed; heartbeats defer while a run is active (Steinberger’s OpenClaw).',
    src:['peter-steinberger'],
    v:'Independent convergence on our design: engine tick guards + witnessed-reply freshness = defer-while-busy; the sentinel ladder (LOOP_DONE / NEEDS_HUMAN, final-line anchoring) lives in docs/loop-driven-agent-convention.md.' },
  { id:'T08', name:'A runnable check closes the loop', sec:'Verification', ev:'demonstrated', b:'adopt', rank:1,
    gist:'The loudest consensus (7 sources): give the loop a machine-checkable pass/fail and it closes on its own; the verifier must be near-perfect or the agent solves the wrong problem. Cherny: a real feedback loop "will 2-3x the quality".',
    src:['anthropic-claude-code-best-practices','boris-cherny','anthropic-building-c-compiler','geoffrey-huntley','simon-willison','armin-ronacher','anthropic-writing-tools-for-agents'],
    v:'Our VERIFICATION_STATE is agent-self-reported (sentinels). Landing: optional per-arm verify COMMAND on goal/queue loops — sentinel only counts if the check passes; failing output goes back into WORKING_STATE; dock param box + eval scenario where a lying sentinel is caught.' },
  { id:'T09', name:'Escalating stop-gates', sec:'Verification', ev:'recommended', b:'have',
    gist:'Grades of stop-gating: in-prompt iterate → /goal condition re-checked per turn → Stop hook blocking turn-end → fresh-context verifier.',
    src:['anthropic-claude-code-best-practices'],
    v:'Our ladder mirrors it: composed verify prompts per phase, sentinel-gated exits, deny fences, caps, NEEDS_HUMAN. Baseline: the state-machine parameter panel requirement (badges, transitions, terminal outcomes).' },
  { id:'T10', name:'Adversarial fresh-context / second-model review', sec:'Verification', ev:'demonstrated', b:'adopt', rank:4,
    gist:'A reviewer that didn’t produce the change grades it: fresh subagent seeing only diff + criteria (Anthropic); a different model entirely (Steinberger’s GPT-5/Gemini/Oracle steps).',
    src:['anthropic-claude-code-best-practices','peter-steinberger','boris-cherny'],
    v:'Our verify phase is graded by the session that did the work. Landing: optional second-opinion step reusing the CliPromptClassifier one-shot machinery — fresh CLI call sees diff + goal, returns confirm/refute; refute → escalate with reason; audit records the verdict.' },
  { id:'T11', name:'Evidence, not assertions', sec:'Verification', ev:'recommended', b:'adopt', rank:7,
    gist:'The agent shows the test output / command result / screenshot instead of claiming success — "works for sessions you weren’t watching".',
    src:['anthropic-claude-code-best-practices'],
    v:'Verify prompts don’t demand shown evidence and the audit records sends, not proof. Landing: verification templates require pasted check output ahead of the sentinel; briefing rule; sent-history keeps the evidence blob.' },
  { id:'T12', name:'Externalized done-ness ledger', sec:'Verification', ev:'demonstrated', b:'have',
    gist:'Done-ness lives in a machine-checkable artifact: JSON feature list with passes:false booleans flipped only after verification; fixes "premature victory declaration".',
    src:['anthropic-effective-harnesses-long-running-agents','geoffrey-huntley'],
    v:'The queue stash IS an on-disk work ledger the loop drains, with cumulative sent-history as the done record (queue-loop-visibility).' },
  { id:'T13', name:'Browser-level E2E self-verification', sec:'Verification', ev:'demonstrated', b:'have',
    gist:'Verify as a user would: Cherny’s Chrome-extension loop, Anthropic’s Puppeteer gate on passes:true, Steinberger’s single chrome-devtools MCP "to close the loop".',
    src:['boris-cherny','anthropic-effective-harnesses-long-running-agents','peter-steinberger','anthropic-claude-agent-sdk'],
    v:'Repo conventions mandate it already: docs/claude-web/browser-testing.md, docs/detached-verification-convention.md, System Tests + E2E eval console surfaces.' },
  { id:'T14', name:'Hard iteration caps + explicit stopping conditions', sec:'Verification', ev:'demonstrated', b:'have',
    gist:'Terminate on completion OR a hard cap; real loops also end at plan exhaustion or the model’s capability ceiling (honestly reported in the compiler run).',
    src:['anthropic-building-effective-agents','geoffrey-huntley','anthropic-building-c-compiler'],
    v:'Turn caps with terminal capped status are baseline; the loop-eval cap scenario tests them; LOOP-WIDE section exposes them.' },
  { id:'T15', name:'Human checkpoints, unchanged review bar', sec:'Verification', ev:'demonstrated', b:'have',
    gist:'Autonomy bracketed by humans: clear task in, blocker pauses during, human review out — "the same exact bar regardless of whether the code was written by the model" (Cherny, at 80–90% model-written).',
    src:['boris-cherny','anthropic-building-effective-agents','simon-willison'],
    v:'Suggest mode on every kind, NEEDS_HUMAN, operator gate, escalate statuses. Baseline: suggest-mode pending requirement + gate disclosure rules.' },
  { id:'T16', name:'Deterministic fences around the loop', sec:'Verification', ev:'demonstrated', b:'have',
    gist:'Non-LLM enforcement: git hooks running jscpd/knip/ast-grep (Steinberger), CI regression gates (compiler run), product hooks ("deterministic, unlike advisory CLAUDE.md").',
    src:['peter-steinberger','anthropic-building-c-compiler','anthropic-claude-code-best-practices'],
    v:'Word-boundary deny-lists (routine + reply), per-arm trims, operator gate, kill switch. Baseline: the three deny-list requirements.' },
  { id:'T17', name:'LLM-as-judge: rubric-scored, weakest gate', sec:'Verification', ev:'demonstrated', b:'have',
    gist:'A single rubric-scored judge call was Anthropic’s most consistent grader — and the SDK post still ranks model-judging LAST, behind rules-based and visual checks ("generally not very robust").',
    src:['anthropic-multi-agent-research-system','anthropic-claude-agent-sdk'],
    v:'The CLI-backed classifier judges routine matches behind the stub’s contract with fallback, and every verdict still passes threshold/deny/cap/gate fences — exactly the weakest-gate posture. Baseline: CLI classifier requirement.' },
  { id:'T18', name:'Reference-oracle fallback', sec:'Verification', ev:'demonstrated', b:'na',
    gist:'Mix a known-good reference (GCC) with the agent’s output so the loop can bisect blame and shrink the frontier gradually.',
    src:['anthropic-building-c-compiler'],
    v:'Not applicable: needs a domain with a reference implementation; general product repos have none.' },
  { id:'T19', name:'Context as a finite attention budget', sec:'Context', ev:'demonstrated', b:'na',
    gist:'"Context rot": curate the smallest high-signal token set. Huntley budgets ~30% for specs/plans; reports 200k advertised ≈ 147–152k practical.',
    src:['anthropic-effective-context-engineering','geoffrey-huntley','peter-steinberger'],
    v:'Not applicable at harness level: the window is the CLI’s to manage; our lever is keeping injections small — the briefing frame is compact by design.' },
  { id:'T20', name:'Compaction (summarize and reinitiate)', sec:'Context', ev:'demonstrated', b:'na',
    gist:'Near the limit, distill the conversation and restart with the summary (shipped in Claude Code / the SDK).',
    src:['anthropic-effective-context-engineering','anthropic-claude-agent-sdk'],
    v:'Not applicable: CLI-internal shipped mechanism.' },
  { id:'T21', name:'Progress files as cross-iteration memory', sec:'Context', ev:'demonstrated', b:'adopt', rank:3,
    gist:'Amnesiac iterations re-orient from disk: claude-progress.txt + git history, frequently-updated READMEs, IMPLEMENTATION_PLAN.md; read on entry, commit + update on exit.',
    src:['anthropic-effective-harnesses-long-running-agents','anthropic-building-c-compiler','geoffrey-huntley','anthropic-effective-context-engineering'],
    v:'Nothing asks our driven agents to keep durable progress state. Landing: progress-ledger contract in docs/loop-driven-agent-convention.md + a default briefing rule; engine optionally composes the ledger tail into the next prompt. Prerequisite for rank 2.' },
  { id:'T22', name:'Fresh-session reset over in-context correction', sec:'Context', ev:'demonstrated', b:'adopt', rank:5,
    gist:'Failed attempts poison the window: throw away and re-prompt (Cherny), two-strikes /clear rule (guide), delete-and-regenerate the stale plan (Huntley).',
    src:['boris-cherny','anthropic-claude-code-best-practices','geoffrey-huntley'],
    v:'On verify failure we re-propose into the same session, then escalate. Landing: after N failed verify cycles, a per-arm "reset iteration" — fresh session with step + distilled failure summary — before escalating. Pairs with rank 2 plumbing.' },
  { id:'T23', name:'Subagent fan-out for context isolation', sec:'Context', ev:'demonstrated', b:'na',
    gist:'Reads fan out to isolated subagents returning condensed summaries (Huntley: up to 500 for reads, exactly 1 for builds); Ronacher: write-capable subagents misbehaved.',
    src:['anthropic-effective-context-engineering','geoffrey-huntley','boris-cherny','armin-ronacher'],
    v:'Not applicable: CLI-internal (Task tool); the driven agent already has it.' },
  { id:'T24', name:'Persistent instruction file as institutional memory', sec:'Context', ev:'demonstrated', b:'have',
    gist:'CLAUDE.md/AGENTS.md reloaded every session: Cherny folds every observed mistake in; the guide says keep it lean; Steinberger runs ~800 lines — sources disagree on size, not mechanism.',
    src:['boris-cherny','anthropic-claude-code-best-practices','peter-steinberger','simon-willison'],
    v:'Repo CLAUDE.md + the operator-editable briefing rules injected into every loop send (loop-agent-briefing, shipped).' },
  { id:'T25', name:'Quiet tools that log details to files', sec:'Context', ev:'demonstrated', b:'have',
    gist:'Verifiers print a few lines and log the rest to a file the agent can read on demand; measured token savings from concise tool responses.',
    src:['anthropic-building-c-compiler','anthropic-writing-tools-for-agents','armin-ronacher'],
    v:'The detached-verification convention’s log-file + terminal-marker contract is this exact rule for long checks.' },
  { id:'T26', name:'Mid-loop reinforcement injection', sec:'Context', ev:'demonstrated', b:'have',
    gist:'The harness re-states objectives after tool calls, hints after failures, uses "echo tools" reflecting the agent’s own task list back (Ronacher’s production harness).',
    src:['armin-ronacher'],
    v:'The briefing frame composed at the send choke point re-states rules on every loop send; the FLAG: channel carries signals back.' },
  { id:'T27', name:'Just-in-time retrieval over pre-loading', sec:'Context', ev:'demonstrated', b:'na',
    gist:'Keep lightweight identifiers, load data at runtime via agentic search; pre-load only cheap always-needed files.',
    src:['anthropic-effective-context-engineering','anthropic-claude-agent-sdk'],
    v:'Not applicable: CLI-internal shipped behavior.' },
  { id:'T28', name:'Sandboxed full-permission (YOLO) execution', sec:'Autonomy', ev:'demonstrated', b:'na',
    gist:'Remove approval friction INSIDE containment: $5-capped Fly.io org (Willison), claude-yolo in Docker (Ronacher), skip-permissions + hourly backups (Steinberger).',
    src:['simon-willison','armin-ronacher','peter-steinberger','anthropic-building-effective-agents'],
    v:'Not applicable: permission mode / OS sandboxing are host decisions outside the Product; the harness’s containment is gate + deny + caps, which exist.' },
  { id:'T29', name:'Risk-scoped permissioning', sec:'Autonomy', ev:'demonstrated', b:'have',
    gist:'Between approve-everything and skip-everything: allowlists, auto-accept only for safely-verifiable loops (test iteration), classifier-gated auto mode.',
    src:['boris-cherny','anthropic-claude-code-best-practices'],
    v:'Threshold-gated drive sends, per-arm deny trims, suggest-vs-drive dial, operator gate. Baseline: threshold gating + per-arm deny requirements.' },
  { id:'T30', name:'Start small, then scale the automation', sec:'Autonomy', ev:'recommended', b:'have',
    gist:'Run the loop on one item, verify behavior, refine on the first 2–3 failures, then scale.',
    src:['boris-cherny','anthropic-claude-code-best-practices'],
    v:'Suggest mode is the ramp (watch what it WOULD send), and the queue arm preview shows binding + items before any send.' },
  { id:'T31', name:'Parallelism stratified by review cost / blast radius', sec:'Autonomy', ev:'demonstrated', b:'have',
    gist:'The human review bottleneck governs loop count: Willison parallelizes only low-review-cost tracks; Steinberger sizes by blast radius; Cherny runs 5 local + 5–10 cloud.',
    src:['simon-willison','peter-steinberger','boris-cherny'],
    v:'Multi-tab dock under one operator, XOR coordinator (one armed loop per agent), loop badges + binding disclosure keep each track legible; the stratification judgment stays human, as the sources practice.' },
  { id:'T32', name:'Fleet bookkeeping + phone-reachable monitoring', sec:'Autonomy', ev:'demonstrated', b:'have',
    gist:'Self-reported terminal titles, browser/phone terminals for checking long runs (VibeTunnel), phone-started morning sessions (Cherny).',
    src:['peter-steinberger','boris-cherny'],
    v:'Claude Web’s founding premise: phone dock, waiting badges, live loop decision readout, phase strip. Baseline: dock disclosure + live-state requirements.' },
  { id:'T33', name:'Message queueing + stall auto-continue', sec:'Autonomy', ev:'demonstrated', b:'have',
    gist:'Queue "continue" messages so long runs keep going; detect stalls and auto-continue (CodeLooper).',
    src:['peter-steinberger'],
    v:'The queue kind IS productized message queueing; the drive no-reply escape is engine-level stall detection.' },
  { id:'T34', name:'Durable execution: checkpoint, resume, retry', sec:'Autonomy', ev:'demonstrated', b:'have',
    gist:'Resume from where errors occurred instead of restarting; checkpoints make risk cheap; rainbow deployments keep in-flight agents alive.',
    src:['anthropic-multi-agent-research-system','anthropic-claude-code-best-practices'],
    v:'Detached backend-owned runs with reattach, loop resume preserving sent-history, operator-stop-is-not-error. Baseline: resume + stopped-not-errored requirements.' },
  { id:'T35', name:'Explicit effort-scaling rules', sec:'Autonomy', ev:'demonstrated', b:'na',
    gist:'Prompt-embedded sizing: simple fact-find = 1 agent / 3–10 calls; complex research = 10+ subagents.',
    src:['anthropic-multi-agent-research-system'],
    v:'Not applicable: sizing governs coordinator fan-out; our loops drive exactly one session — no fan-out decision exists.' },
  { id:'T36', name:'Self-improving prompts from failure transcripts', sec:'Autonomy', ev:'demonstrated', b:'adopt', rank:8,
    gist:'Feed the loop’s failure transcripts back to the model: prompt diagnosis, tool-description rewriting (40% task-time reduction).',
    src:['anthropic-multi-agent-research-system','anthropic-writing-tools-for-agents'],
    v:'We collect the raw material (audit trail, debug snapshot) but never feed it back. Landing: console "improve this loop" action → one-shot CLI over snapshot + audit rows → suggested prompt/briefing edits, operator-accepted, never auto-applied.' },
  { id:'T37', name:'Negative results: automation that didn’t stick', sec:'Autonomy', ev:'demonstrated', b:'na',
    gist:'Ronacher dropped slash commands, hooks, print mode, write-capable subagents; Steinberger dropped worktrees, calls MCPs "context poison"; one compiler agent pkill-ed its own loop.',
    src:['armin-ronacher','peter-steinberger','boris-cherny','anthropic-building-c-compiler'],
    v:'Not a feature — calibration evidence. It supports current choices: single driven session, conversational prompts over slash automation, MCP skepticism.' },
];

const BUCKET = {
  adopt: { label: '★ worth adopting', cls: 'badge--adopt' },
  have:  { label: '✓ already have', cls: 'badge--have' },
  na:    { label: '— not applicable', cls: 'badge--na' },
};

const state = { bucket: 'all', ev: 'all', q: '' };

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

function stats() {
  const c = { adopt: 0, have: 0, na: 0 };
  T.forEach((t) => c[t.b]++);
  document.getElementById('stats').append(
    el('span', 'stat', `<b>${T.length}</b> techniques`),
    el('span', 'stat', `<b>${c.have}</b> already have`),
    el('span', 'stat', `<b>${c.adopt}</b> worth adopting`),
    el('span', 'stat', `<b>${c.na}</b> not applicable`),
    el('span', 'stat', `<b>14</b> sources · all claims cited + retrieval-dated`),
  );
}

function filterBar(id, key, options) {
  const wrap = document.getElementById(id);
  options.forEach(([val, label]) => {
    const b = el('button', val === 'all' ? 'on' : '', label);
    b.onclick = () => {
      state[key] = val;
      [...wrap.children].forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      render();
    };
    wrap.append(b);
  });
}

function matches(t) {
  if (state.bucket !== 'all' && t.b !== state.bucket) return false;
  if (state.ev !== 'all' && t.ev !== state.ev) return false;
  if (state.q && !(t.id + t.name + t.gist + t.v).toLowerCase().includes(state.q)) return false;
  return true;
}

function badge(t) {
  const parts = [`<span class="badge ${BUCKET[t.b].cls}">${BUCKET[t.b].label}</span>`,
                 `<span class="badge badge--${t.ev}">${t.ev}</span>`];
  if (t.rank) parts.unshift(`<span class="badge badge--rank">rank ${t.rank}</span>`);
  return parts.join('');
}

function render() {
  const grid = document.getElementById('grid');
  grid.replaceChildren();
  T.filter(matches).forEach((t) => {
    const c = el('article', 'card');
    c.append(
      el('span', 'card__id', `${t.id} · ${t.sec}`),
      el('span', 'card__name', t.name),
      el('div', 'card__badges', badge(t)),
    );
    c.onclick = () => detail(t);
    grid.append(c);
  });
}

function ladder() {
  const ol = document.getElementById('ladder');
  T.filter((t) => t.b === 'adopt').sort((a, b) => a.rank - b.rank).forEach((t) => {
    const li = el('li', '', `<span class="t-name">${t.id} — ${t.name}</span> <span class="t-gap">· ${t.v.split('Landing:')[0].trim()}</span>`);
    li.onclick = () => detail(t);
    ol.append(li);
  });
}

function detail(t) {
  const box = document.getElementById('detail');
  const body = document.getElementById('detailBody');
  const vLabel = t.b === 'adopt' ? 'Gap + landing site' : t.b === 'have' ? 'Where we already have it' : 'Why not applicable';
  const vCls = t.b === 'adopt' ? 'land' : t.b === 'have' ? 'cite' : 'why';
  body.replaceChildren(
    el('span', 'card__id', `${t.id} · ${t.sec}`),
    el('h3', '', t.name),
    el('div', 'card__badges', badge(t)),
    el('p', '', t.gist),
    (() => { const s = el('div', 'sect'); s.append(el('h4', '', 'Sources (docs/research/agent-loops/sources/)'),
      (() => { const w = el('div', 'srcs'); t.src.forEach((x) => w.append(el('span', '', x + '.md'))); return w; })()); return s; })(),
    (() => { const s = el('div', 'sect'); s.append(el('h4', '', vLabel), el('div', vCls, t.v)); return s; })(),
  );
  box.hidden = false;
}

document.getElementById('detailClose').onclick = () => { document.getElementById('detail').hidden = true; };
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') document.getElementById('detail').hidden = true; });
document.getElementById('search').addEventListener('input', (e) => { state.q = e.target.value.toLowerCase(); render(); });

filterBar('bucketFilters', 'bucket', [['all', 'all buckets'], ['adopt', '★ worth adopting'], ['have', '✓ already have'], ['na', '— not applicable']]);
filterBar('evidenceFilters', 'ev', [['all', 'all evidence'], ['demonstrated', 'demonstrated'], ['recommended', 'recommended'], ['secondhand', 'secondhand']]);
stats();
ladder();
render();
