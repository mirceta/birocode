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
// Known limits, by design of the platform:
//  - the name association is scoped to the opener's tab — a brand-new management
//    tab (after closing the old one) is not "familiar" with old agent tabs and
//    starts fresh ones (a plain reload keeps them);
//  - an existing tab is focused AS-IS (never renavigated), so if you browsed it
//    somewhere else it comes back wherever you left it — predictable, no lost work.
// Must be called from a click handler (user gesture) or the popup blocker wins.

import { readPlacement, openInHarnessWindow } from './harnessWindow.js';

/** The per-agent window name for an assignee key ("sourceId|repoId"): stable,
 * distinct per agent, safe charset. Pure — unit-tested. */
export function agentTabName(key) {
  const k = (key || '').trim();
  if (!k) return null;
  return `birocode-agent-${k.replace(/[^\w.-]/g, '_')}`;
}

/** Focus the agent's own tab, opening it at `url` only when it does not exist
 * yet; true when the browser gave us a handle (false = blocked / nothing to open). */
export function focusAgentTab(key, url) {
  const name = agentTabName(key);
  if (!name || !url) return false;
  // The Settings tab's placement (openspec management-settings-tab): the Operator may
  // route every badge click into ONE dedicated harness window on a chosen screen.
  const placement = readPlacement();
  if (placement.mode === 'window') return openInHarnessWindow(url, placement, window);
  const w = window.open('', name);
  if (!w) return false;
  try {
    // Same-origin (or brand-new about:blank) handle: navigate ONLY the fresh one.
    if (w.location.href === 'about:blank') w.location.href = url;
  } catch {
    // Cross-origin handle: the tab already shows another machine's harness — just focus.
  }
  try { w.focus(); } catch { /* focus is cross-origin-allowed but never guaranteed to raise */ }
  return true;
}
