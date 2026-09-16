// Rename / describe a Kanban card (fleet task 576ead63): the pure bits of the inline
// editors — what counts as a savable title, what a key press means in the title input
// vs the description textarea, and whether a draft actually changed. Framework-free so
// they unit-test under `node --test`, like kanbanColumns.js / kanbanLayout.js.
//
// The save itself is the board's existing operator PATCH on /api/taskgraph/nodes/{id}
// with { title } or { note } — the SAME TaskGraphService.UpdateNode the arch's
// update_task title/note funnels into. Only the display text changes: the task id, and
// so the #ref shown on the card, never do.

/** The title to save: trimmed, non-empty; null means "nothing savable" (the server
 * refuses a blank title too). */
export function cleanTitle(draft) {
  const t = String(draft ?? '').trim();
  return t.length ? t : null;
}

/** The note to save: trimmed; '' means "clear the description" (the server stores null). */
export function cleanNote(draft) {
  return String(draft ?? '').trim();
}

/** What a key press means in an editor: 'save' | 'cancel' | null.
 * Title input: Enter saves, Esc cancels. Description textarea: Enter is a newline, so
 * Ctrl/⌘+Enter saves, Esc cancels. An IME composition's Enter is ignored. */
export function editKey(e, kind = 'input') {
  if (!e || !e.key) return null;
  if (e.key === 'Escape') return 'cancel';
  if (e.key !== 'Enter' || e.isComposing) return null;
  if (kind === 'textarea') return e.ctrlKey || e.metaKey ? 'save' : null;
  return 'save';
}

export function titleChanged(draft, current) {
  const t = cleanTitle(draft);
  return t !== null && t !== String(current ?? '').trim();
}

export function noteChanged(draft, current) {
  return cleanNote(draft) !== cleanNote(current);
}
