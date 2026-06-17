// Ideas "Active" section — plan explainer SPA. Self-contained, no libraries,
// relative URLs (served under /api/localview/<repo>/app/understanding/).
// Two pieces: (1) the view tabs, (2) a live mock of the Active/Backlog toggle so
// the behaviour is shown, not just described.

// ---- view tabs ----
const tabs = document.getElementById('tabs');
tabs.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-view]');
  if (!btn) return;
  for (const b of tabs.querySelectorAll('button')) b.classList.toggle('on', b === btn);
  for (const v of document.querySelectorAll('.view')) v.classList.toggle('on', v.dataset.view === btn.dataset.view);
});

// ---- interactive demo (view 2) ----
// Mirrors the real behaviour: each idea carries an `active` flag; toggling it
// regroups the list (Active pinned on top, Backlog below). Pure in-memory mock.
const ideas = [
  { id: 'a', text: 'Ship the Ideas Active section', active: false },
  { id: 'b', text: 'Replace the autopilot stub brain', active: false },
  { id: 'c', text: 'Drag-order ideas within a section', active: false },
  { id: 'd', text: 'Write the verify-ideas-active script', active: false },
];

const elActive = document.getElementById('demo-active');
const elBacklog = document.getElementById('demo-backlog');
const elActiveCount = document.getElementById('demo-active-count');
const elBacklogCount = document.getElementById('demo-backlog-count');
const elActiveEmpty = document.getElementById('demo-active-empty');

function row(idea) {
  const li = document.createElement('li');
  li.className = 'demo__idea';
  const span = document.createElement('span');
  span.textContent = idea.text;
  const btn = document.createElement('button');
  btn.className = 'mini' + (idea.active ? ' mini--on' : '');
  btn.textContent = idea.active ? '★ Active' : '☆ Activate';
  btn.title = idea.active ? 'Move out of Active' : 'Move into Active';
  btn.addEventListener('click', () => { idea.active = !idea.active; renderDemo(); });
  li.append(span, btn);
  return li;
}

function renderDemo() {
  if (!elActive) return; // demo only exists on the flow view
  const active = ideas.filter((i) => i.active);
  const backlog = ideas.filter((i) => !i.active);
  elActive.innerHTML = '';
  elBacklog.innerHTML = '';
  active.forEach((i) => elActive.appendChild(row(i)));
  backlog.forEach((i) => elBacklog.appendChild(row(i)));
  elActiveCount.textContent = active.length;
  elBacklogCount.textContent = backlog.length;
  elActiveEmpty.hidden = active.length > 0;
}

renderDemo();
