// The dashboard's one transient-message surface (fleet task 6ee431ea, openspec
// manage-toast-overlay): a fixed OVERLAY layer, so a message never inserts into the page
// flow and never shifts the GUI. Anything may call showToast(); the ToastLayer (mounted
// once) renders the stack. Pure helpers here, node-tested without a DOM.

export const TOAST_EVENT = 'birocode:toast';
/** How long a non-sticky toast lives (the hover pause stops this clock). */
export const TOAST_TTL_MS = 4000;
/** How many toasts stack before the oldest non-sticky is dropped. */
export const TOAST_MAX = 5;

let seq = 0;

/** Normalize a request into the toast the layer renders. Pure but for the id counter. */
export function makeToast(req) {
  return {
    id: `t${Date.now().toString(36)}-${(seq += 1)}`,
    text: String(req?.text || '').trim() || '…',
    // Sticky = stays until dismissed (the "cannot open: reason" family keeps its
    // persistence); everything else auto-evaporates after TOAST_TTL_MS.
    sticky: !!req?.sticky,
    // Optional one link, rendered inside the toast: { href, text }.
    link: req?.link && req.link.href ? { href: req.link.href, text: String(req.link.text || 'open ↗') } : null,
    // data-* attributes for test hooks ({ 'open-notice': 'opened', … }).
    data: req?.data && typeof req.data === 'object' ? req.data : {},
  };
}

/** Add a toast to the stack: newest last; past TOAST_MAX the oldest NON-STICKY goes
 * first (a sticky "cannot open" must not be pushed out by a burst of quiet ones). */
export function addToast(list, toast, max = TOAST_MAX) {
  const next = [...(list || []), toast];
  while (next.length > max) {
    const i = next.findIndex((t) => !t.sticky);
    next.splice(i >= 0 ? i : 0, 1);
  }
  return next;
}

/** Fire a toast from anywhere (no React needed): the mounted ToastLayer listens. */
export function showToast(req) {
  try { window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: req })); } catch { /* no CustomEvent */ }
}
