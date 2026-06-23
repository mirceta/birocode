// OpenSpec Port — Control Room. Self-contained, no libs, relative URLs
// (served under /api/localview/<repo>/app/<appId>/). Five pillars:
//   Explain (spine), Analyze (scored comparison), Adopt (day-to-day before/after),
//   Decide (the four open decisions), Control (localStorage phase/task tracker).
// Content sourced from plans/openspec-flow.md (DECIDED Path A + 2026-06-19 scope refinement).

const LS_KEY = 'openspec-port-control-v1';

// ── Data: the five phases + their tasks ──────────────────────────
const PHASES = [
  {
    n: 0, title: 'Init & foundation', sub: '½ day · reversible', danger: false,
    tasks: [
      'Pin the CLI — @fission-ai/openspec v1.4.1 (lean: repo devDependency so the version travels)',
      'Run `openspec init --tools claude` at the repo root (scaffolds openspec/ + .claude/commands/opsx/* + .claude/skills/openspec-*)',
      'Reconcile .claude/ — verify no collision with the committed defined-terms skill',
      'Commit the openspec/ tree (it is the new source of truth, not gitignored)',
      'Update CLAUDE.md to point planning at the /opsx flow (so docs match practice)',
    ],
    exit: '`openspec list` / `openspec validate` run clean on the empty scaffold.',
  },
  {
    n: 1, title: 'Backfill the living baseline', sub: '2–4 days · the big lift', danger: false,
    tasks: [
      'Map ~110 plans/* + CLAUDE.md + docs/ into capability buckets (chat, files, git, local-app-preview, deploy, …)',
      'Author openspec/specs/<cap>/spec.md — Purpose + SHALL/MUST requirements, each with ≥1 #### scenario',
      'Source of truth = the running app + Recently-shipped, not aspirational plans',
      'Run `openspec validate --strict` until clean',
      'Multi-agent sweep: one agent per capability bucket → one validated spec.md',
    ],
    exit: 'Every bucket has a strict-valid spec.md; the baseline answers "what does Claude Web do today?"',
  },
  {
    n: 2, title: 'Adopt the change lifecycle', sub: '1 day + ongoing', danger: false,
    tasks: [
      'New-feature flow runs through /opsx (proposal ≈ understanding, design ≈ plan, tasks ≈ slices, deltas = net-new)',
      'Patch the deploy / "keep it" ritual to run `openspec archive` as definition of done',
      'Handle the calibration gotcha — archive doesn\'t gate on tasks and seeds a literal Purpose: TBD to fill in',
    ],
    exit: 'A new feature can go propose → implement → archive via /opsx, and the baseline updates on ship.',
  },
  {
    n: 3, title: 'Harness rendering', sub: '2–3 days · essential, not optional', danger: false,
    tasks: [
      'A Plan-tab / doc-viewer surface rendering openspec/specs/ + active openspec/changes/',
      'Show change status (proposed / in-progress / archived), like plan.md shows Active vs Recently-shipped',
      'Wire to ClaudeWeb.App (a controller exposing the openspec/ tree) + a client tab, per plans/INTEGRATION.md',
    ],
    exit: 'Baseline + live changes render in the harness — planning is visible on the phone again.',
  },
  {
    n: 4, title: 'Migrate / retire the old convention', sub: '1 day · point of no return', danger: true,
    tasks: [
      'Decide the fate of plans/* (lean: freeze in place — cheap, preserves history)',
      'Mark spec-baseline.md superseded (understanding.md retired 2026-06-20 — proposal.md owns intent)',
      'Update CLAUDE.md, docs/understanding-app-convention.md, and plan.md\'s dashboard to make OpenSpec canonical',
    ],
    exit: 'OpenSpec is the canonical convention; the old one is frozen or folded. Irreversible.',
  },
];

// ── Data: the four open decisions (the fork on each, from plans/openspec-flow.md) ──
const DECISIONS = [
  { id: 'd1', q: '1 · Dual-write, or hard cut?', init: 'lean',
    lean: 'dual-write — keep plans/* alive through Phases 1–3, retire at Phase 4',
    opts: [
      { k: 'A', favored: true, t: '<b>Dual-write</b> — keep <code>plans/*</code> alive in parallel through Phases 1–3, retire only at Phase 4. Safe, reversible.' },
      { k: 'B', t: '<b>Hard cut</b> — stop using <code>plans/*</code> now. Faster, but no fallback if the port stalls mid-way.' },
    ] },
  { id: 'd2', q: '2 · Harness rendering — now or later?', init: 'settled',
    lean: 'settled: it happens (harness is kept). Open knob is only sequencing',
    opts: [
      { k: 'A', favored: true, t: '<b>Start now</b> — plan in OpenSpec via Phases 0–2 and tolerate planning being dark in the harness until Phase 3 ships.' },
      { k: 'B', t: '<b>Hold the switch</b> — keep planning in plans/* until Phase 3 (the renderer) lands, then flip. <i>Whether</i> rendering happens is settled (the harness is kept); only timing is open.' },
    ] },
  { id: 'd3', q: '3 · How deep is the backfill?', init: 'lean',
    lean: 'seed the shipped surface, grow it as features change it',
    opts: [
      { k: 'A', t: '<b>Full sweep</b> — map all ~110 plans into a complete baseline up front. Exhaustive, but a multi-day lift that risks documenting drift.' },
      { k: 'B', favored: true, t: '<b>Seed &amp; grow</b> — seed only the currently-shipped surface, then grow the baseline as features change it. Cheaper, stays truthful.' },
    ] },
  { id: 'd4', q: '4 · Where does the CLI live?', init: 'lean',
    lean: 'pin as a repo devDependency (travels with the repo)',
    opts: [
      { k: 'A', favored: true, t: '<b>Repo devDependency</b> — pin the version so it travels with the repo and every clone gets the same CLI.' },
      { k: 'B', t: '<b>Global install</b> — rely on the install already on this box. Zero setup, but version drift across machines.' },
    ] },
];

// ── Data: the comparison, scored ★/5 from OUR point of view ──────
const ROWS = [
  { dim: 'Primary job', us: 4, os: 4, why: 'We capture <b>intent</b>; OpenSpec maintains <b>current-state truth</b>. Different jobs, each done well.' },
  { dim: 'A living "what does it do today?"', us: 1, os: 5, why: 'Our behaviour lives only in code + changelog; OpenSpec keeps a queryable baseline. <b>The one flat gap.</b>' },
  { dim: 'Change expressed as a delta', us: 2, os: 5, why: 'Our plans re-describe the whole feature; OpenSpec diffs ADDED/MODIFIED/REMOVED against a baseline.' },
  { dim: 'Review before code', us: 4, os: 5, why: 'We review intent before code via chat + the Understanding app; OpenSpec formalizes that into <code>proposal.md</code> and can gate it.' },
  { dim: 'Rigor / verifiability', us: 2, os: 5, why: 'Free prose vs SHALL/MUST + mandatory scenarios + <code>validate --strict</code>.' },
  { dim: 'After ship', us: 3, os: 5, why: 'We freeze the plan; OpenSpec <code>archive</code> folds the delta into the baseline. The fold is what we lack.' },
  { dim: 'Single source of truth', us: 5, os: 2, why: 'One store, rendered live by the harness vs a separate tree the harness can\'t see until Phase 3.' },
  { dim: 'Phone / harness visibility', us: 5, os: 1, why: 'Everything renders live on the phone vs invisible until we write a renderer.' },
];

// ── Data: Adopt — the same ritual, today vs after OpenSpec ───────
// ── Data: Adopt — the honest ledger (closing net assessment) ─────
// Deliberately not "we lose nothing": the Phase-3 gap is a real,
// if temporary, regression. Keep both columns truthful.
const LEDGER = {
  gains: [
    'A <b>living baseline</b> that can’t drift — <code>archive</code> folds every delta back in',
    'Review a change as a <b>diff</b>, not a from-scratch re-description',
    'A <b>machine-checked gate</b> — <code>validate --strict</code>, wireable into CI',
    '<b>Parallel changes</b> in isolated folders, no contended plan file',
    'Acceptance criteria (<code>#### Scenario</code>) <b>beside</b> each requirement',
    '<b>Agent-readable</b> capability specs — hand over the brief, not the codebase',
  ],
  costs: [
    { t: 'Phone-blind until <b>Phase 3</b>', d: 'the harness can’t render <code>openspec/</code> yet — the one genuine regression, and why Phase 3 isn’t optional.', kind: 'real' },
    { t: 'More ceremony per change', d: 'four files (proposal · design · tasks · deltas) vs one plan — overkill for a one-line tweak, where you’d skip OpenSpec.', kind: 'soft' },
    { t: 'A one-time migration', d: 'backfilling <code>specs/</code> from ~110 plans is real work — a multi-agent sweep, not free.', kind: 'soft' },
    { t: 'The gap only half-closes', d: '<code>validate</code> checks <i>shape</i>, not correctness; scenarios are specs you still turn into tests.', kind: 'soft' },
  ],
  verdict: 'Nothing you do today becomes impossible — so it’s not "lose nothing, gain a lot" so much as <b>gain a lot, lose little, on a timer</b>: the only true loss is temporary, and Phase 3 closes it.',
};

