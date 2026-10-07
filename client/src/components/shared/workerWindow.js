// Per-agent tabs (Operator follow-up to board task afed9d6d): every repo agent
// gets its OWN named tab, and clicking that agent on a Kanban card FOCUSES its
// existing tab wherever it lives — any Chrome window, any monitor — without
// reloading it. This supersedes the first design (one shared "birocode-worker"
// window that every click renavigated).
//
// The mechanism, engine-verified in
// .claudeweb-preview/playwright/check-agent-tabs.mjs (6/6):
//  - window.open('', PER_AGENT_NAME): an EXISTING named tab is FOUND but NOT
//    navigated (empty URL = no reload; in-page state survives — proven); a
//    brand-new one comes back at about:blank and only then gets the deep link.
//  - w.focus() from the click's user gesture actually switches Chrome to that
//    tab — including a tab living in ANOTHER OS window (visibility=visible,
//    hasFocus=true measured after the click), so a tab dragged to a second
//    monitor keeps working.
//  - Distinct names never collide: two agents = two tabs, re-clicks never
//    duplicate (also proven in check-worker-window.mjs for the name mechanics:
//    cross-origin reach, association surviving an M reload).
//
// What "found" used to mean (fleet task 608f281a, the pers-dec report): a handle came back,
// so the click was declared done — whatever that tab showed. Three real situations then did
// NOTHING visible: the tab had been navigated elsewhere (it stayed there), the management page
// was itself living in the tab named for that agent (the handle was the caller), and a tab in
// another window whose focus() the browser ignored. Now the handle is READ, not trusted:
//  - the caller's own tab carries the name → the name is released and the agent opens in a
//    fresh tab (the dashboard is never navigated away);
//  - about:blank (new) or a same-origin page that is not the studio → navigated to the agent;
//  - the studio (same origin) or another machine's harness (cross-origin) → asked by message
//    to show the agent (DockContext answers with an ack) and focused;
//  - no handle → the pop-up was blocked.
// Every outcome is announced on the page as a CustomEvent (OPEN_AGENT_EVENT) so the surface
// that was clicked can say what happened and offer a plain link when the tab did not come to
// the front — a click never does nothing in silence.
//
// Known limit, by design of the platform: the name association is scoped to the opener's
// tab — a brand-new management tab (after closing the old one) is not "familiar" with old
// agent tabs and starts fresh ones (a plain reload keeps them).
// Must be called from a click handler (user gesture) or the popup blocker wins.

import { readPlacement, openInHarnessWindow, openAgentViaLauncher } from './harnessWindow.js';
import { OPEN_AGENT_MESSAGE, OPEN_AGENT_ACK, OPEN_AGENT_EVENT, agentOfUrl } from './agentLink.js';

export { OPEN_AGENT_EVENT } from './agentLink.js';

/** The per-agent window name for an assignee key ("sourceId|repoId"): stable,
 * distinct per agent, safe charset. Pure — unit-tested. */
export function agentTabName(key) {
  const k = (key || '').trim();
  if (!k) return null;
  return `birocode-agent-${k.replace(/[^\w.-]/g, '_')}`;
}

/** The name a management page takes when it has to give an agent's name back. */
export const DASHBOARD_TAB_NAME = 'birocode-dashboard';
/** How long a steered tab gets to acknowledge before the click is reported as unanswered. */
export const ACK_WAIT_MS = 900;

/** A same-origin href that is the harness studio — a page that can be steered to an agent
 * without a reload. A parked page (/api/health), a Local-tab app, the Management App cannot. */
export function isHarnessShellHref(href) {
  try {
    const p = new URL(href).pathname.replace(/\/+$/, '');
    return p.endsWith('/studio') || /\/studio\//.test(p + '/');
  } catch { return false; }
}

/**
 * What to do with the handle `window.open('', name)` returned (pure, unit-tested):
 *   blocked     — no handle (pop-up blocker);
 *   self        — the handle is the calling window: the page itself carries the agent's name;
 *   fresh       — a brand-new tab (about:blank): navigate it to the agent;
 *   renavigate  — an existing same-origin tab showing something other than the studio;
 *   steer       — the studio (same origin) or another machine's harness (cross-origin, href
 *                 unreadable): ask it to show the agent, focus it.
 */
