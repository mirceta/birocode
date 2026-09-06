// The Kanban's columns, as one pure module (openspec task-filters): the board renders
// them, the filter bar's State chips follow them, and the Task graph reads a task's
// "state" through the same columnOf — so a column added here shows up everywhere.
//
// Columns = statuses, the delivery lifecycle (openspec kanban-lifecycle-columns):
// Todo · Doing · Committed (on a branch, NOT on origin) · PR opened · PR merged · Done.
// Assignment is a chip on the card, not a column.
export const COLUMNS = [
  ['todo', 'Todo', 'not started; assign + the arch pings it'],
  ['doing', 'In progress', 'the assignee has the task'],
  ['committed', 'Committed', 'work committed on a branch, not yet on origin'],
  ['pr-opened', 'PR opened', 'branch pushed, PR exists'],
  ['pr-merged', 'PR merged', 'merged into the default branch'],
  ['done', 'Done', 'merged and live where the work was done'],
];
export const STATUS_KEYS = COLUMNS.map(([k]) => k);

/** Delivered = the merge is real (pr-merged) or the work is live (done). */
export const DELIVERED = (s) => s === 'pr-merged' || s === 'done';

/** The column a task sits in: its status, or Todo for anything unknown. */
export function columnOf(n) {
  return n && STATUS_KEYS.includes(n.status) ? n.status : 'todo';
}

/** The label of a column key ("doing" → "In progress"); an unknown key is shown as-is. */
export function columnLabel(key) {
  const c = COLUMNS.find(([k]) => k === key);
  return c ? c[1] : key;
}
