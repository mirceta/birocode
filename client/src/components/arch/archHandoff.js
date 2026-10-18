// "Use in the Arch chat" (openspec arch-prompts-tab): the Prompts tab hands a filled prompt to the Arch agent
// conversation's composer and asks the Management App to show the Arch tab. A sessionStorage slot (so a composer
// that mounts AFTER the hand-off still picks it up) plus a window event (so a mounted one picks it up at once).
// Framework-free; node-tested with a fake window.

export const HANDOFF_KEY = 'arch.handoffDraft';
export const HANDOFF_EVENT = 'arch:handoff-draft';
export const OPEN_TAB_EVENT = 'manage:open-tab';

const winOf = (w) => w || (typeof window !== 'undefined' ? window : null);

/** Put `text` into the Arch composer (appended to whatever is there) and open the Arch tab. */
export function handoffToArch(text, w) {
  const win = winOf(w);
  if (!win || !String(text || '').trim()) return false;
  try { win.sessionStorage?.setItem(HANDOFF_KEY, String(text)); } catch { /* private mode */ }
  try { win.dispatchEvent(new win.CustomEvent(HANDOFF_EVENT, { detail: { text: String(text) } })); } catch { /* no events */ }
  openManageTab('arch', win);
  return true;
}

/** The pending hand-off, consumed (null when none). */
export function takeHandoff(w) {
  const win = winOf(w);
  try {
    const t = win?.sessionStorage?.getItem(HANDOFF_KEY);
    if (t) win.sessionStorage.removeItem(HANDOFF_KEY);
    return t || null;
  } catch { return null; }
}

/** Ask the Management App to show one of its tabs (ignored outside it). */
export function openManageTab(tab, w) {
  const win = winOf(w);
  try { win?.dispatchEvent(new win.CustomEvent(OPEN_TAB_EVENT, { detail: { tab } })); return true; } catch { return false; }
}