// ── Data: Adopt — one table, before/after + is-it-net-new ────────
// Folds the old "new powers" cards in here so nothing is said twice.
// cap: 'new'  = a capability you simply can't do today (the TODAY
//               cell leads with "Can't do today").
// cap: 'same' = the same capability, just relocated/reshaped.
const FLOW = [
  { task: 'Kick off a new feature', cap: 'same', port: 'propose',
    old: 'Tell Claude; it confirms intent in chat and (for non-trivial work) builds an Understanding app to visualize it. <i>(<code>understanding.md</code> was retired 2026-06-20.)</i>',
    now: 'Run <code>/opsx propose &lt;name&gt;</code> — scaffolds <code>openspec/changes/&lt;name&gt;/</code> with a <code>proposal.md</code> (the restate-intent role).' },
  { task: 'Spell out the change as a <i>diff</i>', cap: 'new', port: null,
    old: 'Prose in <code>plans/&lt;feature&gt;.md</code> re-describing the <i>whole</i> feature from scratch — the part actually changing is buried.',
    now: '<b>Delta specs</b> — ADDED / MODIFIED / REMOVED, diffed against the baseline, so review (and your eyes) land on exactly what moves.' },
  { task: 'Pin down "done" per requirement', cap: 'new', port: null,
    old: '"Done" is a judgment call — criteria live in your head or scattered across a thread.',
    now: 'Each requirement carries its own <code>#### Scenario: GIVEN / WHEN / THEN</code>. <i>(Honest: it\'s the spec, not an auto-run test — you still wire one up.)</i>' },
  { task: 'Describe the approach & steps', cap: 'same', port: null,
    old: 'The same plan file — free-form, with a status header.',
    now: '<code>design.md</code> for the approach + <code>tasks.md</code> for the slices.' },
  { task: 'Gate work before any code', cap: 'new', port: 'validate --strict',
    old: 'Confirm intent in chat, skim the plan. Loose, no shape check — an under-specified plan sails straight through to code.',
    now: '<code>openspec validate --strict</code> enforces structure (SHALL form, ≥1 scenario each) and can gate the start — wire it into CI.' },
  { task: 'Track build progress', cap: 'same', port: null,
    old: 'Checkboxes in the plan markdown (or this Control Room).',
    now: 'Tick items in <code>tasks.md</code> as each slice lands.' },
  { task: 'Run several changes at once', cap: 'new', port: null,
    old: 'One growing plan file (Active vs. Recently-shipped) is a single contended doc — parallel features step on each other.',
    now: 'Each change is its own folder — <code>changes/add-x/</code> · <code>changes/add-y/</code> — that validates and archives on its own clock.' },
  { task: 'Ask "what does it do <i>today</i>?"', cap: 'new', port: 'list / show',
    old: 'No living doc — read the code, scan ~110 forward-looking <code>plans/*</code> that quietly drift from reality.',
    now: '<code>openspec list</code> / <code>openspec/specs/&lt;cap&gt;/spec.md</code> — a living baseline, kept true because archiving folds each delta in.' },
  { task: 'Onboard a fresh agent or teammate', cap: 'new', port: null,
    old: 'Means reverse-engineering the code and doing plan archaeology — no canonical brief to hand over.',
    now: 'Hand them <code>specs/</code> grouped by capability — an agent-readable baseline OpenSpec is purpose-built to produce.' },
  { task: 'Finish & ship', cap: 'new', port: 'archive',
    old: 'Move the plan to "Recently-shipped"; git keeps the diff; the plan freezes and drifts.',
    now: '<code>openspec archive &lt;change&gt;</code> — <b>folds the delta into the baseline</b>, so the spec reflects reality. Becomes the deploy ritual\'s definition of done.' },
  { task: 'Read planning on your phone', cap: 'same', port: null,
    old: 'Everything renders live in the harness — Files tab (plan.md) + the Understanding app.',
    now: 'Same place — <b>Phase 3</b> adds a renderer for <code>openspec/specs/</code> + active <code>openspec/changes/</code>.' },
];

// ── Data: Our system — what it is and where it physically lives ──
// The honest answer to "aren't we just vibe coding?": no — there's a
// real convention-driven layer, but it's unbundled across files and
// the only thing enforcing it is habit + the CLAUDE.md prompt.
const SYSTEM = [
  { layer: 'The rules', sub: 'where the convention is defined',
    lives: 'CLAUDE.md · docs/*-convention.md',
    what: 'The conventions themselves, written down. <code>CLAUDE.md</code> is injected into <i>every</i> session as system prompt; the <code>docs/</code> files are the agent-agnostic source of truth any agent on this box reads off disk.',
    kind: 'real' },
  { layer: 'The artifacts', sub: 'where one feature\'s planning sits',
    lives: 'plan.md · plans/&lt;feature&gt;.md (~110) · understanding-app/',
    what: 'The files a single feature lives in: the ephemeral working plan (<code>plan.md</code>), the durable design record with a status header (<code>plans/&lt;feature&gt;.md</code>), and the SPA explanation (<code>understanding-app/</code>). <i>(<code>understanding.md</code> + its panel were retired 2026-06-20 — <code>proposal.md</code> will own restate-intent once OpenSpec lands.)</i>',
    kind: 'real' },
  { layer: 'The renderer', sub: 'what makes it visible on your phone',
    lives: 'the Claude Web harness — Files tab (plan.md pinned) · doc viewer · Understanding app (Local tab)',
    what: 'The harness reads those files live and shows them on the phone. This is the integration that makes the convention worth keeping — and the exact thing OpenSpec has none of until Phase 3.',
    kind: 'real' },
  { layer: 'The enforcement', sub: 'the honest gap — this is the "vibe" part',
    lives: 'habit + prompt — nothing mechanical',
    what: 'No CLI, no schema, no <code>validate</code>, no gate. I follow <code>CLAUDE.md</code> because it\'s re-injected each session, not because anything checks the result. Policy by habit, not by machinery — exactly what OpenSpec\'s <code>validate</code> + <code>archive</code> bolt on.',
    kind: 'gap' },
];

// ── Data: CLAUDE.md — which conventions OpenSpec actually touches ─
// Be specific: adoption hits the *planning-convention* conventions
// only. impact ∈ replace | add | expand | done. `plan` flags whether
// it's stated in plans/openspec-flow.md or an inferred consequence.
const CMODS = [
  { sec: 'The plan convention', loc: 'Docs § — "plans/&lt;feature&gt;.md, one per feature, with a status header"',
    impact: 'replace', when: 'Phase 2 → 4', plan: 'explicit',
    detail: 'The core hit. New features move to <code>openspec/changes/&lt;id&gt;/</code> (proposal · design · tasks + delta specs); this pointer is repointed at the <code>/opsx</code> flow and <code>plans/*</code> is frozen as historical.' },
  { sec: 'New "plan via OpenSpec" section', loc: 'added to CLAUDE.md',
    impact: 'add', when: 'Phase 2', plan: 'explicit',
    detail: 'CLAUDE.md gains a section telling agents to <b>propose → specify → design → implement → archive</b> instead of writing a <code>plans/&lt;feature&gt;.md</code>. The plan: "point new work at the <code>/opsx</code> flow."' },
  { sec: '"Warn before violating conventions"', loc: 'the ⚠️ most-important rule',
    impact: 'expand', when: 'Phase 2+', plan: 'inferred',
    detail: 'Its definition of "a convention" — today <i>this file + docs + <code>plans/*.md</code></i> — widens to include <code>openspec/specs/</code> (the baseline) and active <code>changes/</code>, since those become the source of truth. Contradicting a spec becomes a violation to flag.' },
  { sec: 'Glossary', loc: 'the canonical-terms table',
    impact: 'expand', when: 'Phase 0–1', plan: 'inferred',
    detail: 'New shared vocabulary joins it: <b>baseline / spec</b>, <b>change</b>, <b>delta</b> (ADDED / MODIFIED / REMOVED), <b>proposal / design / tasks</b>, <b>archive</b> (the fold), <b>capability</b>.' },
  { sec: 'Understanding panel', loc: 'former "write your understanding first" §',
    impact: 'done', when: 'done 2026-06-20', plan: 'explicit',
    detail: 'Already removed this session — <code>understanding.md</code> retired; <code>proposal.md</code> will own restate-intent once OpenSpec lands.' },
];
// Conventions OpenSpec leaves completely alone — stated so the blast radius is clear.
const CUNTOUCHED = [
  'Understanding <b>app</b> (the SPA companion) — independent of the planning layer, stays verbatim',
  'UI modes (Simple / Advanced) — the future OpenSpec viewer just <i>follows</i> it (defaults to Advanced)',
  'Local-exposure + networking conventions',
  'Build / run, Previewing, and self-dev guides',
  'INTEGRATION.md module conventions — Phase 3 <i>follows</i> them to add the viewer',
];

// ── State (localStorage) ─────────────────────────────────────────
function loadState() {
  try { return JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { return {}; }
}
function saveState(s) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { /* private mode */ }
}
let state = loadState();
if (!state.tasks) state.tasks = {};            // "p<phase>-<idx>" -> true
if (!state.decisions) {                         // id -> 'open' | 'lean' | 'settled'
  state.decisions = {};
  DECISIONS.forEach((d) => { state.decisions[d.id] = d.init; });
}

