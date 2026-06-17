// OpenSpec decision — reconcile-to vs borrow-one-idea. Self-contained, no libs,
// relative URLs (served under /api/localview/<repo>/app/understanding/).
// Interactions: (1) view switcher, (2) per-card path tabs, (3) source-of-truth
// toggle, (4) "when would Path A win?" disclosure.

// ── 1) View switcher ─────────────────────────────────────────────
const nav = document.getElementById('nav');
nav.addEventListener('click', (e) => {
  const btn = e.target.closest('.nav__btn');
  if (!btn) return;
  const view = btn.dataset.view;
  nav.querySelectorAll('.nav__btn').forEach((b) => b.classList.toggle('is-active', b === btn));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('is-active', v.id === `view-${view}`));
});

// ── 2) Path card tabs (scoped per card) ──────────────────────────
document.querySelectorAll('[data-tabs]').forEach((tabs) => {
  const card = tabs.closest('.path');
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('.ptab');
    if (!b) return;
    const i = b.dataset.tab;
    tabs.querySelectorAll('.ptab').forEach((t) => t.classList.toggle('is-active', t === b));
    card.querySelectorAll('.ppanel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === i));
  });
});

// ── 3) Source-of-truth toggle ────────────────────────────────────
const stage = document.getElementById('truthStage');
const tverdict = document.getElementById('truthVerdict');
const TRUTH = {
  b: { txt: '✓ One source of truth — everything stays in the harness. No drift to fight.', col: 'var(--add)' },
  a: { txt: '✗ Two stores — OpenSpec dirs AND our plans/harness. This is the drift we keep fighting (unless we rebuild harness rendering around OpenSpec).', col: 'var(--gap)' },
};
function setTruth(which) {
  stage.dataset.truth = which;
  document.querySelectorAll('.tbtn').forEach((b) => b.classList.toggle('is-active', b.dataset.truth === which));
  tverdict.textContent = TRUTH[which].txt;
  tverdict.style.color = TRUTH[which].col;
}
document.querySelector('.truth__btns').addEventListener('click', (e) => {
  const b = e.target.closest('.tbtn');
  if (b) setTruth(b.dataset.truth);
});
setTruth('b');

// ── 4) "When would Path A win?" disclosure ───────────────────────
const whenBtn = document.getElementById('whenABtn');
const whenBody = document.getElementById('whenABody');
whenBtn.addEventListener('click', () => {
  const open = whenBody.hidden === false;
  whenBody.hidden = open;
  whenBtn.textContent = (open ? 'When would Path A actually win? ▾' : 'When would Path A actually win? ▴');
});
