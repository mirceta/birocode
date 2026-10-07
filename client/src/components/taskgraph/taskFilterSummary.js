// The folded filter bar's summary (openspec kanban-collapsible-filters): the active
// filters as small chips — one per selected value, the text search as one chip — each
// removable on its own, plus the fold state remembered per browser. Pure, no React:
// node-testable; TaskFilterBar renders it.

import { UNASSIGNED, emptyFilter } from './taskFilters.js';

export const FOLD_KEY = 'claudeweb_task_filters_fold';
export const COLLAPSED = 'collapsed';
export const EXPANDED = 'expanded';

/** The remembered fold state; collapsed when nothing was ever remembered. */
export function readFold(storage) {
  try {
    const v = storage?.getItem(FOLD_KEY);
    return v === EXPANDED ? EXPANDED : COLLAPSED;
  } catch {
    return COLLAPSED;
  }
}

export function writeFold(storage, state) {
  try { storage?.setItem(FOLD_KEY, state === EXPANDED ? EXPANDED : COLLAPSED); } catch { /* private mode */ }
}

// group → the word the chip leads with ("machine: spacex").
const KIND = { q: 'text', machines: 'machine', agents: 'agent', states: 'state', flags: 'flag' };
const ORDER = ['machines', 'agents', 'states', 'flags', 'q'];

/**
 * The active filters as chips, in the bar's own order (machines, agents, states,
 * flags, then the text). `labels` maps a group to a value → label function (the
 * state chips read the column labels, the flag chips their titles); unset groups show
 * the raw value, `unassigned` as "Unassigned". The graph's `hide` toggle is not a
 * filter and makes no chip.
 */
export function summaryChips(filter, labels = {}) {
  const f = filter || emptyFilter();
  const out = [];
  const label = (group, v) => (v === UNASSIGNED ? 'Unassigned' : (labels[group] ? labels[group](v) : v));
  for (const group of ORDER) {
    if (group === 'q') {
      const q = (f.q || '').trim();
      if (q) out.push({ group, value: q, kind: KIND.q, text: q });
      continue;
    }
    for (const v of f[group] || []) out.push({ group, value: v, kind: KIND[group], text: label(group, v) });
  }
  return out;
}

/** How many filters are active — the badge on the toggle. */
export function activeCount(filter) {
  return summaryChips(filter).length;
}

/** The filter without one chip's value (the chip's ×); the text chip clears the search. */
export function withoutChip(filter, chip) {
  const f = { ...(filter || emptyFilter()) };
  if (!chip) return f;
  if (chip.group === 'q') return { ...f, q: '' };
  if (!Array.isArray(f[chip.group])) return f;
  return { ...f, [chip.group]: f[chip.group].filter((v) => v !== chip.value) };
}

/** One line of words for the collapsed state: "machine: spacex · state: doing · text: prg". */
export function summaryLine(chips) {
  return (chips || []).map((c) => `${c.kind}: ${c.text}`).join(' · ');
}