// ── 1) View switcher ─────────────────────────────────────────────
const nav = document.getElementById('nav');
nav.addEventListener('click', (e) => {
  const btn = e.target.closest('.nav__btn');
  if (!btn) return;
  showView(btn.dataset.view);
});
function showView(view, sub) {
  nav.querySelectorAll('.nav__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.id === `view-${view}`));
  if (sub) activateSub(view, sub);              // also open a sub-tab within the cluster
  if (view === 'cockpit') loadCockpit();        // lazy: fetch state on first open
}

// ── 1a) Sub-view switcher — each cluster (Understand · Port · Operate) ───
// owns its own .subnav strip; toggling is scoped to that cluster's .view so
// the strips don't fight over the shared .subview class.
function activateSub(view, sub) {
  const root = document.getElementById(`view-${view}`);
  if (!root) return;
  root.querySelectorAll('.subnav__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.sub === sub));
  root.querySelectorAll('.subview').forEach((v) => v.classList.toggle('is-active', v.id === `subview-${sub}`));
}
document.querySelectorAll('.subnav').forEach((strip) => {
  strip.addEventListener('click', (e) => {
    const btn = e.target.closest('.subnav__btn');
    if (!btn) return;
    activateSub(strip.closest('.view').id.replace('view-', ''), btn.dataset.sub);
  });
});

// ── 2) Explain — the spine ───────────────────────────────────────
document.getElementById('spine').innerHTML = PHASES.map((p) => `
  <li class="snode ${p.danger ? 'danger' : ''}" data-go="${p.n}">
    <span class="snode__n">${p.n}</span><b>${p.title}</b><i>${p.sub}</i>
  </li>`).join('');
document.getElementById('spine').addEventListener('click', (e) => {
  const node = e.target.closest('.snode');
  if (!node) return;
  showView('port', 'control');                  // Control now lives under the Port cluster
  openPhase(Number(node.dataset.go));
});

// ── 3) Analyze — scored comparison table + conclusion ────────────
const stars = (n) => `<span class="st" aria-label="${n} out of 5">${'★'.repeat(n)}${'☆'.repeat(5 - n)}</span><span class="num">${n}/5</span>`;
const cell = (n, other) => `<td class="cmp__score ${n > other ? 'win' : (n === other ? 'tie' : '')}">${stars(n)}</td>`;
document.getElementById('cmpBody').innerHTML = ROWS.map((r) => `
  <tr>
    <td class="cmp__dim"><b>${r.dim}</b><span class="cmp__why">${r.why}</span></td>
    ${cell(r.us, r.os)}
    ${cell(r.os, r.us)}
  </tr>`).join('');

const usTotal = ROWS.reduce((a, r) => a + r.us, 0);
const osTotal = ROWS.reduce((a, r) => a + r.os, 0);
const maxTotal = ROWS.length * 5;
document.getElementById('verdict').innerHTML = `
  <div class="verdict__scores">
    <span class="vscore ${usTotal > osTotal ? 'lead' : ''}">Our system <b>${usTotal}</b>/${maxTotal}</span>
    <span class="vscore ${osTotal > usTotal ? 'lead' : ''}">OpenSpec <b>${osTotal}</b>/${maxTotal}</span>
  </div>
  <p class="verdict__txt"><b>Bottom line:</b> OpenSpec's lead is built entirely on the planning-discipline
  rows — a living baseline, deltas, rigor, and the fold-on-archive — the exact responsibilities we never
  assigned ourselves. We stay ahead on the two things OpenSpec structurally lacks: a single source of truth
  and phone/harness visibility — the moat <b>Phase 3</b> exists to protect. So the port isn't "switch to
  OpenSpec," it's <b>adopt its baseline + deltas + rigor, keep our single-source + harness rendering.</b></p>`;

// ── 1b) Our system — the four layers + where each lives ──────────
document.getElementById('sysBody').innerHTML = SYSTEM.map((s) => `
  <div class="sys ${s.kind === 'gap' ? 'sys--gap' : ''}">
    <div class="sys__head"><b>${s.layer}</b><span>${s.sub}</span></div>
    <code class="sys__lives">${s.lives}</code>
    <p class="sys__what">${s.what}</p>
  </div>`).join('');

// ── 2c) CLAUDE.md — which conventions OpenSpec touches ───────────
const IMPACT = {
  replace: { label: 'Replaced', cls: 'cm--replace' },
  add:     { label: 'Added',    cls: 'cm--add' },
  expand:  { label: 'Expanded', cls: 'cm--expand' },
  done:    { label: 'Done',     cls: 'cm--done' },
};
document.getElementById('cmodBody').innerHTML = CMODS.map((c) => {
  const im = IMPACT[c.impact];
  return `<tr class="${im.cls}">
    <td class="cm__sec"><b>${c.sec}</b><span>${c.loc}</span></td>
    <td class="cm__impact"><span class="cm__badge">${im.label}</span></td>
    <td class="cm__when">${c.when}<span class="cm__src cm__src--${c.plan}">${c.plan === 'explicit' ? 'in plan' : 'inferred'}</span></td>
    <td class="cm__detail">${c.detail}</td>
  </tr>`;
}).join('');
document.getElementById('cmodUntouched').innerHTML = CUNTOUCHED.map((u) => `<li>${u}</li>`).join('');

// ── 3b) Adopt — one before/after table, with a net-new flag ──────
document.getElementById('flowBody').innerHTML = FLOW.map((f) => {
  const isNew = f.cap === 'new';
  const badge = isNew
    ? '<span class="flow__cap flow__cap--new">Net-new</span>'
    : '<span class="flow__cap flow__cap--same">Reshaped</span>';
  const today = isNew
    ? `<span class="flow__cant">Can’t do today</span> ${f.old}`
    : f.old;
  const port = f.port
    ? `<span class="flow__ported" title="run it in the Console tab">✓ <code>${f.port}</code></span>`
    : '<span class="flow__noport">not portable</span>';
  return `<tr class="${isNew ? 'flow--new' : ''}">
    <td class="flow__task"><b>${f.task}</b></td>
    <td class="flow__capcol">${badge}</td>
    <td class="flow__old">${today}</td>
    <td class="flow__now">${f.now}</td>
    <td class="flow__portcol">${port}</td>
  </tr>`;
}).join('');

document.getElementById('ledgerGains').innerHTML = LEDGER.gains.map((g) => `<li>${g}</li>`).join('');
document.getElementById('ledgerCosts').innerHTML = LEDGER.costs.map((c) => `
  <li class="ledger__cost--${c.kind}"><b>${c.t}</b> — ${c.d}</li>`).join('');
document.getElementById('ledgerVerdict').innerHTML = LEDGER.verdict;

// ── 3c) Workflows — the five jobs, in two modes ──────────────────
// Grounded in the real CLI surface (openspec --help, v1.4.1). step.k:
//   cli = a real command → runs in the Console tab (✓)
//   hand = a file you author yourself (✍)   tui = terminal-only (⌨)
const WF_KIND = { cli: '✓', hand: '✍', tui: '⌨' };
const WORKFLOWS = [
  { id: 'setup', mode: 'write', name: 'Set up the tool', cadence: 'once per repo',
    goal: 'Get OpenSpec scaffolded into the repo and keep its instructions current.',
    steps: [
      { t: 'openspec init --tools claude', k: 'cli', d: 'scaffolds openspec/ + the /opsx commands and skills' },
      { t: 'openspec update', k: 'cli', d: 'refresh the instruction files after a CLI upgrade' },
    ] },
  { id: 'inspect', mode: 'read', name: 'Inspect the living truth', cadence: 'anytime',
    goal: 'Answer “what’s in flight?” and “what does it actually do today?” — all read-only.',
    steps: [
      { t: 'openspec list', k: 'cli', d: 'the changes currently in flight' },
      { t: 'openspec list --specs', k: 'cli', d: 'the living baseline — the capabilities as they stand today' },
      { t: 'openspec show &lt;id&gt;', k: 'cli', d: 'read one change or one spec in full' },
      { t: 'openspec status --change &lt;id&gt;', k: 'cli', d: 'artifact-completion status for a change' },
      { t: 'openspec view', k: 'tui', d: 'an interactive dashboard — terminal only, won’t embed in this web app' },
    ] },
  { id: 'change', mode: 'write', name: 'Make a change, end to end', cadence: 'every feature', spine: true,
    goal: 'Take a feature from idea to a delta the baseline absorbs. The spine — and where parallel changes live, each its own folder.',
    steps: [
      { t: 'openspec new change &lt;name&gt;  ·  /opsx propose', k: 'cli', name: 'propose', d: 'scaffold changes/&lt;name&gt;/ — the command bookend at the start' },
      { t: 'delta specs — ADDED / MODIFIED / REMOVED', k: 'hand', name: 'specify', d: 'diff the change against the baseline, so review lands on what moves' },
      { t: '#### Scenario: GIVEN / WHEN / THEN', k: 'hand', name: 'pin “done”', d: 'acceptance criteria beside each requirement (the spec, not an auto-test)' },
      { t: 'design.md + tasks.md', k: 'hand', name: 'design', d: 'the approach, then the slices to build' },
      { t: 'openspec validate --strict', k: 'cli', name: 'gate', d: 'structure must hold (SHALL form, ≥1 scenario) before any code' },
      { t: 'tick tasks.md', k: 'hand', name: 'implement', d: 'as each slice lands — this is the Control tab’s checklist' },
      { t: 'openspec archive &lt;name&gt;', k: 'cli', name: 'ship', d: 'folds the delta into the baseline so the spec reflects reality' },
    ] },
  { id: 'backfill', mode: 'write', name: 'Backfill the baseline', cadence: 'one-time migration',
    goal: 'Seed openspec/specs/ from the system that already exists — the Phase-1 lift.',
    steps: [
      { t: 'bucket the system into capabilities', k: 'hand', d: '~110 plans + docs → chat / files / git / preview / deploy …' },
      { t: 'author openspec/specs/&lt;cap&gt;/spec.md', k: 'hand', d: 'Purpose + SHALL/MUST requirements, each with ≥1 scenario' },
      { t: 'openspec validate --strict', k: 'cli', d: 'run until the whole baseline is clean' },
    ] },
  { id: 'handoff', mode: 'read', name: 'Hand off to an agent or teammate', cadence: 'as needed',
    goal: 'Give a readable brief instead of the codebase.',
    steps: [
      { t: 'hand over specs/ grouped by capability', k: 'hand', d: 'an agent-readable baseline OpenSpec is purpose-built to produce' },
    ] },
];
const wfFlows = document.getElementById('wfFlows');
wfFlows.innerHTML = WORKFLOWS.map((w, i) => {
  const cmds = w.steps.filter((s) => s.k === 'cli').length;
  const steps = w.steps.map((s) => `
    <li class="wfstep wfstep--${s.k}">
      <span class="wfkb wfkb--${s.k}" title="${s.k}">${WF_KIND[s.k]}</span>
      <div class="wfstep__body">
        <code class="wfstep__t">${s.t}</code>${s.name ? `<span class="wfstep__name">${s.name}</span>` : ''}
        <span class="wfstep__d">${s.d}</span>
      </div>
    </li>`).join('');
  return `<article class="wf wf--${w.mode} ${w.spine ? 'wf--spine' : ''} ${i === 0 ? 'open' : ''}" data-mode="${w.mode}">
    <button class="wf__head" aria-expanded="${i === 0}">
      <span class="wf__num">${i + 1}</span>
      <span class="wf__title"><b>${w.name}</b><span class="wf__goal">${w.goal}</span></span>
      <span class="wf__meta">
        <span class="wfchip wfchip--${w.mode}">${w.mode === 'read' ? 'READ' : 'WRITE'}</span>
        <span class="wfchip wfchip--cad">${w.cadence}</span>
        <span class="wfchip wfchip--tally">${cmds}/${w.steps.length} commands</span>
      </span>
      <span class="wf__caret">▾</span>
    </button>
    <ol class="wf__steps">${steps}</ol>
  </article>`;
}).join('');
wfFlows.addEventListener('click', (e) => {
  const head = e.target.closest('.wf__head');
  if (!head) return;
  const card = head.closest('.wf');
  head.setAttribute('aria-expanded', String(card.classList.toggle('open')));
});
document.getElementById('wfFilters').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const mode = btn.dataset.mode;
  document.querySelectorAll('#wfFilters button').forEach((b) => b.classList.toggle('on', b === btn));
  wfFlows.querySelectorAll('.wf').forEach((f) => f.classList.toggle('dim', mode !== 'all' && f.dataset.mode !== mode));
});

