// The Kanban's columns, as one pure module (openspec task-filters): the board renders
// them, the filter bar's State chips follow them, and the Task graph reads a task's
// "state" through the same columnOf — so when the Kanban lifecycle change adds
// columns (committed, pr-opened, pr-merged…) here, every chip and count follows.
//
// Columns: Backlog (todo, nobody assigned) · Assigned (todo, has an assignee — the
// arch pings these) · In progress (doing) · Done.
export const COLUMNS = [
  ['backlog', 'Backlog', 'todo, nobody assigned yet'],
  ['assigned', 'Assigned', 'todo with an assignee — the arch pings these'],
  ['doing', 'In progress', 'the assignee has the task'],
  ['done', 'Done', ''],
];

/** The column a task sits in. */
export function columnOf(n) {
  if (!n) return 'backlog';
  if (n.status === 'done') return 'done';
  if (n.status === 'doing') return 'doing';
  return n.repoId ? 'assigned' : 'backlog';
}

/** The label of a column key ("doing" → "In progress"); an unknown key is shown as-is. */
export function columnLabel(key) {
  const c = COLUMNS.find(([k]) => k === key);
  return c ? c[1] : key;
}
