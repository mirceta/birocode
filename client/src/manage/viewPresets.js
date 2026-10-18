// Layout presets for the Management dashboard (fleet task d6e499cd, openspec manage-view-presets).
//
// A VIEW is what ManageApp already keeps per device: the panes open side by side (order minus
// hidden), and the divider positions (flex weights). A PRESET freezes one view:
//   { id, name, auto, panes: [{ tab, sel? }], fractions: [..sum 1..], created, updated }
// Fractions, not pixels or raw weights, so a preset survives window resizes and weight drift.
// One pane = a tabs-layout view; two or more = panes layout. Pure: no React, no storage.

export const PRESETS_KEY = 'manageapp.viewPresets';
export const ACTIVE_KEY = 'manageapp.activePreset';
export const MAX_PRESETS = 9; // Alt+1..9
const EPS = 0.01;

/** The view on screen now, as { panes: [tab], fractions }. */
export function currentView({ layout, wide, tab, order, hidden, weights }) {
  const panes = layout === 'panes' && wide !== false;
  const keys = panes ? order.filter((k) => !hidden.includes(k)) : [tab];
  const w = keys.map((k) => (weights?.[k] > 0 ? weights[k] : 1));
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  return { panes: keys, fractions: w.map((x) => x / sum) };
}

/** "Status | Kanban | Subagents" from the tab labels (counts stripped: "Subagents 3" -> "Subagents"). */
export function autoName(keys, labelOf) {
  return keys.map((k) => String(labelOf ? labelOf(k) : k).replace(/\s+\d+$/, '').trim() || k).join(' | ');
}

const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A new preset from the current view (sel = the Subagents conversation worth restoring, if any). */
export function capture(view, { labelOf, sel, now = Date.now(), id = newId() } = {}) {
  return {
    id,
    name: autoName(view.panes, labelOf),
    auto: true,
    panes: view.panes.map((tab) => (tab === 'subagents' && sel ? { tab, sel } : { tab })),
    fractions: view.fractions.map((f) => Math.round(f * 10000) / 10000),
    created: now,
    updated: now,
  };
}

/** Overwrite a preset's view (rename kept unless the name was still the auto one). */
export function updateFrom(preset, view, { labelOf, sel, now = Date.now() } = {}) {
  const fresh = capture(view, { labelOf, sel, now, id: preset.id });
  return { ...fresh, name: preset.auto ? fresh.name : preset.name, auto: preset.auto, created: preset.created };
}

export function rename(preset, name, now = Date.now()) {
  const n = String(name || '').trim();
  return n ? { ...preset, name: n, auto: false, updated: now } : preset;
}

/**
 * What applying a preset does to ManageApp's state. Tabs that no longer exist are skipped and
 * reported in `missing`; the remaining fractions are renormalised. Returns null when nothing is left.
 * The applied panes go first in `order`, in preset order, the rest keep their relative order behind.
 */
export function applyPlan(preset, allTabs, prevOrder = allTabs) {
  const kept = [];
  const fr = [];
  const missing = [];
  (preset?.panes || []).forEach((p, i) => {
    const k = typeof p === 'string' ? p : p?.tab;
    if (allTabs.includes(k) && !kept.includes(k)) { kept.push(k); fr.push(preset.fractions?.[i] > 0 ? preset.fractions[i] : 1); } else if (k) missing.push(k);
  });
  if (!kept.length) return { missing, empty: true };
  const sum = fr.reduce((a, b) => a + b, 0) || 1;
  const order = [...kept, ...prevOrder.filter((k) => !kept.includes(k) && allTabs.includes(k))];
  for (const k of allTabs) if (!order.includes(k)) order.push(k);
  const weights = {};
  kept.forEach((k, i) => { weights[k] = (fr[i] / sum) * kept.length; });
  const sel = (preset.panes || []).find((p) => p?.tab === 'subagents' && p.sel)?.sel || null;
  return {
    layout: kept.length > 1 ? 'panes' : 'tabs',
    tab: kept[0],
    order,
    hidden: allTabs.filter((k) => !kept.includes(k)),
    weights,
    sel,
    missing,
    empty: false,
  };
}

/** True when the view on screen is no longer what the preset says (panes, order or dividers). */
export function isModified(preset, view, allTabs) {
  if (!preset) return false;
  const plan = applyPlan(preset, allTabs);
  if (plan.empty) return true;
  const want = plan.order.slice(0, plan.order.length - plan.hidden.length);
  if (want.length !== view.panes.length || want.some((k, i) => view.panes[i] !== k)) return true;
  const sum = want.reduce((a, k) => a + plan.weights[k], 0);
  return want.some((k, i) => Math.abs(plan.weights[k] / sum - view.fractions[i]) > EPS);
}

export function move(list, id, dir) {
  const i = list.findIndex((p) => p.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Sanitise a stored / fetched list: well-formed presets only, at most MAX_PRESETS. */
export function cleanList(v) {
  if (!Array.isArray(v)) return [];
  const seen = new Set();
  return v.filter((p) => p && typeof p.id === 'string' && !seen.has(p.id) && seen.add(p.id)
    && typeof p.name === 'string' && Array.isArray(p.panes) && p.panes.length > 0).slice(0, MAX_PRESETS);
}

/** Stable comparison of two lists (order matters: it is the tab strip order). Compares what a preset
 * means — not key order or the hub's float rounding — so a list round-tripped through the hub stays "same". */
export function sameList(a, b) {
  const essence = (l) => JSON.stringify(cleanList(l).map((p) => [p.id, p.name, !!p.auto,
    p.panes.map((x) => [typeof x === 'string' ? x : x?.tab, x?.sel || null]), (p.fractions || []).map((f) => Math.round(f * 1000))]));
  return essence(a) === essence(b);
}

/**
 * Sync: the union of the browser's and the hub's presets, matched by id. The BROWSER copy wins
 * on conflict; hub-only presets are appended (up to MAX_PRESETS) so nothing saved elsewhere is lost.
 */
export function mergeBrowserWins(local, hub) {
  const out = cleanList(local);
  for (const p of cleanList(hub)) if (!out.some((q) => q.id === p.id) && out.length < MAX_PRESETS) out.push(p);
  return out;
}

/** Alt+1..9 picks a preset, Alt+Shift+S saves the view (Ctrl+1..9 is reserved by the browser). */
export function shortcutOf(e) {
  if (!e?.altKey || e.ctrlKey || e.metaKey) return null;
  if (e.shiftKey && (e.key === 'S' || e.key === 's' || e.code === 'KeyS')) return { save: true };
  const m = /^Digit([1-9])$/.exec(e.code || '') || (!e.shiftKey && /^([1-9])$/.exec(e.key || ''));
  return m ? { index: Number(m[1]) - 1 } : null;
}