export function openPlan({ handle, self, href }) {
  if (!handle) return 'blocked';
  if (self) return 'self';
  if (href === 'about:blank') return 'fresh';
  if (href === null || href === undefined) return 'steer';
  return isHarnessShellHref(href) ? 'steer' : 'renavigate';
}

/** Focus the agent's own tab, opening it at `url` only when it does not exist
 * yet; true when the browser gave us a handle (false = blocked / nothing to open).
 * `label` is the agent's name for the notice; `win` is the window (a parameter so tests
 * can fake it). */
export function focusAgentTab(key, url, label, win = (typeof window !== 'undefined' ? window : null)) {
  const name = agentTabName(key);
  if (!name || !url || !win) return false;
  // The Settings tab's placement (openspec management-settings-tab): the Operator may
  // route every badge click into ONE dedicated harness window on a chosen screen.
  const placement = readPlacement();
  if (placement.mode === 'window') {
    // One tab per agent INSIDE the harness window (openspec harness-window-agent-tabs): the
    // launcher tab there opens the agent's named tab the first time; after that the DASHBOARD
    // raises the existing tab from this click (openspec harness-window-reclick-raise: focus()
    // from the launcher never raised it). A popup-blocked launcher falls back to opening the tab here, beside the dashboard,
    // so a click never does nothing; the Settings tab says how to allow pop-ups.
    if (placement.viewer !== 'single') {
      openAgentViaLauncher(name, url, win).then((r) => {
        if (r === 'blocked' || r === 'no-launcher') {
          try { win.dispatchEvent(new CustomEvent('birocode:harness-window', { detail: { result: r, name, url } })); } catch { /* no CustomEvent */ }
          if (r === 'blocked') focusOwnTab(name, url, { key, label }, win);
        }
      });
      return true;
    }
    return openInHarnessWindow(url, placement, win);
  }
  return focusOwnTab(name, url, { key, label }, win);
}

/** Today's per-agent tab beside the dashboard — found and read (see the header), or opened. */
function focusOwnTab(name, url, ctx, win) {
  const announce = (result, extra) => {
    try { win.dispatchEvent(new CustomEvent(OPEN_AGENT_EVENT, { detail: { ...ctx, name, url, result, ...(extra || {}) } })); } catch { /* no CustomEvent */ }
  };
  let w = null;
  try { w = win.open('', name); } catch { w = null; }
  let href;
  if (w && w !== win) {
    try { href = w.location.href; } catch { href = null; }   // cross-origin: another machine's harness
  }
  const plan = openPlan({ handle: w, self: w === win, href });
  if (plan === 'blocked') { announce('blocked'); return false; }
  if (plan === 'self') {
    // The dashboard sits in the tab reserved for this agent (opened from a badge once, then
    // navigated here). Give the name back and open the agent beside it — never navigate away.
    try { win.name = DASHBOARD_TAB_NAME; } catch { /* read-only name */ }
    let fresh = null;
    try { fresh = win.open(url, name); } catch { fresh = null; }
    if (fresh) { try { fresh.focus(); } catch { /* best effort */ } }
    announce(fresh ? 'self-reopened' : 'blocked');
    return !!fresh;
  }
  if (plan === 'fresh' || plan === 'renavigate') {
    try { w.location.href = url; } catch { announce('silent'); return true; }
    try { w.focus(); } catch { /* best effort */ }
    announce(plan === 'fresh' ? 'opened' : 'renavigated');
    return true;
  }
  // steer: the tab shows a harness — ask it to switch to the agent, then focus it. The answer
  // (or its absence within ACK_WAIT_MS) and whether this page lost the foreground tell the
  // notice what to say.
  let acked = false;
  const onMessage = (e) => { if (e.source === w && e.data && e.data.type === OPEN_AGENT_ACK) acked = true; };
  try { win.addEventListener('message', onMessage); } catch { /* no events */ }
  try { w.postMessage({ type: OPEN_AGENT_MESSAGE, agent: agentOfUrl(url) }, '*'); } catch { /* best effort */ }
  try { w.focus(); } catch { /* focus is cross-origin-allowed but never guaranteed to raise */ }
  win.setTimeout(() => {
    try { win.removeEventListener('message', onMessage); } catch { /* no events */ }
    const doc = win.document;
    const raised = !!doc && (doc.visibilityState === 'hidden' || (typeof doc.hasFocus === 'function' && !doc.hasFocus()));
    announce(acked ? 'steered' : 'silent', { raised });
  }, ACK_WAIT_MS);
  return true;
}
