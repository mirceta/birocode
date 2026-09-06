// Task graph colour coding (openspec taskgraph-colours): a task's BORDER says which
// machine its agent runs on, its BACKGROUND which repository (by remote URL, so the
// same repo on two machines shares a colour). Colours come from one fixed hue
// palette assigned in first-seen order and persisted per device, so a machine or
// repo keeps its colour across reloads; unassigned tasks stay neutral.
//
// Pure module (no React, no DOM): unit-tested with `node --test`. The palette is a
// list of HUES; the CSS composes the actual colours (saturated dark hue for the
// border, pale tint for the background) and handles light/dark themes, which keeps
// borders and backgrounds legible together whatever the hue.

export const PALETTE_HUES = [212, 28, 140, 282, 52, 340, 172, 4, 96, 236, 316, 68];
export const PALETTE_SIZE = PALETTE_HUES.length;

/** A machine's key: the harness source id, or "self" for this box. */
export function machineKey(node) {
  if (!node || !node.repoId) return null; // an unassigned task has no machine
  return node.sourceId || 'self';
}

/** A repository's key: its remote URL (shared across machines) when known, else
 * the repo id; null for an unassigned task. */
export function repoKey(node, remoteUrlOf) {
  if (!node || !node.repoId) return null;
  const url = remoteUrlOf ? remoteUrlOf(node) : null;
  return normalizeRemote(url) || `id:${node.repoId}`;
}

/** "https://github.com/x/y.git" and "git@github.com:x/y.git" → "github.com/x/y". */
export function normalizeRemote(url) {
  if (!url || typeof url !== 'string') return null;
  let u = url.trim();
  if (!u) return null;
  u = u.replace(/^[a-z+]+:\/\//i, '');        // scheme
  u = u.replace(/^[^@/]+@/, '');              // user@
  u = u.replace(/^([^/:]+):(?!\/)/, '$1/');   // scp-style host:path → host/path
  u = u.replace(/\/+$/, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  return u.toLowerCase();
}

/**
 * Assign palette slots to keys, first-seen order, keeping every slot already in
 * `saved`. Returns a new map { key: slotIndex }. Slots are unique up to the palette
 * size; beyond it they wrap (the 13th key shares hue 0 — noted in the legend).
 */
export function assignSlots(keys, saved = {}) {
  const out = {};
  const used = new Set();
  for (const [k, v] of Object.entries(saved || {})) {
    if (Number.isInteger(v) && v >= 0) { out[k] = v; used.add(v % PALETTE_SIZE); }
  }
  let next = 0;
  for (const k of keys) {
    if (k == null || k in out) continue;
    // The first free slot in palette order; once all are taken, keep counting so
    // the wrap is deterministic (slot 12 → hue 0 again).
    while (next < PALETTE_SIZE && used.has(next)) next += 1;
    const slot = next < PALETTE_SIZE ? next : Object.keys(out).length;
    out[k] = slot;
    used.add(slot % PALETTE_SIZE);
    next += 1;
  }
  return out;
}

export function hueOf(slot) {
  return slot == null ? null : PALETTE_HUES[slot % PALETTE_SIZE];
}

/** The CSS custom properties for one task node. Neutral (no vars) when unassigned. */
export function nodeStyle(machineSlot, repoSlot) {
  const style = {};
  if (machineSlot != null) style['--tg-machine-h'] = String(hueOf(machineSlot));
  if (repoSlot != null) style['--tg-repo-h'] = String(hueOf(repoSlot));
  return style;
}

// ---- persistence (per device) -------------------------------------------------------

export const SLOTS_KEY = 'claudeweb_taskgraph_palette';

export function readSlots(storage) {
  try {
    const raw = storage?.getItem(SLOTS_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object') return { machines: v.machines || {}, repos: v.repos || {} };
  } catch {
    /* private mode / malformed */
  }
  return { machines: {}, repos: {} };
}

export function writeSlots(storage, slots) {
  try { storage?.setItem(SLOTS_KEY, JSON.stringify(slots)); } catch { /* private mode */ }
}