// ── 4) Control — phases with checklists ──────────────────────────
const phasesEl = document.getElementById('phases');
function phaseStatus(n) {
  const total = PHASES[n].tasks.length;
  let done = 0;
  for (let i = 0; i < total; i++) if (state.tasks[`p${n}-${i}`]) done++;
  if (done === 0) return { cls: 'todo', label: 'not started' };
  if (done === total) return { cls: 'done', label: 'done' };
  return { cls: 'doing', label: `${done}/${total}` };
}
function phaseProgress(n) {
  const total = PHASES[n].tasks.length;
  let done = 0;
  for (let i = 0; i < total; i++) if (state.tasks[`p${n}-${i}`]) done++;
  return { done, total };
}
// Re-render Control's phases without losing which ones are expanded.
function refreshPhasesPreservingOpen() {
  const open = [...phasesEl.querySelectorAll('.phase.open')].map((el) => el.dataset.phase);
  renderPhases();
  open.forEach((n) => phasesEl.querySelector(`.phase[data-phase="${n}"]`)?.classList.add('open'));
}
// Cross-wire: keep the Console group's "↔ Phase n · done/total" chips in sync.
function updateConsolePhaseChips() {
  document.querySelectorAll('.cgrp__phase[data-phase]').forEach((el) => {
    const n = Number(el.dataset.phase);
    const { done, total } = phaseProgress(n);
    el.textContent = `↔ Phase ${n} · ${done}/${total}`;
    el.classList.toggle('is-done', done === total);
  });
}
function renderPhases() {
  phasesEl.innerHTML = PHASES.map((p) => {
    const st = phaseStatus(p.n);
    const tasks = p.tasks.map((t, i) => {
      const done = !!state.tasks[`p${p.n}-${i}`];
      return `<label class="task ${done ? 'done' : ''}">
        <input type="checkbox" data-task="p${p.n}-${i}" ${done ? 'checked' : ''} />
        <span>${t}</span></label>`;
    }).join('');
    return `<div class="phase ${p.danger ? 'danger' : ''}" data-phase="${p.n}">
      <div class="phase__head">
        <span class="phase__n">${p.n}</span>
        <span class="phase__t"><b>${p.title}</b><span>${p.sub}</span></span>
        <span class="pstatus ${st.cls}">${st.label}</span>
        <span class="phase__caret">▶</span>
      </div>
      <div class="phase__body">
        ${tasks}
        <div class="exit"><b>Exit —</b> ${p.exit}</div>
      </div>
    </div>`;
  }).join('');
}
function openPhase(n) {
  phasesEl.querySelectorAll('.phase').forEach((el) => el.classList.toggle('open', Number(el.dataset.phase) === n));
  const t = phasesEl.querySelector(`.phase[data-phase="${n}"]`);
  if (t) t.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
phasesEl.addEventListener('click', (e) => {
  if (e.target.matches('input[type="checkbox"]')) return; // let the change handler deal with it
  const head = e.target.closest('.phase__head');
  if (head) head.closest('.phase').classList.toggle('open');
});
phasesEl.addEventListener('change', (e) => {
  const cb = e.target.closest('input[data-task]');
  if (!cb) return;
  const key = cb.dataset.task;
  if (cb.checked) state.tasks[key] = true; else delete state.tasks[key];
  saveState(state);
  // update just this phase's status chip + label styling without losing open state
  const phaseEl = cb.closest('.phase');
  const n = Number(phaseEl.dataset.phase);
  const st = phaseStatus(n);
  const badge = phaseEl.querySelector('.pstatus');
  badge.className = `pstatus ${st.cls}`; badge.textContent = st.label;
  cb.closest('.task').classList.toggle('done', cb.checked);
  updateProgress();
  updateConsolePhaseChips();   // keep the Console group chip in sync
});

// ── 5) Decide — the four open decisions (segmented state + fork) ──
const decsEl = document.getElementById('decs');
const decsumEl = document.getElementById('decsum');
const SEG = [['open', 'open'], ['lean', 'leaning'], ['settled', 'settled']];
function renderDecisions() {
  decsEl.innerHTML = DECISIONS.map((d) => {
    const cur = state.decisions[d.id];
    const seg = SEG.map(([s, lbl]) =>
      `<button data-dec="${d.id}" data-state="${s}" class="${cur === s ? 'on' : ''}">${lbl}</button>`).join('');
    const opts = (d.opts || []).map((o) =>
      `<div class="dec__opt ${o.favored ? 'fav' : ''}"><span class="dec__optk">${o.k}</span><span>${o.t}</span></div>`).join('');
    return `<div class="dec is-${cur}">
      <div class="dec__top"><span class="dec__q">${d.q}</span><span class="seg">${seg}</span></div>
      <div class="dec__opts">${opts}</div>
      <div class="dec__lean"><b>Lean:</b> ${d.lean}</div>
    </div>`;
  }).join('');
  updateDecSummary();
}
function updateDecSummary() {
  if (!decsumEl) return;
  const settled = DECISIONS.filter((d) => state.decisions[d.id] === 'settled').length;
  decsumEl.textContent = `${settled}/${DECISIONS.length} settled`;
  decsumEl.className = `decsum ${settled === DECISIONS.length ? 'done' : ''}`;
}
decsEl.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-dec]');
  if (!b) return;
  state.decisions[b.dataset.dec] = b.dataset.state;
  saveState(state);
  renderDecisions();
});

