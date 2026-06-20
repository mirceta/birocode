// OpenSpec workflows — the jobs you'd actually do. Self-contained, no libs,
// relative URLs (served under /api/localview/<repo>/app/understanding/).
// Grounded in the real CLI surface (openspec --help, v1.4.1) + the OpenSpec
// model: specs = living baseline, changes = deltas, archive = the fold.

// step kinds → how you actually invoke it
//   cli  = a real openspec/git command → runs in the Console tab (✓)
//   hand = a file you author yourself (no command)            (✍)
//   tui  = a real command but terminal-only, won't embed      (⌨)
const KIND = {
  cli:  { kb: '✓', cls: 'cli',  label: 'Console' },
  hand: { kb: '✍', cls: 'hand', label: 'by hand' },
  tui:  { kb: '⌨', cls: 'tui',  label: 'terminal' },
};

const WORKFLOWS = [
  {
    id: 'setup', mode: 'write', name: 'Set up the tool', cadence: 'once per repo',
    goal: 'Get OpenSpec scaffolded into the repo and keep its instructions current.',
    steps: [
      { t: 'openspec init --tools claude', k: 'cli', d: 'scaffolds openspec/ + the /opsx commands and skills' },
      { t: 'openspec update', k: 'cli', d: 'refresh the instruction files after a CLI upgrade' },
    ],
  },
  {
    id: 'inspect', mode: 'read', name: 'Inspect the living truth', cadence: 'anytime',
    goal: 'Answer “what’s in flight?” and “what does it actually do today?” — all read-only.',
    steps: [
      { t: 'openspec list', k: 'cli', d: 'the changes currently in flight' },
      { t: 'openspec list --specs', k: 'cli', d: 'the living baseline — the capabilities as they stand today' },
      { t: 'openspec show <id>', k: 'cli', d: 'read one change or one spec in full' },
      { t: 'openspec status --change <id>', k: 'cli', d: 'artifact-completion status for a change' },
      { t: 'openspec view', k: 'tui', d: 'an interactive dashboard — terminal only, won’t embed in the web app' },
    ],
  },
  {
    id: 'change', mode: 'write', name: 'Make a change, end to end', cadence: 'every feature', spine: true,
    goal: 'Take a feature from idea to a delta the baseline absorbs. The spine — and where parallel changes live, each its own folder.',
    steps: [
      { t: 'propose', k: 'cli',  cmd: 'openspec new change &lt;name&gt;  ·  /opsx propose', d: 'scaffold changes/&lt;name&gt;/ — the command bookend at the start' },
      { t: 'specify', k: 'hand', cmd: 'delta specs — ADDED / MODIFIED / REMOVED', d: 'diff the change against the baseline, so review lands on what moves' },
      { t: 'pin “done”', k: 'hand', cmd: '#### Scenario: GIVEN / WHEN / THEN', d: 'acceptance criteria beside each requirement (the spec, not an auto-test)' },
      { t: 'design', k: 'hand', cmd: 'design.md + tasks.md', d: 'the approach, then the slices to build' },
      { t: 'gate', k: 'cli',  cmd: 'openspec validate --strict', d: 'structure must hold (SHALL form, ≥1 scenario) before any code' },
      { t: 'implement', k: 'hand', cmd: 'tick tasks.md', d: 'as each slice lands — this is the Control tab’s checklist' },
      { t: 'ship', k: 'cli',  cmd: 'openspec archive &lt;name&gt;', d: 'folds the delta into the baseline so the spec reflects reality' },
    ],
  },
  {
    id: 'backfill', mode: 'write', name: 'Backfill the baseline', cadence: 'one-time migration',
    goal: 'Seed openspec/specs/ from the system that already exists — the Phase-1 lift.',
    steps: [
      { t: 'bucket the system into capabilities', k: 'hand', d: '~110 plans + docs → chat / files / git / preview / deploy …' },
      { t: 'author openspec/specs/<cap>/spec.md', k: 'hand', d: 'Purpose + SHALL/MUST requirements, each with ≥1 scenario' },
      { t: 'openspec validate --strict', k: 'cli', d: 'run until the whole baseline is clean' },
    ],
  },
  {
    id: 'handoff', mode: 'read', name: 'Hand off to an agent or teammate', cadence: 'as needed',
    goal: 'Give a readable brief instead of the codebase.',
    steps: [
      { t: 'hand over specs/ grouped by capability', k: 'hand', d: 'an agent-readable baseline OpenSpec is purpose-built to produce' },
    ],
  },
];

// ── Render ────────────────────────────────────────────────────────
const flowsEl = document.getElementById('flows');
function tally(w) {
  const c = w.steps.filter((s) => s.k === 'cli').length;
  return `${c}/${w.steps.length} run as commands`;
}
flowsEl.innerHTML = WORKFLOWS.map((w, i) => {
  const steps = w.steps.map((s) => {
    const k = KIND[s.k];
    return `<li class="step step--${k.cls}">
      <span class="step__kb kb kb--${k.cls}" title="${k.label}">${k.kb}</span>
      <div class="step__body">
        <code class="step__t">${s.cmd || s.t}</code>
        ${s.cmd ? `<span class="step__name">${s.t}</span>` : ''}
        <span class="step__d">${s.d}</span>
      </div>
    </li>`;
  }).join('');
  return `<article class="flow flow--${w.mode} ${w.spine ? 'flow--spine' : ''} ${i === 0 ? 'open' : ''}" data-mode="${w.mode}">
    <button class="flow__head" aria-expanded="${i === 0}">
      <span class="flow__num">${i + 1}</span>
      <span class="flow__title">
        <b>${w.name}</b>
        <span class="flow__goal">${w.goal}</span>
      </span>
      <span class="flow__meta">
        <span class="chip chip--${w.mode}">${w.mode === 'read' ? 'READ' : 'WRITE'}</span>
        <span class="chip chip--cadence">${w.cadence}</span>
        <span class="chip chip--tally">${tally(w)}</span>
      </span>
      <span class="flow__caret">▾</span>
    </button>
    <ol class="flow__steps">${steps}</ol>
  </article>`;
}).join('');

// ── Expand / collapse ─────────────────────────────────────────────
flowsEl.addEventListener('click', (e) => {
  const head = e.target.closest('.flow__head');
  if (!head) return;
  const flow = head.closest('.flow');
  const open = flow.classList.toggle('open');
  head.setAttribute('aria-expanded', String(open));
});

// ── Mode filter ───────────────────────────────────────────────────
const filters = document.getElementById('filters');
filters.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const mode = btn.dataset.mode;
  filters.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn));
  document.querySelectorAll('.flow').forEach((f) => {
    f.classList.toggle('dim', mode !== 'all' && f.dataset.mode !== mode);
  });
});
