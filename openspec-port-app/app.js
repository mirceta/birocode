// OpenSpec Port — Control Room. Self-contained, no libs, relative URLs
// (served under /api/localview/<repo>/app/<appId>/). Three pillars:
//   Explain (spine), Analyze (comparison matrix), Control (localStorage tracker).
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
      'Mark spec-baseline.md superseded; resolve understanding.md\'s role vs proposal.md',
      'Update CLAUDE.md, docs/understanding-app-convention.md, and plan.md\'s dashboard to make OpenSpec canonical',
    ],
    exit: 'OpenSpec is the canonical convention; the old one is frozen or folded. Irreversible.',
  },
];

// ── Data: the four open decisions ────────────────────────────────
const DECISIONS = [
  { id: 'd1', q: '1 · Dual-write, or hard cut?', lean: 'dual-write — keep plans/* alive through Phases 1–3, retire at Phase 4', init: 'lean' },
  { id: 'd2', q: '2 · Harness rendering — now or later?', lean: 'settled: it happens (harness is kept). Open knob is only sequencing', init: 'settled' },
  { id: 'd3', q: '3 · How deep is the backfill?', lean: 'seed the shipped surface, grow it as features change it', init: 'lean' },
  { id: 'd4', q: '4 · Where does the CLI live?', lean: 'pin as a repo devDependency (travels with the repo)', init: 'lean' },
];

// ── Data: the comparison matrix (verdict from OUR point of view) ──
const ROWS = [
  { dim: 'Primary job', ours: 'Capture <b>intent</b> for a feature, before & while building.', os: 'Maintain <b>current-state truth</b> + disciplined change.', v: 'partial', chip: 'different jobs',
    note: 'Our artifacts answer "what are we about to do?"; OpenSpec answers "what does this already do, and how is this change moving it?"' },
  { dim: '"What does it do today?"', ours: 'No living doc — read the code + scan Recently-shipped + trust plans that may have drifted.', os: '<code>specs/&lt;cap&gt;/spec.md</code> — a living baseline by capability.', v: 'gap', chip: 'flat gap',
    note: 'The empty cell. Current behaviour is written down nowhere as a queryable artifact — only as code + a changelog. This is the one responsibility OpenSpec owns that we never assigned.' },
  { dim: 'Change as a delta', ours: 'A plan describes the <i>whole</i> feature, not ADDED / MODIFIED / REMOVED against a baseline.', os: 'Explicit deltas + scenarios, diffed against the baseline.', v: 'gap', chip: 'flat gap',
    note: 'You can only express a change as a delta if a baseline exists to delta against. We have none, so every plan re-describes the world from scratch.' },
  { dim: 'Review before code', ours: 'understanding.md + plan, reviewed in the panel. Loose, prose, no gate.', os: 'proposal + deltas, reviewable (and gateable).', v: 'have', chip: 'we cover it',
    note: 'The Understanding panel is exactly an intent-before-code ritual. OpenSpec formalizes it harder, but the responsibility is met on our side.' },
  { dim: 'Rigor / verifiability', ours: 'Free prose. Nothing validates a plan\'s shape.', os: 'SHALL/MUST + mandatory scenarios; <code>validate --strict</code>.', v: 'partial', chip: 'loose',
    note: 'Our plans are as rigorous as the author that day; OpenSpec\'s validator is a real, if narrow, machine check.' },
  { dim: 'After ship', ours: 'Move plan to Recently-shipped; git holds the diff; plan frozen.', os: '<code>archive</code> folds the delta <i>into the baseline</i>.', v: 'partial', chip: 'loose',
    note: 'We record that something shipped; OpenSpec records what the system now does as a result. The fold is the mechanism we lack.' },
  { dim: 'Single source of truth', ours: 'One store, in the repo, rendered live by the harness.', os: 'A separate openspec/ tree the harness can\'t see (until built).', v: 'edge', chip: 'we\'re stronger',
    note: 'Our moat and OpenSpec\'s structural risk. Adopting wholesale re-introduces two-sources drift — Phase 3 exists to claw it back.' },
  { dim: 'Phone / harness visibility', ours: 'Everything renders live in the harness UI.', os: 'Invisible on the phone until we write a renderer.', v: 'edge', chip: 'we\'re stronger',
    note: 'For a phone-first harness, "readable on the device" isn\'t optional. Our convention is built into the product; OpenSpec\'s tree is just files until Phase 3.' },
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

// ── 3) Analyze — the matrix ──────────────────────────────────────
const matrixEl = document.getElementById('matrix');
matrixEl.innerHTML = ROWS.map((r) => `
  <div class="mrow v-${r.v}">
    <div class="mrow__head">
      <span class="mrow__dim">${r.dim}</span>
      <span class="mrow__cell ours"><span class="who">Our system</span>${r.ours}</span>
      <span class="mrow__cell"><span class="who">OpenSpec</span>${r.os}</span>
      <span class="chip ${r.v}">${r.chip}</span>
      <span class="mrow__caret" aria-hidden="true">▶</span>
    </div>
    <div class="mrow__note">${r.note}</div>
  </div>`).join('');
matrixEl.addEventListener('click', (e) => {
  const head = e.target.closest('.mrow__head');
  if (head) head.closest('.mrow').classList.toggle('open');
});
matrixEl.querySelectorAll('.mrow.v-gap').forEach((el) => el.classList.add('open'));

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

// ── 5) Control — decisions (segmented state) ─────────────────────
const decsEl = document.getElementById('decs');
const SEG = [['open', 'open'], ['lean', 'leaning'], ['settled', 'settled']];
function renderDecisions() {
  decsEl.innerHTML = DECISIONS.map((d) => {
    const cur = state.decisions[d.id];
    const seg = SEG.map(([s, lbl]) =>
      `<button data-dec="${d.id}" data-state="${s}" class="${cur === s ? 'on' : ''}">${lbl}</button>`).join('');
    return `<div class="dec">
      <div class="dec__top"><span class="dec__q">${d.q}</span><span class="seg">${seg}</span></div>
      <div class="dec__lean"><b>Lean:</b> ${d.lean}</div>
    </div>`;
  }).join('');
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
