// The OpenSpec transition — flip on a branch, catch the stragglers.
// Self-contained, no libs, relative URLs (served under
// /api/localview/<repo>/app/understanding/). The centerpiece is a stepper
// walking a straggler branch (feature/add-foo) through the flipped convention,
// mirroring docs/openspec-migration.md (the source of truth).

const STEPS = [
  { k: 'old', t: 'Branch in flight', file: 'plans/add-foo.md',
    d: '<code>feature/add-foo</code> was cut from old <code>main</code>, planning the old way — a prose <code>plans/add-foo.md</code> plus a row in the <code>plan.md</code> dashboard.' },
  { k: 'act', t: 'Merge main', file: 'git merge main',
    d: 'OpenSpec has landed on <code>main</code>. You merge <code>main</code> into your branch to stay current — same as any day.' },
  { k: 'conflict', t: 'Conflict ⚠ — but nothing is broken', file: 'plan.md · CLAUDE.md',
    d: 'Git stops on conflicts in <code>plan.md</code> (the shared dashboard) and <code>CLAUDE.md</code>. Your own <code>plans/add-foo.md</code> does <i>not</i> conflict — a new file never does. This is the expected signal, not damage.' },
  { k: 'read', t: 'Read the new convention', file: 'CLAUDE.md',
    d: 'The incoming <code>CLAUDE.md</code> now says: plan in OpenSpec, and <b>if you are merging an old <code>plans/*</code> branch, follow <code>docs/openspec-migration.md</code></b>. The conflict just told you where to look.' },
  { k: 'new', t: 'Create the change', file: 'openspec new change add-foo',
    d: 'Run <code>openspec new change add-foo</code> → <code>openspec/changes/add-foo/</code>. (Or <code>/opsx propose add-foo</code>.)' },
  { k: 'new', t: 'Port the prose', file: 'proposal · design · tasks',
    d: 'Split <code>plans/add-foo.md</code> into <code>proposal.md</code> (intent / why), <code>design.md</code> (approach), and <code>tasks.md</code> (the checklist as <code>- [ ]</code>).' },
  { k: 'new', t: 'Write the delta specs', file: 'changes/add-foo/specs/&lt;cap&gt;/spec.md',
    d: 'Capture only what changes, as <b>ADDED / MODIFIED / REMOVED</b> requirements diffed against the baseline — each SHALL/MUST with at least one <code>#### Scenario:</code> (GIVEN / WHEN / THEN).' },
  { k: 'resolve', t: 'Resolve the conflicts', file: 'plan.md · CLAUDE.md',
    d: 'Take <b>theirs</b> for <code>plan.md</code> and <code>CLAUDE.md</code>; delete your feature’s row from the retired dashboard; delete <code>plans/add-foo.md</code> — it now lives as the change folder.' },
  { k: 'done', t: 'Validate &amp; merge', file: 'openspec validate add-foo --strict',
    d: 'Run <code>openspec validate add-foo --strict</code> until clean, then finish the merge. The feature is now an OpenSpec change — everyone happy.' },
];

const card = document.getElementById('card');
const dots = document.getElementById('dots');
const countEl = document.getElementById('walkCount');
let i = 0;

function render() {
  const s = STEPS[i];
  card.className = `card card--${s.k}`;
  card.innerHTML = `
    <div class="card__top">
      <span class="card__step">Step ${i + 1} / ${STEPS.length}</span>
      <code class="card__file">${s.file}</code>
    </div>
    <h3 class="card__t">${s.t}</h3>
    <p class="card__d">${s.d}</p>`;
  dots.innerHTML = STEPS.map((s2, j) =>
    `<button class="dot dot--${s2.k} ${j === i ? 'on' : ''} ${j < i ? 'past' : ''}" data-i="${j}" title="${s2.t}"></button>`).join('');
  countEl.textContent = `${i + 1} of ${STEPS.length}`;
  document.getElementById('prev').disabled = i === 0;
  document.getElementById('next').disabled = i === STEPS.length - 1;
}

document.getElementById('prev').addEventListener('click', () => { if (i > 0) { i--; render(); } });
document.getElementById('next').addEventListener('click', () => { if (i < STEPS.length - 1) { i++; render(); } });
dots.addEventListener('click', (e) => { const b = e.target.closest('.dot'); if (b) { i = Number(b.dataset.i); render(); } });
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowRight') document.getElementById('next').click();
  if (e.key === 'ArrowLeft') document.getElementById('prev').click();
});

render();
