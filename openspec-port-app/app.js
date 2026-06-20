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
const FLOW = [
  { task: 'Kick off a new feature',
    old: 'Tell Claude; it confirms intent in chat and (for non-trivial work) builds an Understanding app to visualize it. <i>(<code>understanding.md</code> was retired 2026-06-20.)</i>',
    now: 'Run <code>/opsx propose &lt;name&gt;</code> — scaffolds <code>openspec/changes/&lt;name&gt;/</code> with a <code>proposal.md</code> (the restate-intent role).' },
  { task: 'Spell out what the change does',
    old: 'Prose in <code>plans/&lt;feature&gt;.md</code> describing the <i>whole</i> feature from scratch.',
    now: 'Write <b>delta specs</b> — ADDED / MODIFIED / REMOVED requirements, each with a <code>#### scenario</code>, diffed against the baseline.' },
  { task: 'Describe the approach & steps',
    old: 'The same plan file — free-form, with a status header.',
    now: '<code>design.md</code> for the approach + <code>tasks.md</code> for the slices.' },
  { task: 'Review before any code',
    old: 'Confirm intent in chat + the Understanding app, skim the plan. Loose, no gate.',
    now: 'Review proposal + deltas; <code>openspec validate --strict</code> checks the shape and can gate the start.' },
  { task: 'Track build progress',
    old: 'Checkboxes in the plan markdown (or this Control Room).',
    now: 'Tick items in <code>tasks.md</code> as each slice lands.' },
  { task: 'Ask "what does it do today?"',
    old: 'No living doc — read the code, scan Recently-shipped, and hope the plans haven\'t drifted.',
    now: '<code>openspec list</code> / open <code>openspec/specs/&lt;cap&gt;/spec.md</code> — a living baseline per capability.' },
  { task: 'Finish & ship',
    old: 'Move the plan to "Recently-shipped"; git keeps the diff; the plan freezes.',
    now: '<code>openspec archive &lt;change&gt;</code> — <b>folds the delta into the baseline</b>, so the spec now reflects reality. Becomes the deploy ritual\'s definition of done.' },
  { task: 'Read planning on your phone',
    old: 'Everything renders live in the harness — Files tab (plan.md) + the Understanding app.',
    now: 'Same place — <b>Phase 3</b> adds a renderer for <code>openspec/specs/</code> + active <code>openspec/changes/</code>.' },
];

// ── Data: Adopt — net-new powers OpenSpec unlocks ────────────────
// Each is something you couldn't do before, or that was prohibitively
// hard/expensive. `note` keeps us honest about what's a structural
// enable vs. something the tool does for you.
const UNLOCKS = [
  { now: 'Ask "what does this do <i>today</i>?" and get a straight answer',
    before: 'No canonical doc — you read the code and scanned ~110 forward-looking <code>plans/*</code> that quietly drift from reality.',
    tag: 'openspec list · specs/&lt;cap&gt;/spec.md',
    why: 'Archiving <b>folds the delta into a living baseline</b>, so the spec always reflects what shipped — the one thing our plans structurally lack.' },
  { now: 'Review a change as a <i>diff</i>, not a re-description',
    before: 'Every plan re-described the whole feature from scratch; the part that was actually <i>changing</i> was buried in prose.',
    tag: 'changes/&lt;id&gt;/specs/ — ADDED / MODIFIED / REMOVED',
    why: 'Deltas are scoped to exactly what moves against the baseline, so review (and your eyes) land on the change itself.' },
  { now: 'Gate work on a <i>machine-checked</i> plan',
    before: 'Prose plans had no shape check and no gate — an under-specified or malformed plan sailed straight through to code.',
    tag: 'openspec validate --strict',
    why: 'Validate enforces structure: requirements in SHALL/MUST form, every one carrying ≥1 <code>####</code> scenario. Wire it into CI to block work before a line is written.' },
  { now: 'Write the acceptance criteria <i>beside</i> the requirement',
    before: '"Done" was a judgment call; the criteria lived in your head or scattered across a thread.',
    tag: '#### Scenario: GIVEN / WHEN / THEN',
    why: 'Each requirement ships with its own scenarios — a definition of done you can read back. (Honest: they’re the spec, not an auto-run test — you still turn them into one.)' },
  { now: 'Keep several changes in flight without them colliding',
    before: 'One growing plan file (Active vs. Recently-shipped) was a single contended doc — parallel features stepped on each other.',
    tag: 'changes/add-x/ · changes/add-y/',
    why: 'Each change is an isolated folder that validates and archives on its own clock, so work can fan out and land independently.' },
  { now: 'Hand a fresh agent the <i>spec</i>, not the whole codebase',
    before: 'Onboarding a teammate — or a new Claude session — meant reverse-engineering code and doing plan archaeology.',
    tag: 'specs/ grouped by capability, agent-readable',
    why: 'OpenSpec is built for AI assistants: a capability-grouped baseline a model can read to act correctly. The backfill itself is a multi-agent sweep — one agent per capability.' },
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
function showView(view) {
  nav.querySelectorAll('.nav__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.view === view));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.id === `view-${view}`));
}

// ── 2) Explain — the spine ───────────────────────────────────────
document.getElementById('spine').innerHTML = PHASES.map((p) => `
  <li class="snode ${p.danger ? 'danger' : ''}" data-go="${p.n}">
    <span class="snode__n">${p.n}</span><b>${p.title}</b><i>${p.sub}</i>
  </li>`).join('');
document.getElementById('spine').addEventListener('click', (e) => {
  const node = e.target.closest('.snode');
  if (!node) return;
  showView('control');
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

// ── 3b) Adopt — the before/after workflow table ──────────────────
document.getElementById('flowBody').innerHTML = FLOW.map((f) => `
  <tr>
    <td class="flow__task"><b>${f.task}</b></td>
    <td class="flow__old">${f.old}</td>
    <td class="flow__now">${f.now}</td>
  </tr>`).join('');

document.getElementById('unlocksBody').innerHTML = UNLOCKS.map((u, i) => `
  <div class="unlock">
    <div class="unlock__head"><span class="unlock__n">${i + 1}</span><b>${u.now}</b></div>
    <p class="unlock__why">${u.why}</p>
    <p class="unlock__before"><span>Before:</span> ${u.before}</p>
    <code class="unlock__tag">${u.tag}</code>
  </div>`).join('');

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
  renderPhases(); renderDecisions(); updateProgress();
});

// ── Initial render ───────────────────────────────────────────────
renderPhases();
renderDecisions();
updateProgress();
