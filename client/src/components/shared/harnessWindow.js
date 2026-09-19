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
// Re-click rule (measured 2026-09-19 in check-harness-reclick.mjs after the Operator saw the
// LAUNCHER come to the front on a second click): window.focus() from the launcher never raises
// an agent tab that is not already the active one — what raises an existing tab is
// window.open('', name) from a page holding the click's activation. So the DASHBOARD raises
// the existing tab itself after the launcher says "focused", and it keeps the launcher's
// handle instead of looking it up by name on every click (that lookup is what raised the
// launcher tab). A stray blank tab from a lookup that found nothing is closed at once.
//
// The choice is device-local (this browser, this screen setup), like every Management
// App layout setting. Pure helpers are node-tested; the browser-only parts take the window
// as a parameter so the tests can fake it.

export const PLACEMENT_KEY = 'manageapp.harnessWindow';
export const HARNESS_WINDOW_NAME = 'birocode-harness-window';
export const MODES = ['tabs', 'window'];
// How the dedicated window shows agents (openspec harness-window-agent-tabs):
//   'tabs'   — ONE TAB PER AGENT inside it. Measured in Chrome (check-harness-tabs.mjs): a tab
//              can only be opened into a window by a page living in that window, and Chrome
//              never adds tabs to a popup-style window — so the harness window is a NORMAL
//              window holding a small same-origin LAUNCHER tab; the dashboard keeps its handle
//              and asks it to open / focus the per-agent named tabs, which land next to it.
//              The Operator drags that window to the other monitor once (a normal window
//              cannot be placed by script) and allows pop-ups for this site once (the popup
//              blocker only lets the launcher open one tab per click IT received).
//   'single' — the earlier one viewer window, placed on the chosen screen, navigated per click.
export const VIEWERS = ['tabs', 'single'];
export const LAUNCHER_HOOK = '__birocodeOpenAgent';
export const LAUNCHER_QUERY = 'launcher';

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
    const viewer = VIEWERS.includes(v?.viewer) ? v.viewer : 'tabs';
    return { mode, viewer, screen: screenRecord(v?.screen) };
  } catch {
    return { mode: 'tabs', viewer: 'tabs', screen: null };
  }
}