// ── 6) Progress bar ──────────────────────────────────────────────
function updateProgress() {
  const total = PHASES.reduce((a, p) => a + p.tasks.length, 0);
  const done = Object.keys(state.tasks).filter((k) => state.tasks[k]).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressTxt').textContent = `${pct}% · ${done}/${total} tasks`;
}

// ── 7) Reset ─────────────────────────────────────────────────────
document.getElementById('resetBtn').addEventListener('click', () => {
  state = { tasks: {}, decisions: {} };
  DECISIONS.forEach((d) => { state.decisions[d.id] = d.init; });
  saveState(state);
  renderPhases(); renderDecisions(); updateProgress(); updateConsolePhaseChips();
});

// ── Data: Console — the executable twin of the Workflows tab ─────
// Same five jobs, same order, but each command is a real button. step kinds:
//   run  = { run:<action>, cmd, input?, write?, danger? } → a Run button
//   hand = { hand:true, cmd, tag?, d? }  → muted context (you author this)
//   tui  = { tui:true, cmd, d? }         → terminal-only, not runnable here
// Mirrors WORKFLOWS; the old→new anchor stays on the Adopt tab on purpose.
// Each step also carries how you did it in the OLD system, so an expert of
// the previous layer is anchored at every step. old.k ∈ 'moved' (same ritual,
// relocated) | 'new' (no old equivalent — an unlock) | 'same' (unchanged).
const CONSOLE_WF = [
  { name: 'Set up the tool', mode: 'write', phase: 0, steps: [
    { run: 'version', cmd: 'openspec --version', d: 'confirm the CLI is installed',
      old: { k: 'new', t: 'nothing to check — planning was habit + the <code>CLAUDE.md</code> prompt; there was no CLI.' } },
    { run: 'init', cmd: 'openspec init --tools claude', danger: true, d: 'scaffold openspec/ + the /opsx commands (Phase 0)',
      old: { k: 'new', t: 'no install step existed — the “system” was just files + habit.' } },
    { run: 'update', cmd: 'openspec update', d: 'refresh the instruction files after a CLI upgrade',
      old: { k: 'new', t: 'conventions lived in <code>CLAUDE.md</code>, edited by hand — nothing to refresh.' } },
  ] },
  { name: 'Inspect the living truth', mode: 'read', steps: [
    { run: 'list', cmd: 'openspec list', d: 'the changes currently in flight',
      old: { k: 'moved', t: 'open <code>plan.md</code>; read its <b>Active</b> vs <b>Recently-shipped</b> sections, scan <code>plans/*.md</code>.' } },
    { run: 'list-specs', cmd: 'openspec list --specs', d: 'the living baseline — capabilities today',
      old: { k: 'new', t: 'no living doc — you read the code or the changelog. This is the flat gap OpenSpec fills.' } },
    { run: 'show', cmd: 'openspec show &lt;id&gt;', input: { id: 'inShow', ph: 'change or spec id' }, d: 'read one change or spec in full',
      old: { k: 'moved', t: 'open that <code>plans/&lt;feature&gt;.md</code> in the Files tab.' } },
    { run: 'status', cmd: 'openspec status --change &lt;id&gt;', input: { id: 'inStatus', ph: 'change-name' }, d: 'artifact-completion for a change',
      old: { k: 'moved', t: 'eyeball the checkboxes in the plan markdown — no per-artifact tracking.' } },
    { run: 'git-status', cmd: 'git status --short --branch', d: 'the working tree',
      old: { k: 'same', t: 'exactly the same — <code>git status</code>.' } },
    { tui: true, cmd: 'openspec view', d: 'interactive dashboard — terminal only, not runnable here',
      old: { k: 'moved', t: 'the harness Files tab + Understanding app rendered everything live on the phone.' } },
  ] },
  { name: 'Make a change, end to end', mode: 'write', spine: true, steps: [
    { run: 'new-change', cmd: 'openspec new change &lt;name&gt;', input: { id: 'inNew', ph: 'change-name', param: 'change-name' }, write: true, tag: 'propose', d: 'create the change folder',
      old: { k: 'moved', t: 'hand-write a fresh <code>plans/&lt;feature&gt;.md</code> (and, for non-trivial work, an Understanding app).' } },
    { hand: true, params: ['change-name'], cmd: 'write delta specs — ADDED / MODIFIED / REMOVED', tag: 'specify', d: 'diff against the baseline, so review lands on what moves',
      old: { k: 'moved', t: 'prose in the plan re-describing the <i>whole</i> feature — the part changing is buried.' },
      prompt: 'In the OpenSpec change `<change-name>`, write the delta specs. For each capability the change touches, create `openspec/changes/<change-name>/specs/<capability>/spec.md` capturing ONLY what changes — as ADDED / MODIFIED / REMOVED requirements diffed against the baseline in `openspec/specs/` (do not re-describe the whole feature). Every requirement must use SHALL/MUST and carry at least one `#### Scenario:` written GIVEN / WHEN / THEN. When done, run `openspec validate <change-name> --strict` and fix until it passes.' },
    { hand: true, params: ['change-name'], cmd: 'write #### Scenario: GIVEN / WHEN / THEN', tag: 'pin “done”', d: 'acceptance criteria beside each requirement',
      old: { k: 'new', t: '“done” was a judgment call — criteria in your head or scattered across a thread.' },
      prompt: 'For the OpenSpec change `<change-name>`, make sure every requirement in its delta specs has at least one `#### Scenario:` block expressed as GIVEN / WHEN / THEN acceptance criteria. Add any that are missing, keep them concrete and testable (one behavior each), then run `openspec validate <change-name> --strict`.' },
    { hand: true, params: ['change-name'], cmd: 'write design.md + tasks.md', tag: 'design', d: 'the approach, then the slices',
      old: { k: 'moved', t: 'the same plan file — free-form, with a status header.' },
      prompt: 'For the OpenSpec change `<change-name>`, write two files under `openspec/changes/<change-name>/`: `design.md` covering the approach and the key trade-offs, and `tasks.md` breaking the work into ordered, checkable slices as `- [ ]` items. Base both on the proposal and the delta specs already in that change folder.' },
    { run: 'validate-strict', cmd: 'openspec validate --strict', tag: 'gate', d: 'structure must hold before any code',
      old: { k: 'new', t: 'confirm intent in chat, skim the plan — no shape check; under-specified plans sailed through.' } },
    { hand: true, params: ['change-name'], cmd: 'tick tasks.md', tag: 'implement', d: 'as each slice lands — this is the Control tab',
      old: { k: 'moved', t: 'checkboxes in the plan markdown (or this Control Room’s Control tab).' },
      prompt: 'Implement the next unchecked item in `openspec/changes/<change-name>/tasks.md`: write the code, verify it works, then tick the box to `- [x]`. Repeat until every task is checked. Treat the delta specs in that change as the source of truth for the intended behavior, and keep changes scoped to one task at a time.' },
    { run: 'archive', cmd: 'openspec archive &lt;name&gt;', input: { id: 'inArchive', ph: 'change-name', param: 'change-name' }, write: true, tag: 'ship', d: 'fold the delta into the baseline',
      old: { k: 'moved', t: 'move the plan to <b>Recently-shipped</b>; it then freezes and drifts from reality.' } },
  ] },
  { name: 'Backfill the baseline', mode: 'write', steps: [
    { hand: true, cmd: 'bucket the system into capabilities', d: '~110 plans + docs → chat / files / git / preview …',
      old: { k: 'new', t: 'never done — there was no current-state map to build from.' },
      prompt: 'Survey this repository — the running app, `plans/*`, `docs/`, and `CLAUDE.md` — and propose a set of capability buckets for an OpenSpec baseline (for example: chat, files, git, local-app-preview, deploy). Group what the system does TODAY into those buckets and list, per bucket, the existing code and docs that describe it. Do not write specs yet — just produce the bucket map for me to review.' },
    { hand: true, params: ['capability'], cmd: 'author openspec/specs/&lt;cap&gt;/spec.md', d: 'Purpose + SHALL/MUST, each with ≥1 scenario',
      old: { k: 'new', t: 'no living baseline existed — the flat gap.' },
      prompt: 'Author `openspec/specs/<capability>/spec.md` describing what this system does TODAY for the `<capability>` capability — source of truth is the running app and recently-shipped work, NOT aspirational plans. Include a Purpose section and SHALL/MUST requirements, each with at least one `#### Scenario:` (GIVEN / WHEN / THEN). When done, run `openspec validate --strict` and fix until clean.' },
    { run: 'validate-strict', cmd: 'openspec validate --strict', d: 'until the whole baseline is clean',
      old: { k: 'new', t: 'nothing mechanical — you eyeballed it.' } },
  ] },
  { name: 'Hand off to an agent', mode: 'read', steps: [
    { hand: true, cmd: 'hand over specs/ grouped by capability', d: 'an agent-readable baseline',
      old: { k: 'new', t: 'reverse-engineer the code + do plan archaeology — no canonical brief to hand over.' },
      prompt: 'Build a concise onboarding brief for this project from `openspec/specs/`. For each capability (grouped by folder), summarize in a few sentences what it does, its key requirements, and where the code lives. Output it as markdown I can hand to a new teammate or agent.' },
  ] },
];
const WAS_LBL = { moved: 'was', new: 'new', same: 'same' };
// Paste-ready agent prompts for the by-hand steps, keyed cp-<wf>-<step>.
// Kept out of the DOM (clipboard text, not HTML) so backticks/brackets survive.
const COPY_PROMPTS = {};
document.getElementById('consoleBody').innerHTML = CONSOLE_WF.map((w, wi) => {
  const runs = w.steps.filter((s) => s.run).length;
  const steps = w.steps.map((s, si) => {
    const k = s.run ? 'run' : (s.tui ? 'tui' : 'hand');
    const kb = s.run ? '✓' : (s.tui ? '⌨' : '✍');
    const ok = s.old ? s.old.k : 'moved';
    const was = s.old
      ? `<span class="cstep__was cstep__was--${ok}"><span class="cstep__waslbl">${WAS_LBL[ok]}</span>${s.old.t}</span>`
      : '';
    const body = `<div class="cstep__body"><code class="cstep__t">${s.cmd}</code>${s.tag ? `<span class="cstep__tag">${s.tag}</span>` : ''}<span class="cstep__d">${s.d || ''}</span>${was}</div>`;
    let control;
    if (s.run) {
      const pp = s.input && s.input.param ? ` data-param="${s.input.param}"` : '';
      const input = s.input ? `<input class="act__in" id="${s.input.id}"${pp} placeholder="${s.input.ph}" />` : '';
      const from = s.input ? ` data-from="${s.input.id}"` : '';
      const cls = 'act' + (s.write ? ' act--write' : '') + (s.danger ? ' act--danger' : '');
      control = `<div class="cstep__do">${input}<button class="${cls}" data-action="${s.run}"${from}>Run ▸</button></div>`;
    } else if (s.prompt) {
      const key = `cp-${wi}-${si}`;
      COPY_PROMPTS[key] = s.prompt;
      const params = (s.params || []).map((pn) =>
        `<input class="act__in cstep__param" data-param="${pn}" placeholder="${pn}" />`).join('');
      control = `<div class="cstep__do">${params}<button class="cstep__copy" data-copy="${key}" title="fill the field(s), then copy a finished prompt to hand the agent">⧉ Copy prompt</button></div>`;
    } else {
      control = `<span class="cstep__pill cstep__pill--${k}">${s.tui ? 'terminal only' : 'by hand'}</span>`;
    }
    return `<li class="cstep cstep--${k}"><span class="wfkb wfkb--${s.run ? 'cli' : k}">${kb}</span>${body}${control}</li>`;
  }).join('');
  let phaseChip = '';
  if (w.phase != null) {
    const { done, total } = phaseProgress(w.phase);
    phaseChip = `<span class="cgrp__phase ${done === total ? 'is-done' : ''}" data-phase="${w.phase}" title="mirrors Control · Phase ${w.phase}; running a step here ticks it there">↔ Phase ${w.phase} · ${done}/${total}</span>`;
  }
  return `<article class="cgrp cgrp--${w.mode} ${w.spine ? 'cgrp--spine' : ''}">
    <div class="cgrp__hd">
      <b>${w.name}</b>
      <span class="wfchip wfchip--${w.mode}">${w.mode === 'read' ? 'READ' : 'WRITE'}</span>
      <span class="cgrp__tally">${runs} button${runs === 1 ? '' : 's'}</span>
      ${phaseChip}
    </div>
    <ol class="cgrp__steps">${steps}</ol>
  </article>`;
}).join('');

