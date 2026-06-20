// Should the Console be organized by workflow? Self-contained, no libs,
// relative URLs (served under /api/localview/<repo>/app/understanding/).
// A toggle shows the SAME commands two ways: a flat palette (today) vs
// grouped under the five workflows (proposed), with by-hand steps kept
// as muted context so the sequence reads.

// ── The flat Console as it stands today (the 9 runnable rows) ──────
const FLAT = [
  'openspec --version', 'openspec list', 'openspec validate',
  'openspec validate --strict', 'git status', 'openspec propose <name>',
  'openspec show <id>', 'openspec archive <name>', 'openspec init --tools claude',
];

// ── The five workflows (steps tagged by how you invoke them) ───────
//   run  = a real command → a button in the Console
//   hand = you author this file (muted context row, no button)
//   tui  = terminal-only (muted, not runnable in the web app)
const FLOWS = [
  { name: 'Set up the tool', mode: 'write', steps: [
    { t: 'openspec init --tools claude', k: 'run' },
    { t: 'openspec update', k: 'run' },
  ] },
  { name: 'Inspect the living truth', mode: 'read', steps: [
    { t: 'openspec list', k: 'run' },
    { t: 'openspec list --specs', k: 'run' },
    { t: 'openspec show <id>', k: 'run' },
    { t: 'openspec status --change <id>', k: 'run' },
    { t: 'openspec view  (dashboard)', k: 'tui' },
  ] },
  { name: 'Make a change, end to end', mode: 'write', spine: true, steps: [
    { t: 'openspec new change <name>', k: 'run', tag: 'propose' },
    { t: 'write delta specs — ADDED / MODIFIED / REMOVED', k: 'hand', tag: 'specify' },
    { t: 'write #### Scenario: GIVEN / WHEN / THEN', k: 'hand', tag: 'pin “done”' },
    { t: 'write design.md + tasks.md', k: 'hand', tag: 'design' },
    { t: 'openspec validate --strict', k: 'run', tag: 'gate', shared: true },
    { t: 'tick tasks.md', k: 'hand', tag: 'implement' },
    { t: 'openspec archive <name>', k: 'run', tag: 'ship' },
  ] },
  { name: 'Backfill the baseline', mode: 'write', steps: [
    { t: 'bucket the system into capabilities', k: 'hand' },
    { t: 'author openspec/specs/<cap>/spec.md', k: 'hand' },
    { t: 'openspec validate --strict', k: 'run', shared: true },
  ] },
  { name: 'Hand off to an agent', mode: 'read', steps: [
    { t: 'hand over specs/ grouped by capability', k: 'hand' },
  ] },
];

const KIND = {
  run:  { kb: '✓', cls: 'run',  note: 'a button — runs for real' },
  hand: { kb: '✍', cls: 'hand', note: 'you write this (no button)' },
  tui:  { kb: '⌨', cls: 'tui',  note: 'terminal only' },
};

const CAPTIONS = {
  flat: 'Today: one list, alphabet-soup of verbs. Quick for an expert — but it never says <b>when</b>, and the four hand-authored steps of a change aren’t here at all, so the rhythm is invisible.',
  flow: 'Proposed: the same commands, in the order you’d run them. Buttons appear only where a command makes sense; the <span class="ik hand">✍ by-hand</span> steps stay as muted context so the <b>propose → write → gate → implement → ship</b> rhythm is finally legible.',
};

const PAIRS = [
  { d: 'Adopt', dsub: 'before / after, per ritual', e: 'Console', esub: 'run that ritual', live: true },
  { d: 'Workflows', dsub: 'the jobs, as a map', e: 'Console', esub: 'run those jobs in order', live: false },
];

const COSTS = [
  { t: 'Redundancy with the Workflows tab', d: 'They’ll look alike. Fine if the line stays crisp — <b>read the job</b> on Workflows, <b>run the job</b> on Console — but blur it and you’ll ask why there are two.', kind: 'watch' },
  { t: 'The “system you know” column goes', d: 'The old→new anchor (<code>plan.md → Recently-shipped</code>) competes with workflow grouping for space. Let <b>Adopt</b> keep owning that anchor; keep the Console lean.', kind: 'real' },
  { t: 'Shared commands repeat', d: '<code>validate --strict</code> shows under both <i>Make a change</i> and <i>Backfill</i>. A flat list dedups; a workflow list repeats — but in context that’s a feature, not noise.', kind: 'soft' },
];

// ── Render the stage (flat or flow) ───────────────────────────────
const stage = document.getElementById('stage');
const caption = document.getElementById('caption');

function renderFlat() {
  stage.className = 'stage stage--flat';
  stage.innerHTML = `
    <div class="palette">
      <div class="palette__hd">Console · one flat list</div>
      <ul class="palette__list">
        ${FLAT.map((c) => `<li><span class="kb kb--run">✓</span><code>${esc(c)}</code></li>`).join('')}
      </ul>
    </div>`;
}

function renderFlow() {
  stage.className = 'stage stage--flow';
  stage.innerHTML = FLOWS.map((w) => {
    const runs = w.steps.filter((s) => s.k === 'run').length;
    const steps = w.steps.map((s) => {
      const k = KIND[s.k];
      const btn = s.k === 'run'
        ? '<span class="runpill">Run ▸</span>'
        : `<span class="ctxpill ctxpill--${k.cls}">${s.k === 'tui' ? 'terminal' : 'by hand'}</span>`;
      return `<li class="st st--${k.cls}">
        <span class="kb kb--${k.cls}" title="${k.note}">${k.kb}</span>
        <code class="st__t">${esc(s.t)}</code>
        ${s.tag ? `<span class="st__tag">${s.tag}</span>` : ''}
        ${s.shared ? '<span class="st__shared" title="also appears in another workflow">shared</span>' : ''}
        ${btn}
      </li>`;
    }).join('');
    return `<article class="grp grp--${w.mode} ${w.spine ? 'grp--spine' : ''}">
      <div class="grp__hd">
        <b>${w.name}</b>
        <span class="grp__mode grp__mode--${w.mode}">${w.mode === 'read' ? 'READ' : 'WRITE'}</span>
        <span class="grp__tally">${runs} button${runs === 1 ? '' : 's'} · ${w.steps.length} step${w.steps.length === 1 ? '' : 's'}</span>
      </div>
      <ol class="grp__steps">${steps}</ol>
    </article>`;
  }).join('');
}

function setMode(mode) {
  caption.innerHTML = CAPTIONS[mode];
  if (mode === 'flat') renderFlat(); else renderFlow();
  document.querySelectorAll('#seg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
}

document.getElementById('seg').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setMode(b.dataset.mode);
});

// ── Static panels ─────────────────────────────────────────────────
document.getElementById('pair').innerHTML = PAIRS.map((p) => `
  <div class="pr ${p.live ? 'pr--live' : 'pr--new'}">
    <div class="pr__side pr__side--d"><span class="pr__role">describes</span><b>${p.d}</b><span>${p.dsub}</span></div>
    <span class="pr__arrow">→</span>
    <div class="pr__side pr__side--e"><span class="pr__role">executes</span><b>${p.e}</b><span>${p.esub}</span></div>
    <span class="pr__badge">${p.live ? 'already true' : 'this change'}</span>
  </div>`).join('');

document.getElementById('costs').innerHTML = COSTS.map((c) => `
  <div class="cost cost--${c.kind}">
    <span class="cost__dot"></span>
    <div><b>${c.t}</b><span>${c.d}</span></div>
  </div>`).join('');

function esc(s) { return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// initial
setMode('flat');
