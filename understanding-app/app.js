// Interactive model of the idea→task consumption lifecycle
// (openspec ideas-consume-on-promotion). No framework, no network — a pure
// in-memory toy of the real NotesService/TaskGraphService rules.

const initial = () => ({
  idea: { number: 12, text: 'Expose the Skarje toolbar button on the web', project: 'prg', priority: 3, active: true, consumedByTaskId: null },
  task: null, // { id, title, status }
});

let state = initial();
const $ = (id) => document.getElementById(id);

function log(msg) { $('log').textContent = msg; }

function render() {
  const { idea, task } = state;
  const consumed = idea.consumedByTaskId !== null;

  // Ideas list (default: hide consumed)
  const ideasCards = $('ideasCards');
  ideasCards.innerHTML = '';
  if (!consumed) {
    ideasCards.appendChild(ideaCard(idea));
    $('ideasCount').textContent = '1';
  } else {
    ideasCards.appendChild(empty('No ideas — the only one was promoted.'));
    $('ideasCount').textContent = '0';
  }

  // Consumed view (off by default)
  const showConsumed = $('showConsumed').checked;
  $('consumedWrap').hidden = !showConsumed;
  const cc = $('consumedCards');
  cc.innerHTML = '';
  if (consumed) {
    cc.appendChild(ideaCard(idea, true));
    $('consumedCount').textContent = '1';
  } else {
    cc.appendChild(empty('Nothing consumed yet.'));
    $('consumedCount').textContent = '0';
  }

  // Task board
  const tc = $('taskCards');
  tc.innerHTML = '';
  if (task) { tc.appendChild(taskCard(task)); $('tasksCount').textContent = '1'; }
  else { tc.appendChild(empty('No tasks yet.')); $('tasksCount').textContent = '0'; }

  // Buttons
  $('promote').disabled = consumed;      // already promoted
  $('complete').disabled = !task || task.status === 'done';
  $('delete').disabled = !task;
}

function ideaCard(idea, asConsumed) {
  const li = document.createElement('li');
  li.className = 'card' + (asConsumed ? ' card--consumed' : '');
  li.innerHTML =
    `<div class="card__h">#${idea.number} · ${idea.project} · priority ${idea.priority}</div>
     <div class="card__t">${escapeHtml(idea.text)}</div>
     <div class="card__meta">${
       asConsumed
         ? '→ became task: <b>' + escapeHtml(state.task ? state.task.title : '(task)') + '</b>'
         : '<span class="badge ' + (idea.active ? '' : 'badge--inactive') + '">' + (idea.active ? 'active' : 'inactive') + '</span>'
     }</div>`;
  return li;
}

function taskCard(task) {
  const li = document.createElement('li');
  li.className = 'card card--task' + (task.status === 'done' ? ' card--done' : '');
  li.innerHTML =
    `<div class="card__h">${task.id} · 💡 #${state.idea.number}</div>
     <div class="card__t">${escapeHtml(task.title)}</div>
     <div class="card__meta">status: <b>${task.status}</b> · from idea #${state.idea.number}</div>`;
  return li;
}

function empty(text) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = text; return li; }
function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// --- actions mirror the real rules ---
$('promote').onclick = () => {
  if (state.idea.consumedByTaskId) return;
  state.task = { id: 't-8f3a', title: state.idea.text, status: 'todo' };
  // AddNode(ideaId) → Consume: off the list, inactive, linked to the task.
  state.idea = { ...state.idea, consumedByTaskId: state.task.id, active: false };
  log('Promoted. The idea is consumed — off the Ideas list, linked to task t-8f3a. Tick “Show consumed” to see it.');
  render();
};

$('complete').onclick = () => {
  if (!state.task) return;
  state.task = { ...state.task, status: 'done' };
  // Status change, never a delete → idea stays consumed.
  log('Task completed. Completion is a status change, not a deletion — the idea stays consumed.');
  render();
};

$('delete').onclick = () => {
  if (!state.task) return;
  // DeleteNode → Unconsume(only for this task): idea returns inactive, fields intact.
  state.idea = { ...state.idea, consumedByTaskId: null, active: false };
  state.task = null;
  log('Task deleted. The idea returned to the list as INACTIVE, with its original text/project/priority.');
  render();
};

$('showConsumed').onchange = render;
$('reset').onclick = () => { state = initial(); log('Reset. Start by promoting the idea.'); render(); };

render();
