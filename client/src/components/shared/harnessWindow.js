// Where the Kanban badge links open (openspec management-settings-tab, fleet task a434653b).
//
// The Operator runs two monitors: the Management App on one, the fleet harnesses on the
// other. A badge click on a card opens that agent's harness tab — and a web page can only
// ever open it in the window that hosts the page (a named tab lands in the opener's Chrome
// window; a page can neither list Chrome's windows nor push a tab into another one — that
// is an extension's power, chrome.windows / chrome.tabs). What a page CAN do:
//
//   - "tabs"   (default, today's behaviour): one named tab per agent, in THIS window,
//              focused wherever the Operator dragged it (workerWindow.js);
//   - "window": ONE dedicated, named harness window — created with position + size
//              features, which makes Chrome open a separate (popup-style) window that
//              keeps its place for as long as it lives; every badge click navigates it to
//              that agent's harness and focuses it. With the Window Management API
//              (window.getScreenDetails — a secure context + the Operator's one-time
//              permission) the window is placed on the CHOSEN SCREEN; without it Chrome
//              clamps the position to the current screen and the Operator drags the window
//              to the other monitor once — it stays there for every later click.
//
// The choice is device-local (this browser, this screen setup), like every Management
// App layout setting. Pure helpers are node-tested; the browser-only parts take the window
// as a parameter so the tests can fake it.

export const PLACEMENT_KEY = 'manageapp.harnessWindow';
export const HARNESS_WINDOW_NAME = 'birocode-harness-window';
export const MODES = ['tabs', 'window'];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** A screen as the setting stores it: the fields we place a window with, plus a label. */
export function screenRecord(s) {
  if (!s) return null;
  const rec = {
    label: typeof s.label === 'string' && s.label.trim() ? s.label.trim() : null,
    left: num(s.left), top: num(s.top), width: num(s.width), height: num(s.height),
    availLeft: num(s.availLeft), availTop: num(s.availTop), availWidth: num(s.availWidth), availHeight: num(s.availHeight),
    isPrimary: !!s.isPrimary, isInternal: !!s.isInternal,
  };
  if (rec.width === null || rec.height === null) return null;
  return rec;
}

/** "DELL U2419H · 1920×1080 at (1920, 0) · primary" */
export function screenSummary(s) {
  if (!s) return '';
  const parts = [s.label || 'screen', `${s.width}×${s.height} at (${s.left ?? 0}, ${s.top ?? 0})`];
  if (s.isPrimary) parts.push('primary');
  if (s.isInternal) parts.push('built-in');
  return parts.join(' · ');
}

/** The persisted choice: { mode, screen }. Unknown / broken storage reads as "tabs". */
export function readPlacement(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  try {
    const raw = storage?.getItem(PLACEMENT_KEY);
    const v = raw ? JSON.parse(raw) : null;
    const mode = MODES.includes(v?.mode) ? v.mode : 'tabs';
    return { mode, screen: screenRecord(v?.screen) };
  } catch {
    return { mode: 'tabs', screen: null };
  }
}

export function savePlacement(p, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  const clean = { mode: MODES.includes(p?.mode) ? p.mode : 'tabs', screen: screenRecord(p?.screen) };
  try { storage?.setItem(PLACEMENT_KEY, JSON.stringify(clean)); } catch { /* private mode */ }
  return clean;
}

/** The window.open features that place the dedicated window on `screen` (its work area
 * when known — the taskbar stays visible). With no screen: a sized window on the current
 * screen, for the Operator to drag once. Chrome treats any sized/positioned features as a
 * request for a separate window — that is the point. */
export function featuresFor(screen) {
  const s = screen || null;
  const left = s ? (s.availLeft ?? s.left ?? 0) : 0;
  const top = s ? (s.availTop ?? s.top ?? 0) : 0;
  const width = s ? (s.availWidth ?? s.width) : 1280;
  const height = s ? (s.availHeight ?? s.height) : 900;
  return `popup=1,left=${left},top=${top},width=${width},height=${height}`;
}

/** Can this page pick screens? The Window Management API needs a secure context (https
 * or localhost) and Chrome 100+; the reason is what the Settings tab shows instead. */
export function screenPicking(win = typeof window !== 'undefined' ? window : null) {
  if (!win) return { available: false, secure: false, reason: 'no window' };
  const secure = !!win.isSecureContext;
  const hasApi = typeof win.getScreenDetails === 'function';
  const extended = !!win.screen?.isExtended;
  if (!hasApi) return { available: false, secure, extended, reason: secure ? 'this browser has no Window Management API (Chrome 100+ has it)' : 'the Window Management API only exists on a secure page — open the dashboard over https or from localhost to pick a screen' };
  return { available: true, secure, extended, reason: extended ? null : 'only one screen is attached right now' };
}

/** The screens the browser reports, as records. Must be called from a click (it prompts
 * for the window-management permission the first time). Throws the browser's error. */
export async function listScreens(win = typeof window !== 'undefined' ? window : null) {
  if (!win || typeof win.getScreenDetails !== 'function') return [];
  const details = await win.getScreenDetails();
  return (details?.screens || []).map(screenRecord).filter(Boolean);
}

/** Open (or reuse) the dedicated harness window and show `url` in it. The window is
 * created with the placement's features; an existing one keeps wherever it is and is only
 * navigated + focused. True when the browser gave us a handle. */
export function openInHarnessWindow(url, placement, win = typeof window !== 'undefined' ? window : null) {
  if (!win || !url) return false;
  const w = win.open('', HARNESS_WINDOW_NAME, featuresFor(placement?.screen));
  if (!w) return false;
  let already = false;
  try { already = w.location.href === url; } catch { /* cross-origin: another machine's harness — navigate it */ }
  if (!already) { try { w.location.href = url; } catch { /* nothing more we can do */ } }
  try { w.focus(); } catch { /* focus never guaranteed */ }
  return true;
}