// ── 8) Console — drive real openspec/git via ./api/exec ──────────
// Relative URL on purpose: resolves under the proxy sub-path
// /api/localview/<repo>/app/<appId>/api/exec.
const conLog = document.getElementById('conLog');
const conActions = document.getElementById('consoleBody');

function logBlock({ cmd, code, stdout, stderr, error, ok }) {
  const empty = conLog.querySelector('.con__empty');
  if (empty) empty.remove();
  const el = document.createElement('div');
  const status = error ? 'err' : (ok ? 'ok' : 'err');
  el.className = `logb logb--${status}`;
  const out = (stdout || '').trimEnd();
  const errOut = (stderr || '').trimEnd();
  el.innerHTML = `
    <div class="logb__cmd"><span class="logb__prompt">$</span> ${escapeHtml(cmd || error || '')}
      <span class="logb__code">${error ? 'error' : 'exit ' + code}</span></div>
    ${out ? `<pre class="logb__out">${escapeHtml(out)}</pre>` : ''}
    ${errOut ? `<pre class="logb__out logb__out--err">${escapeHtml(errOut)}</pre>` : ''}
    ${!out && !errOut && !error ? '<pre class="logb__out logb__out--muted">(no output)</pre>' : ''}`;
  conLog.appendChild(el);
  conLog.scrollTop = conLog.scrollHeight;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}
// A muted positive line in the log — used to surface the run→track cross-wire.
function logNote(msg) {
  const el = document.createElement('div');
  el.className = 'logb logb--note';
  el.textContent = msg;
  conLog.appendChild(el);
  conLog.scrollTop = conLog.scrollHeight;
}

// ── Cross-wire: a successful Console run ticks the matching Control task ──
// Start with the clean 1:1 link (init → Phase 0 · "Run openspec init"). Others
// (e.g. validate --strict) span two phases, so they're left manual on purpose.
const RUN_TO_TASK = {
  init: { key: 'p0-1', label: 'Phase 0 · Run openspec init' },
};
function markTask(key) {
  if (state.tasks[key]) return false;             // already ticked — no-op
  state.tasks[key] = true;
  saveState(state);
  refreshPhasesPreservingOpen();
  updateProgress();
  updateConsolePhaseChips();
  return true;
}

async function runAction(action, id, btn) {
  if (btn) { btn.disabled = true; btn.classList.add('busy'); }
  try {
    const res = await fetch('./api/exec', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(id != null ? { action, id } : { action }),
    });
    const data = await res.json();
    if (data.error) { logBlock({ cmd: action, error: data.error }); return; }
    logBlock(data);
    const link = RUN_TO_TASK[action];
    if (link && data.ok && markTask(link.key)) logNote(`✓ ticked Control — ${link.label}`);
  } catch (e) {
    logBlock({ cmd: action, error: 'request failed — is the Console server (serve.mjs) running? ' + e.message });
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove('busy'); }
  }
}

conActions.addEventListener('click', (e) => {
  // Copy-prompt buttons on the by-hand steps (not .act — no server call).
  const cp = e.target.closest('.cstep__copy');
  if (cp) { copyPrompt(cp); return; }
  const btn = e.target.closest('.act');
  if (!btn) return;
  const action = btn.dataset.action;
  let id = null;
  if (btn.dataset.from) {
    const input = document.getElementById(btn.dataset.from);
    id = (input.value || '').trim();
    if (!id) { logBlock({ cmd: action, error: `enter a name first` }); input.focus(); return; }
  }
  runAction(action, id, btn);
});

// ── Copy-prompt: hand a by-hand step to the agent ────────────────
// Substitutes each <param> from the step's own input(s). Inputs sharing a
// data-param (e.g. change-name) are kept in sync, so the operator types the
// value once and every step's copied prompt comes out fully filled in. Blocks
// the copy until the fields are filled, so the clipboard is never half-templated.
function copyPrompt(btn) {
  const step = btn.closest('.cstep');
  const empty = [...step.querySelectorAll('.cstep__param')].find((i) => !i.value.trim());
  if (empty) { empty.focus(); flashCopied(btn, 'enter ' + empty.dataset.param, 'warn'); return; }
  let text = COPY_PROMPTS[btn.dataset.copy] || '';
  step.querySelectorAll('.cstep__param').forEach((inp) => {
    text = text.split('<' + inp.dataset.param + '>').join(inp.value.trim());
  });
  copyText(text).then(() => flashCopied(btn, '✓ Copied')).catch(() => flashCopied(btn, 'Copy failed', 'warn'));
}
function copyText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
  return new Promise((resolve, reject) => {           // http / older-browser fallback
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      const ok = document.execCommand('copy'); document.body.removeChild(ta);
      ok ? resolve() : reject(new Error('execCommand copy failed'));
    } catch (err) { reject(err); }
  });
}
function flashCopied(btn, msg, kind) {
  if (!btn.dataset.label) btn.dataset.label = btn.textContent;
  btn.textContent = msg;
  btn.classList.add(kind === 'warn' ? 'is-warn' : 'is-copied');
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.textContent = btn.dataset.label; btn.classList.remove('is-copied', 'is-warn'); }, 1600);
}
// Keep all inputs that share a data-param (e.g. change-name) in lockstep, so the
// value is typed once and flows to every step's copy prompt + the run commands.
conActions.addEventListener('input', (e) => {
  const el = e.target.closest('[data-param]');
  if (!el) return;
  conActions.querySelectorAll(`[data-param="${el.dataset.param}"]`).forEach((o) => { if (o !== el) o.value = el.value; });
});
// Enter inside an input fires its sibling action button.
conActions.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const input = e.target.closest('.act__in');
  if (!input) return;
  const btn = input.parentElement.querySelector('.act');
  if (btn) btn.click();
});
document.getElementById('logClear').addEventListener('click', () => {
  conLog.innerHTML = '<div class="con__empty">Log cleared.</div>';
});

