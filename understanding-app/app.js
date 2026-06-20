// Control vs Console — same thing, or two axes? Self-contained, no libs,
// relative URLs (served under /api/localview/<repo>/app/understanding/).
// Control = the one-time port project (5 phases, ends). Console = the
// recurring jobs (5 workflows, forever). They overlap only where a phase
// happens to be a job. Click a node to trace its counterpart.

const PHASES = [
  { id: 'p0', n: 0, t: 'Init & foundation', sub: '½ day', link: 'w-setup' },
  { id: 'p1', n: 1, t: 'Backfill the baseline', sub: '2–4 days', link: 'w-backfill' },
  { id: 'p2', n: 2, t: 'Adopt the change lifecycle', sub: '1 day + ongoing', link: 'w-change' },
  { id: 'p3', n: 3, t: 'Harness rendering', sub: '2–3 days', link: null },
  { id: 'p4', n: 4, t: 'Migrate / retire old convention', sub: 'point of no return', link: null, danger: true },
];
const FLOWS = [
  { id: 'w-setup', t: 'Set up the tool', link: 'p0' },
  { id: 'w-inspect', t: 'Inspect the living truth', link: null },
  { id: 'w-change', t: 'Make a change, end to end', link: 'p2' },
  { id: 'w-backfill', t: 'Backfill the baseline', link: 'p1' },
  { id: 'w-handoff', t: 'Hand off to an agent', link: null },
];

// Phase 0's five tracked steps; cmd flags the one that is an OpenSpec command.
const Z0 = [
  { t: 'Pin the CLI (devDependency)', k: 'npm' },
  { t: 'Run <code>openspec init --tools claude</code>', k: 'cmd' },
  { t: 'Reconcile <code>.claude/</code> (no skill collision)', k: 'hand' },
  { t: 'Commit the <code>openspec/</code> tree', k: 'git' },
  { t: 'Update <code>CLAUDE.md</code> to point at /opsx', k: 'hand' },
];
// Console's set-up buttons; match flags the one that maps to a Phase-0 step.
const Z1 = [
  { t: '<code>openspec --version</code>', note: 'extra — confirm it’s installed', k: 'extra' },
  { t: '<code>openspec init --tools claude</code>', note: 'matches Phase 0 step 2', k: 'match' },
  { t: '<code>openspec update</code>', note: 'extra — refresh after a CLI upgrade', k: 'extra' },
];

const phasesEl = document.getElementById('phases');
const flowsEl = document.getElementById('flows');

phasesEl.innerHTML = PHASES.map((p) => `
  <li class="node node--phase ${p.danger ? 'node--danger' : ''} ${p.link ? '' : 'node--solo'}"
      data-id="${p.id}" data-link="${p.link || ''}">
    <span class="node__n">${p.n}</span>
    <span class="node__t"><b>${p.t}</b><span>${p.sub}</span></span>
    <span class="node__badge">${p.link ? 'pairs ↔' : 'project-only'}</span>
  </li>`).join('');

flowsEl.innerHTML = FLOWS.map((w) => `
  <li class="node node--flow ${w.link ? '' : 'node--solo'}" data-id="${w.id}" data-link="${w.link || ''}">
    <span class="node__t"><b>${w.t}</b></span>
    <span class="node__badge">${w.link ? '↔ pairs' : 'job-only'}</span>
  </li>`).join('');

document.getElementById('z0').innerHTML = Z0.map((s) =>
  `<li class="zrow zrow--${s.k}"><span class="ztag ztag--${s.k}">${ZLBL(s.k)}</span><span>${s.t}</span></li>`).join('');
document.getElementById('z1').innerHTML = Z1.map((s) =>
  `<li class="zrow zrow--${s.k}"><span class="ztag ztag--${s.k}">${s.k === 'match' ? '✓ maps' : '+ extra'}</span><span>${s.t}<i class="znote">${s.note}</i></span></li>`).join('');

function ZLBL(k) {
  return { cmd: '✓ cmd', npm: 'npm', hand: 'by hand', git: 'git' }[k] || k;
}

// ── Click to trace the pairing ────────────────────────────────────
const all = () => document.querySelectorAll('.node');
function clear() { all().forEach((n) => n.classList.remove('on', 'pair', 'fade')); }
document.getElementById('map').addEventListener('click', (e) => {
  const node = e.target.closest('.node');
  if (!node) { clear(); return; }
  const link = node.dataset.link;
  clear();
  if (!link) { node.classList.add('on'); all().forEach((n) => { if (n !== node) n.classList.add('fade'); }); return; }
  const mate = document.querySelector(`.node[data-id="${link}"]`);
  node.classList.add('on');
  if (mate) mate.classList.add('pair');
  all().forEach((n) => { if (n !== node && n !== mate) n.classList.add('fade'); });
});