export function savePlacement(p, storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  const clean = { mode: MODES.includes(p?.mode) ? p.mode : 'tabs', viewer: VIEWERS.includes(p?.viewer) ? p.viewer : 'tabs', screen: screenRecord(p?.screen) };
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

/** The launcher page's URL: this very page (same origin, same proxy prefix) with ?launcher=1. */
export function launcherUrl(win = typeof window !== 'undefined' ? window : null) {
  if (!win?.location) return null;
  return `${win.location.origin}${win.location.pathname}?${LAUNCHER_QUERY}=1`;
}

/** Whether this page IS the launcher (rendered instead of the dashboard). */
export function isLauncherPage(win = typeof window !== 'undefined' ? window : null) {
  try { return new URLSearchParams(win?.location?.search || '').get(LAUNCHER_QUERY) === '1'; } catch { return false; }
}

/** Install the launcher hook on `win`: `win.__birocodeOpenAgent(name, url)` opens the agent's
 * named tab in the LAUNCHER's window when it does not exist yet (fresh handle → navigated),
 * else only focuses it — never reloads. Returns 'opened' | 'focused' | 'blocked'. `onChange`
 * hears every call (the launcher page lists what it opened). */
export function installLauncher(win, onChange = null) {
  if (!win) return null;
  const opened = new Map(); // name → { url, at, hits }
  win[LAUNCHER_HOOK] = (name, url) => {
    if (!name || !url) return 'blocked';
    const w = win.open('', name);
    if (!w) { onChange?.({ name, url, result: 'blocked', opened: [...opened.values()] }); return 'blocked'; }
    let fresh = false;
    try { fresh = w.location.href === 'about:blank'; } catch { /* cross-origin: exists → focus only */ }
    if (fresh) { try { w.location.href = url; } catch { /* nothing more */ } }
    try { w.focus(); } catch { /* never guaranteed */ }
    const rec = opened.get(name) || { name, url, at: Date.now(), hits: 0 };
    rec.hits += 1; rec.last = Date.now(); if (fresh) rec.at = Date.now();
    opened.set(name, rec);
    const result = fresh ? 'opened' : 'focused';
    onChange?.({ name, url, result, opened: [...opened.values()] });
    return result;
  };
  return win[LAUNCHER_HOOK];
}

/** Per-agent tabs inside the dedicated harness window: find / create the launcher tab, then
 * ask it to open (first time) or focus (later) the agent's own named tab. The launcher is
 * created as a plain tab (no features — a popup-style window cannot hold tabs) next to the
 * dashboard; the Operator drags its window to the other monitor once. A brand-new launcher
 * is still loading, so the hook is awaited briefly (the fresh window carries the click's
 * activation for a few seconds). Resolves 'opened' | 'focused' | 'blocked' | 'no-launcher'
 * — 'blocked' = the launcher's window.open was popup-blocked (allow pop-ups for this site). */
export function openAgentViaLauncher(agentName, url, win = typeof window !== 'undefined' ? window : null, { waitMs = 4000, stepMs = 100 } = {}) {
  if (!win || !agentName || !url) return Promise.resolve('no-launcher');
  const h = launcherHandle(win);
  if (!h) return Promise.resolve('blocked');
  const ask = () => { try { return typeof h[LAUNCHER_HOOK] === 'function' ? h[LAUNCHER_HOOK](agentName, url) : null; } catch { return null; } };
  const done = (r) => { if (r === 'focused') raiseNamedTab(agentName, win); return r; };
  const first = ask();
  if (first) return Promise.resolve(done(first));
  // No hook yet: a fresh launcher is still loading; a launcher tab the Operator browsed away
  // from (same origin, another page) is sent back to the launcher URL.
  let href = null;
  try { href = h.location.href; } catch { href = null; /* another origin in the harness slot: replace it with our launcher */ }
  const wanted = launcherUrl(win);
  if (href === null || href === 'about:blank' || !(wanted && href.startsWith(wanted))) { try { h.location.href = wanted; } catch { return Promise.resolve('no-launcher'); } }
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      const r = ask();
      if (r) return resolve(done(r));
      if (Date.now() - t0 >= waitMs) return resolve('no-launcher');
      (win.setTimeout || setTimeout)(tick, stepMs);
    };
    (win.setTimeout || setTimeout)(tick, stepMs);
  });
}

/** The launcher's handle for this dashboard window: kept from the first lookup and reused
 * while that tab lives, because window.open('', name) on an EXISTING name brings that tab
 * to the front — on a re-click that raised the launcher instead of the agent. Looked up
 * again only when there is no live handle (first click, launcher closed). */
const launchers = new WeakMap();
export function launcherHandle(win) {
  if (!win) return null;
  const kept = launchers.get(win);
  if (kept && !kept.closed) return kept;
  const h = win.open('', HARNESS_WINDOW_NAME);
  if (h) launchers.set(win, h);
  return h;
}

/** Bring an EXISTING named tab to the front from the caller's own click: window.open('', name)
 * finds it (the dashboard is familiar with every tab its launcher opened) and Chrome activates
 * it wherever it lives; focus() alone does not. Only ever called for a tab the launcher just
 * reported as existing — if the lookup still came back blank (unfamiliar), that stray tab is
 * closed so a click never leaves an empty tab behind. True when the tab was raised. */
export function raiseNamedTab(name, win = typeof window !== 'undefined' ? window : null) {
  if (!win || !name) return false;
  let w = null;
  try { w = win.open('', name); } catch { return false; }
  if (!w) return false;
  let blank = false;
  try { blank = w.location.href === 'about:blank'; } catch { /* cross-origin: an existing tab on another machine's harness */ }
  if (blank) { try { w.close(); } catch { /* nothing more */ } return false; }
  try { w.focus(); } catch { /* never guaranteed */ }
  return true;
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
