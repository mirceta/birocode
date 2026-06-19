// Our system vs OpenSpec — the honest comparison. Self-contained, no libs,
// relative URLs (served under /api/localview/<repo>/app/understanding/).
// Interactions: (1) view switcher, (2) artifact cards (static render),
// (3) matrix rows expand to a note.

// ── Data: what "our system" actually is ──────────────────────────
const ARTIFACTS = [
  { name: 'plans/&lt;feature&gt;.md', role: 'intent', desc: 'One plan per feature: goal, approach, slices, status header. What we mean to build.' },
  { name: 'understanding.md', role: 'intent', desc: 'Restate the ask before doing it; rendered in the Understanding panel. Deleted when the task ships.' },
  { name: 'plan.md dashboard', role: 'process', desc: 'Active vs Recently-shipped index across all plans. A roadmap + changelog, not a spec.' },
  { name: 'CLAUDE.md / docs/', role: 'process', desc: 'The conventions and rationale themselves — how we work, why the app exists.' },
  { name: 'harness rendering', role: 'process', desc: 'Plan tab, doc viewer, Understanding panel — makes all of the above visible on the phone.' },
  { name: 'git history + branches', role: 'past', desc: 'The actual record of what changed. Precise, but unstructured prose-by-diff.' },
];

// ── Data: the comparison matrix (verdict from OUR point of view) ──
// v: have | partial | gap | edge
const ROWS = [
  {
    dim: 'Primary job',
    ours: 'Capture <b>intent</b> for a feature, before & while building it.',
    os: 'Maintain <b>current-state truth</b> + disciplined change against it.',
    v: 'partial', chip: 'different jobs',
    note: 'This is the crux: our artifacts answer "what are we about to do?" OpenSpec answers "what does this already do, and how is this change moving it?" Same neighbourhood, different question.',
  },
  {
    dim: '"What does it do today?"',
    ours: 'No living doc. Read the code + scan Recently-shipped + trust plans that may have drifted.',
    os: '<code>specs/&lt;cap&gt;/spec.md</code> — a living baseline, grouped by capability.',
    v: 'gap', chip: 'flat gap',
    note: 'The empty cell you sensed. Nowhere in our notebooks is "current behaviour" written down as a queryable, structured artifact. It exists only as code + a changelog. This is the single responsibility OpenSpec owns that we never assigned.',
  },
  {
    dim: 'Change as a delta',
    ours: 'A plan describes the <i>whole</i> feature, not ADDED / MODIFIED / REMOVED against a known baseline.',
    os: 'Explicit deltas with GIVEN/WHEN/THEN scenarios, diffed against the baseline.',
    v: 'gap', chip: 'flat gap',
    note: 'Tied to the row above: you can only express a change as a delta if a baseline exists to delta against. We have no baseline, so every plan re-describes the world from scratch.',
  },
  {
    dim: 'Review before code',
    ours: '<code>understanding.md</code> + plan, reviewed in the panel before work. Loose, prose, no gate.',
    os: 'proposal + deltas, reviewable (and gateable) before implementation.',
    v: 'have', chip: 'we cover it',
    note: 'We genuinely do this well already — the Understanding panel is exactly an intent-before-code ritual. OpenSpec formalizes it harder, but the responsibility is met on our side.',
  },
  {
    dim: 'Rigor / verifiability',
    ours: 'Free prose. Nothing validates a plan\'s shape or completeness.',
    os: 'SHALL/MUST requirements + mandatory <code>####</code> scenarios; <code>validate --strict</code> enforces it.',
    v: 'partial', chip: 'loose',
    note: 'Our plans are as rigorous as the author that day. OpenSpec\'s validator is a real, if narrow, machine check — it can reject a malformed spec. We have no equivalent gate.',
  },
  {
    dim: 'Organized by',
    ours: 'By feature / branch (one plan = one effort).',
    os: 'Baseline by <b>capability</b>; changes by id.',
    v: 'partial', chip: 'different axis',
    note: 'Capability-grouping is what makes "what does the chat subsystem do?" answerable in one place. Our feature-grouping scatters that across every plan that ever touched chat.',
  },
  {
    dim: 'After ship',
    ours: 'Move plan to Recently-shipped; git holds the diff. Plan then frozen.',
    os: '<code>archive</code> folds the delta <i>into the baseline</i> — the spec self-updates.',
    v: 'partial', chip: 'loose',
    note: 'We record <i>that</i> something shipped (a changelog line). OpenSpec records <i>what the system now does</i> as a result. The fold is the mechanism we lack.',
  },
  {
    dim: 'Persistence',
    ours: '<code>understanding.md</code> deleted on done; plans freeze as history.',
    os: '<code>specs/</code> are permanent, continuously-updated living docs.',
    v: 'partial', chip: 'ephemeral',
    note: 'Our truest artifacts are deliberately disposable. That keeps the repo clean but means no durable home for current-state knowledge.',
  },
  {
    dim: 'Tooling',
    ours: 'None — conventions + prompt rituals. Zero install.',
    os: 'A maintained CLI + <code>/opsx</code> slash-commands across 25+ assistants.',
    v: 'partial', chip: 'by design',
    note: 'Not strictly a weakness — our lightness is a feature. But it does mean discipline rests entirely on habit, with no tool to lean on.',
  },
  {
    dim: 'Single source of truth',
    ours: 'One store, in the repo, rendered live by the harness.',
    os: 'A separate <code>openspec/</code> tree — a second store the harness can\'t see (until built).',
    v: 'edge', chip: 'we\'re stronger',
    note: 'This is our moat and OpenSpec\'s structural risk. Adopting it wholesale re-introduces the two-sources-of-truth drift we keep fighting — Phase 3 (harness rendering) exists purely to claw this back.',
  },
  {
    dim: 'Phone / harness visibility',
    ours: 'Everything renders live in the harness UI.',
    os: 'Invisible on the phone until we write a renderer for it.',
    v: 'edge', chip: 'we\'re stronger',
    note: 'For a phone-first harness, "you can read it on the device" is not optional. Our convention is built into the product; OpenSpec\'s tree is just files until Phase 3.',
  },
];

// ── 1) View switcher ─────────────────────────────────────────────
const nav = document.getElementById('nav');
nav.addEventListener('click', (e) => {
  const btn = e.target.closest('.nav__btn');
  if (!btn) return;
  const view = btn.dataset.view;
  nav.querySelectorAll('.nav__btn').forEach((b) => b.classList.toggle('is-active', b === btn));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.id === `view-${view}`));
});

// ── 2) Render the artifact cards ─────────────────────────────────
const ROLE_LABEL = { intent: 'intent', process: 'how we work', past: 'what shipped' };
document.getElementById('arts').innerHTML = ARTIFACTS.map((a) => `
  <div class="art">
    <b><code>${a.name}</code></b>
    <p>${a.desc}</p>
    <span class="role">${ROLE_LABEL[a.role]}</span>
  </div>`).join('');

// ── 3) Render + drive the matrix ─────────────────────────────────
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

// Open the two gap rows by default — they're the point of the whole comparison.
matrixEl.querySelectorAll('.mrow.v-gap').forEach((el) => el.classList.add('open'));