// ── Migrate tab — staged Phase-4 recipe, reusing the copy-prompt machinery ──
COPY_PROMPTS['mig-translate'] =
  'You merged the OpenSpec branch into your in-flight feature branch and hit a conflict in `plan.md` and/or `CLAUDE.md` — that is expected, nothing is broken. The planning convention switched from `plans/*` to OpenSpec. Translate your feature `<feature>` by following `docs/openspec-migration.md`: run `openspec new change <feature>`, port `plans/<feature>.md` into `proposal.md` (intent) + `design.md` (approach) + `tasks.md` (checklist), and write the delta specs under `openspec/changes/<feature>/specs/<cap>/spec.md` as ADDED / MODIFIED / REMOVED requirements, each using SHALL/MUST with at least one `#### Scenario:` (GIVEN / WHEN / THEN). Then resolve the conflicts — take theirs for `plan.md` and `CLAUDE.md`, and delete your feature row from the retired `plan.md` dashboard — delete `plans/<feature>.md`, run `openspec validate <feature> --strict` until clean, and finish the merge.';
const migOp = document.getElementById('migOp');
if (migOp) {
  migOp.addEventListener('click', (e) => { const cp = e.target.closest('.cstep__copy'); if (cp) copyPrompt(cp); });
}

// ── 9) Cockpit — read-only OpenSpec state (the inspect-twin of Console) ──
// One fetch (./api/cockpit) → three blocks (in flight · shipped · baseline) +
// the old→OpenSpec legend. Drill-in hits ./api/cockpit/show?id=. Pure reader:
// nothing here mutates an artifact — that all stays on the Console tab.
const CK_MAP = [
  { old: 'Look at the current / active plans', prim: 'openspec list', blk: 'flight', lbl: 'In flight' },
  { old: 'Inspect an old / closed plan', prim: 'read changes/archive/&lt;id&gt;/', blk: 'ship', lbl: 'Shipped' },
  { old: '“What does the system do <i>today</i>?”', prim: 'openspec spec list · show &lt;cap&gt;', blk: 'base', lbl: 'Baseline' },
  { old: 'A feature’s completion status', prim: 'openspec list task counts', blk: 'flight', lbl: 'In flight' },
];
const ckBody = document.getElementById('ckBody');
let ckLoaded = false;
// The repo the Cockpit is currently inspecting. '' means "the server's default"
// (env var / app parent); a non-empty value is sent as ?root= on every Cockpit
// read so one running instance can inspect any repo, no restart. Scoped to the
// Cockpit's read-only fetches — the Console's authoring verbs are untouched.
let ckRoot = '';
const ckRootInput = document.getElementById('ckRoot');
// Build the ?root= / &root= suffix for a Cockpit fetch (empty when on default).
const rootParam = (lead) => (ckRoot ? `${lead}root=${encodeURIComponent(ckRoot)}` : '');

