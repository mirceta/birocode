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

/** Every assignee's colour keys (openspec task-multi-assignee): the recorded list when
 * the task has one, else the legacy single assignee; each with its machineKey / repoKey. */
export function assigneeKeys(node, remoteUrlOf) {
  const list = Array.isArray(node?.assignees) && node.assignees.length > 0
    ? node.assignees
    : (node?.repoId ? [{ sourceId: node.sourceId || null, repoId: node.repoId, status: node.status }] : []);
  return list.map((a) => {
    const sub = { repoId: a.repoId, sourceId: a.sourceId || null };
    return { ...a, sourceId: sub.sourceId, status: a.status || 'todo', machineKey: machineKey(sub), repoKey: repoKey(sub, remoteUrlOf) };
  });
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

// ---- agent identity marks (fleet task 4ddcfce3) -------------------------------------
//
// Colour alone stops distinguishing agents once ~6 of them share a hue (the same repo
// on many machines, or the 12-hue palette wrapping). Every agent therefore also gets a
// second, colour-independent dimension, rendered by the SAME badge in Fleet Status and
// on the Kanban cards: a GLYPH (one of 16 geometric shapes) and a MONOGRAM
// ("rz/prg2" = machine skeleton / repo prefix + handle index). Both are pure functions
// of the agent's stable identity — its machine key + repo key and its labels — never of
// list order or persisted state, so the same agent shows the same mark on every device,
// after every reload, in both views. Hue + glyph + monogram together are unique even
// when the hue repeats; the monogram alone is readable without colour.

/** 16 shapes that render alike in system fonts and stay distinct at 11 px. */
export const GLYPHS = ['●', '■', '▲', '◆', '★', '✚', '⬟', '⬢', '✦', '◐', '◑', '◩', '◪', '▼', '⬖', '✖'];

/** FNV-1a 32-bit over UTF-16 code units — small, stable, dependency-free. */
export function hashKey(s) {
  let h = 0x811c9dc5;
  const str = String(s ?? '');
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The agent's identity key: machine key + repo key (what both views already derive). */
export function agentKey(machineKey_, repoKey_) {
  return `${machineKey_ ?? ''}|${repoKey_ ?? ''}`;
}

/** The glyph of an agent — a pure function of its identity key. */
export function glyphOf(machineKey_, repoKey_) {
  return GLYPHS[hashKey(agentKey(machineKey_, repoKey_)) % GLYPHS.length];
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

/** A machine label's 2-letter skeleton: first letter + first consonant after it, vowels
 * only when nothing else is left ("razvoj2016" → "rz", "living room" → "lv", "laptop" →
 * "lp", "MONSTER" → "mn", "DESKTOP-POAPPP3" → "ds"). */
export function abbrMachine(label) {
  const letters = String(label ?? '').toLowerCase().replace(/[^a-z]/g, '');
  if (!letters) return '??';
  const first = letters[0];
  const rest = letters.slice(1);
  const consonants = [...rest].filter((c) => !VOWELS.has(c));
  const vowels = [...rest].filter((c) => VOWELS.has(c));
  return (first + consonants.concat(vowels).join('')).slice(0, 2).padEnd(2, first);
}

/** A repo handle's short form: the repo part of "machine/slug#k" — a single word keeps
 * its first three letters, a multi-word slug its initials (max 3) — plus the handle index
 * when there is one ("prg" → "prg", "prg#2" → "prg2", "game-arcade" → "ga", "web" → "web"). */
export function abbrRepo(handleOrName) {
  let s = String(handleOrName ?? '').trim();
  if (s.includes('/')) s = s.slice(s.lastIndexOf('/') + 1);
  const m = /^(.*?)(?:#(\d+))?$/.exec(s);
  const slug = (m?.[1] ?? s).toLowerCase();
  const idx = m?.[2] ?? '';
  const words = slug.split(/[^a-z0-9]+/).filter(Boolean);
  let core;
  if (words.length === 0) core = '?';
  else if (words.length === 1) core = words[0].slice(0, 3);
  else core = words.slice(0, 3).map((w) => w[0]).join('');
  return core + idx;
}

/** "rz/prg2": the monogram of an agent from its machine label and repo handle. */
export function monogramOf(machineLabel, repoHandleOrName) {
  return `${abbrMachine(machineLabel)}/${abbrRepo(repoHandleOrName)}`;
}

/**
 * The shared identity mark of one agent, rendered identically by Fleet Status and the
 * Kanban cards: { key, glyph, monogram, label }. `label` is the full handle for the
 * title / aria-label, so the badge is identifiable without colour AND fully named.
 */
export function agentMark(machineKey_, repoKey_, machineLabel, repoHandleOrName) {
  const key = agentKey(machineKey_, repoKey_);
  const handle = String(repoHandleOrName ?? '');
  const label = handle.includes('/') ? handle : `${machineLabel ?? ''}/${handle}`;
  return { key, glyph: glyphOf(machineKey_, repoKey_), monogram: monogramOf(machineLabel, repoHandleOrName), label };
}