function relTime(iso) {
  const t = Date.parse(iso);
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}
// A small SVG completion donut. Green when complete, accent while in progress.
function ckRing(done, total) {
  const frac = total ? done / total : 0;
  const r = 15, c = 2 * Math.PI * r, off = c * (1 - frac);
  const col = total && done === total ? 'var(--have)' : 'var(--accent)';
  return `<svg class="ck__ring" viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">
    <circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--border)" stroke-width="4"/>
    <circle cx="20" cy="20" r="${r}" fill="none" stroke="${col}" stroke-width="4" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 20 20)"/>
    <text x="20" y="21" text-anchor="middle" dominant-baseline="middle" class="ck__ringtxt">${total ? Math.round(frac * 100) : 0}%</text>
  </svg>`;
}
function ckScenarios(list) {
  if (!list || !list.length) return '';
  return `<div class="ck__scn">${list.map((s) => `<pre>${escapeHtml(s.rawText || s.text || '')}</pre>`).join('')}</div>`;
}
// Light inline markdown for spec/task text: `code` and **bold** only (escaped first).
function ckInline(s) {
  return escapeHtml(String(s || ''))
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}
// Block markdown for the proposal.md / design.md panes: headings, unordered
// lists, fenced code, rules and paragraphs. Inline spans reuse ckInline, so the
// same escape-first rule holds. Numbered lists fall through to paragraphs.
function ckMarkdown(md) {
  if (!md) return '';
  let html = '', inList = false, inCode = false, code = [], para = [];
  const flushPara = () => { if (para.length) { html += `<p>${para.map(ckInline).join(' ')}</p>`; para = []; } };
  const flushList = () => { if (inList) { html += '</ul>'; inList = false; } };
  for (const raw of String(md).replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (/^```/.test(line)) {
      if (inCode) { html += `<pre>${escapeHtml(code.join('\n'))}</pre>`; code = []; inCode = false; }
      else { flushPara(); flushList(); inCode = true; }
      continue;
    }
    if (inCode) { code.push(raw); continue; }
    let m;
    if ((m = line.match(/^(#{1,6})\s+(.+)$/))) { flushPara(); flushList(); html += `<div class="ck__doch ck__doch--${Math.min(m[1].length, 4)}">${ckInline(m[2])}</div>`; continue; }
    if (/^(---+|\*\*\*+)$/.test(line)) { flushPara(); flushList(); html += '<hr>'; continue; }
    if ((m = line.match(/^\s*[-*]\s+(.+)$/))) { flushPara(); if (!inList) { html += '<ul>'; inList = true; } html += `<li>${ckInline(m[1])}</li>`; continue; }
    if (line.trim() === '') { flushPara(); flushList(); continue; }
    para.push(line.trim());
  }
  if (inCode) html += `<pre>${escapeHtml(code.join('\n'))}</pre>`;
  flushPara(); flushList();
  return html;
}
// A collapsed prose artifact (proposal / design) — native <details>, no JS.
function ckDoc(label, md) {
  return md ? `<details class="ck__doc"><summary>${label}</summary><div class="ck__docbody">${ckMarkdown(md)}</div></details>` : '';
}
// validate --strict badge for a change/spec card. Absent when validate didn't run.
function ckValid(o) {
  if (o.valid === true) return '<span class="ck-vald ck-vald--ok" title="passes openspec validate --strict">✓ valid</span>';
  if (o.valid === false) { const n = o.issues || 0; return `<span class="ck-vald ck-vald--bad" title="from openspec validate --strict">⚠ ${n} issue${n === 1 ? '' : 's'}</span>`; }
  return '';
}
// The change's tasks.md checklist (read-only), grouped by its `## ` sections.
function ckTasks(tasks) {
  if (!tasks) return '<p class="ck__dsub">No <code>tasks.md</code> in this change.</p>';
  if (!tasks.length) return '<p class="ck__dsub"><code>tasks.md</code> has no checklist items yet.</p>';
  const done = tasks.filter((t) => t.done).length;
  let html = `<div class="ck__tasks"><div class="ck__taskshd">Tasks <span>${done}/${tasks.length}</span></div>`;
  let cur = null;
  tasks.forEach((t) => {
    if (t.section !== cur) { cur = t.section; if (cur) html += `<div class="ck__tasksec">${escapeHtml(cur)}</div>`; }
    html += `<div class="ck__task ${t.done ? 'is-done' : ''}"><span class="ck__taskbox">${t.done ? '✓' : ''}</span><span>${ckInline(t.text)}</span></div>`;
  });
  return `${html}</div>`;
}

// The change ↔ baseline cross-link, computed once per render from the deltas the
// server stamps onto each active change. `touchesBySpec[capId]` lists the active
// changes editing that capability (with their ADDED/MODIFIED/REMOVED ops) — the
// reverse of each change's own `touches`. This is what turns three side-by-side
// lists into a loop: a baseline card can say "1 change in flight is editing me".
function ckCrossLink(activeChanges) {
  const bySpec = {};
  (activeChanges || []).forEach((c) => (c.touches || []).forEach((t) => {
    (bySpec[t.spec] = bySpec[t.spec] || []).push({ change: c.name, operations: t.operations || [] });
  }));
  return bySpec;
}
// Forward tags on an in-flight card: the capabilities this change's deltas touch,
// each badged by operation. Surfaces the delta relationship on the card itself —
// it was previously only visible after drilling in.
function ckTouches(touches) {
  if (!touches || !touches.length) return '';
  const tags = touches.map((t) => {
    const ops = t.operations || [];
    const op = (ops[0] || '').toLowerCase();
    return `<span class="ck-touch__cap" title="${escapeHtml(ops.join(' · ') || 'delta')} → ${escapeHtml(t.spec)}">
      <span class="ck__op ck__op--${op}">${escapeHtml(ops[0] || '∆')}</span>${escapeHtml(t.spec)}</span>`;
  }).join('');
  return `<span class="ck-item__touch"><span class="ck-touch__lbl">touches</span>${tags}</span>`;
}
// Reverse pill on a baseline card: how many active changes are editing this
// capability right now (tooltip names them + their ops). Absent when none.
function ckFlux(specId, bySpec) {
  const list = bySpec[specId];
  if (!list || !list.length) return '';
  const tip = list.map((x) => `${x.change}${x.operations.length ? ` (${x.operations.join(', ')})` : ''}`).join(' · ');
  return `<span class="ck-flux" title="in flight: ${escapeHtml(tip)}">⚠ ${list.length} in flight</span>`;
}

function renderCockpit(d) {
  const errs = d.errors || {};
  const bySpec = ckCrossLink(d.activeChanges);
  const flight = (d.activeChanges || []).map((c) => `
    <button class="ck-item ck-item--flight" data-id="${escapeHtml(c.name)}" data-kind="change">
      ${ckRing(c.completedTasks || 0, c.totalTasks || 0)}
      <span class="ck-item__body">
        <b>${escapeHtml(c.name)}</b>
        <span class="ck-item__meta">
          <span class="ck-pill ck-pill--${(c.status || '').replace(/[^a-z-]/gi, '')}">${escapeHtml(c.status || '—')}</span>
          ${ckValid(c)}
          <span>${c.completedTasks || 0}/${c.totalTasks || 0} tasks</span>
          <span class="ck-item__time">${relTime(c.lastModified)}</span>
        </span>
        ${ckTouches(c.touches)}
      </span>
    </button>`).join('');

  const shipped = (d.archived || []).map((a) => `
    <button class="ck-item ck-item--ship" data-id="${escapeHtml(a.id)}" data-kind="archived">
      <span class="ck-date">${escapeHtml(a.date || '—')}</span>
      <span class="ck-item__body"><b>${escapeHtml(a.title || a.slug)}</b>
        <span class="ck-item__meta"><code>${escapeHtml(a.slug)}</code></span>
      </span>
    </button>`).join('');

  const base = (d.specs || []).map((s) => `
    <button class="ck-item ck-item--base" data-id="${escapeHtml(s.id)}" data-kind="spec">
      <span class="ck-count">${s.requirementCount}</span>
      <span class="ck-item__body"><b>${escapeHtml(s.title || s.id)}</b>
        <span class="ck-item__meta">${s.requirementCount} requirement${s.requirementCount === 1 ? '' : 's'} ${ckValid(s)} ${ckFlux(s.id, bySpec)}</span>
      </span>
    </button>`).join('');

  const empty = (msg) => `<div class="ck-empty">${msg}</div>`;
  const errBox = (e) => e ? `<div class="ck__err">couldn’t read — ${escapeHtml(String(e).split('\n')[0])}</div>` : '';

  ckBody.innerHTML = `
    <details class="ck__legend">
      <summary class="ck__legendhd">Your old <code>plans/*</code> moves → where they live now</summary>
      <table class="ck__map"><tbody>
        ${CK_MAP.map((m) => `<tr>
          <td class="ck__mapold">${m.old}</td>
          <td class="ck__mapprim"><code>${m.prim}</code></td>
          <td class="ck__mapblk"><span class="ck-tag ck-tag--${m.blk}">${m.lbl}</span></td>
        </tr>`).join('')}
      </tbody></table>
    </details>

    <div class="ck__detail" id="ckDetail"></div>

    <div class="ck__grid">
      <section class="ck__col ck__col--flight">
        <h3>🚧 In flight <span class="ck__n">${(d.activeChanges || []).length}</span></h3>
        ${errBox(errs.changes)}
        ${flight || empty('No active changes. Start one in the Console — <code>openspec new change</code>.')}
      </section>
      <section class="ck__col ck__col--ship">
        <h3>📦 Shipped <span class="ck__n">${(d.archived || []).length}</span></h3>
        ${shipped || empty('Nothing archived yet. <code>openspec archive &lt;id&gt;</code> folds a change into the baseline.')}
      </section>
      <section class="ck__col ck__col--base">
        <h3>📚 Living baseline <span class="ck__n">${(d.specs || []).length}</span></h3>
        ${errBox(errs.specs)}
        ${base || empty('No capabilities yet — the baseline grows as changes archive.')}
      </section>
    </div>`;
}

function renderCkDetail(d) {
  const panel = document.getElementById('ckDetail');
  if (!panel) return;
  if (!d || !d.ok || !d.json) {
    panel.innerHTML = `<button class="ck__detailx">✕</button><div class="ck__err">couldn’t load — ${escapeHtml((d && (d.stderr || d.parseError)) || 'not found')}</div>`;
    panel.classList.add('show'); return;
  }
  const j = d.json;
  let inner;
  if (Array.isArray(j.deltas)) {                 // a change (active or archived)
    const kind = j.archived ? 'shipped' : 'change';
    const sub = j.archived
      ? `${j.deltaCount} delta${j.deltaCount === 1 ? '' : 's'} folded into the baseline · tasks from the archived <code>tasks.md</code>`
      : `${j.deltaCount} delta${j.deltaCount === 1 ? '' : 's'} against the baseline · tasks from <code>tasks.md</code>`;
    inner = `<span class="ck__detailkind">${kind}</span><h3>${escapeHtml(j.title || j.id)}</h3>
      <p class="ck__dsub">${sub}</p>
      ${ckDoc('📄 Proposal', d.proposal)}
      ${ckDoc('🛠 Design', d.design)}
      <h4 class="ck__dsec">Deltas</h4>
      ${j.deltas.map((dl) => `<div class="ck__delta">
        <div class="ck__deltahd"><span class="ck__op ck__op--${String(dl.operation || '').toLowerCase()}">${escapeHtml(dl.operation || '')}</span><code>${escapeHtml(dl.spec || '')}</code></div>
        ${(dl.requirements || (dl.requirement ? [dl.requirement] : [])).map((r) => `<div class="ck__req"><b>${ckInline(r.text)}</b>${ckScenarios(r.scenarios)}</div>`).join('')}
      </div>`).join('')}
      <h4 class="ck__dsec">Task checklist</h4>
      ${ckTasks(d.tasks)}`;
  } else {                                        // a spec/capability
    inner = `<span class="ck__detailkind">capability</span><h3>${escapeHtml(j.title || j.id)}</h3>
      ${j.overview ? `<p class="ck__dsub">${escapeHtml(j.overview)}</p>` : ''}
      <p class="ck__dsub">${j.requirementCount || (j.requirements || []).length} requirement${(j.requirementCount || 0) === 1 ? '' : 's'}</p>
      ${(j.requirements || []).map((r) => `<div class="ck__req"><b>${ckInline(r.text)}</b>${ckScenarios(r.scenarios)}</div>`).join('')}`;
  }
  panel.innerHTML = `<button class="ck__detailx" title="close">✕</button>${inner}`;
  panel.classList.add('show');
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function loadCockpit(force) {
  if (ckLoaded && !force) return;
  ckLoaded = true;
  ckBody.innerHTML = '<div class="ck__loading">Reading OpenSpec state…</div>';
  try {
    const res = await fetch(`./api/cockpit${rootParam('?')}`);
    const j = await res.json();
    if (!res.ok) {
      ckLoaded = false;
      ckBody.innerHTML = `<div class="ck__err">Can’t inspect that repo — ${escapeHtml(j.error || ('HTTP ' + res.status))}</div>`;
      return;
    }
    // Pre-fill the textbox with the repo the server actually resolved, so the box
    // shows the live default when the user hasn't typed an override yet.
    if (j.repoRoot && document.activeElement !== ckRootInput && !ckRoot) ckRootInput.value = j.repoRoot;
    renderCockpit(j);
  } catch (e) {
    ckLoaded = false;
    ckBody.innerHTML = `<div class="ck__err">Couldn’t reach the server (serve.mjs running?) — ${escapeHtml(e.message)}</div>`;
  }
}
ckBody.addEventListener('click', async (e) => {
  if (e.target.closest('.ck__detailx')) { document.getElementById('ckDetail').classList.remove('show'); return; }
  const item = e.target.closest('.ck-item[data-id]');
  if (!item) return;
  const panel = document.getElementById('ckDetail');
  panel.innerHTML = '<div class="ck__loading">Loading…</div>'; panel.classList.add('show');
  try {
    const ep = item.dataset.kind === 'archived' ? 'archived' : 'show';
    const res = await fetch(`./api/cockpit/${ep}?id=${encodeURIComponent(item.dataset.id)}${rootParam('&')}`);
    renderCkDetail(await res.json());
  } catch (e2) {
    renderCkDetail({ ok: false, stderr: e2.message });
  }
});
document.getElementById('ckRefresh').addEventListener('click', () => loadCockpit(true));

// Repo-root textbox: submit (Enter / Inspect) reads against the typed path; the
// drill-in panel is closed since its contents belong to the previous repo.
document.getElementById('ckRootForm').addEventListener('submit', (e) => {
  e.preventDefault();
  ckRoot = ckRootInput.value.trim();
  document.getElementById('ckDetail')?.classList.remove('show');
  loadCockpit(true);
});
// "Default" clears the override and re-reads the server's default repo.
document.getElementById('ckRootReset').addEventListener('click', () => {
  ckRoot = '';
  ckRootInput.value = '';
  document.getElementById('ckDetail')?.classList.remove('show');
  loadCockpit(true);
});

// ── Initial render ───────────────────────────────────────────────
renderPhases();
renderDecisions();
updateProgress();
