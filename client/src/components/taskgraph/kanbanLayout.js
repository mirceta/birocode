// The Kanban column LAYOUT model (fleet task 0a57d282): which lifecycle columns are
// shown and how wide each one is. Pure and framework-free (node --test), the same way
// kanbanColumns.js / taskFilters.js are: the board holds a LIVE layout the Operator edits
// through the column toggles and the drag handles, and a SAVED layout persisted
// server-side (GET/PUT /api/taskgraph/layout — this harness's kanban-layout.json, on
// purpose outside the fleet-synced graph). "Save layout" copies live → saved; "Restore
// layout" copies saved → live, exactly; on load the live layout starts from the saved
// one, so the saved layout is what survives a reload.
//
// Hidden columns' cards are simply not rendered in this view — nothing is moved or
// deleted, and the filter bar's State chips (which follow the same columns) still count
// them. Widths are per column, in px, clamped to [MIN_WIDTH, MAX_WIDTH]; a column
// without a stored width uses DEFAULT_WIDTH. The server applies the same normalisation
// (KanbanLayoutService.Normalize) so both ends agree on what a layout can hold.
import { STATUS_KEYS } from './kanbanColumns.js';

export const DEFAULT_WIDTH = 240;
export const MIN_WIDTH = 150;
export const MAX_WIDTH = 900;

/** Every column shown, no custom widths — the board as it was before layouts existed. */
export function defaultLayout() {
  return { visible: [...STATUS_KEYS], widths: {} };
}

export function clampWidth(px) {
  const n = Math.round(Number(px));
  if (!Number.isFinite(n)) return DEFAULT_WIDTH;
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, n));
}

/** A layout from anything (server payload, old localStorage, garbage): only real column
 * keys in canonical column order, clamped widths, unknown keys dropped. null/undefined
 * → the default; an explicit empty visible list is honoured (the board says so). */
export function normalizeLayout(raw) {
  if (!raw || typeof raw !== 'object') return defaultLayout();
  const wanted = new Set(Array.isArray(raw.visible) ? raw.visible : STATUS_KEYS);
  const visible = STATUS_KEYS.filter((k) => wanted.has(k));
  const widths = {};
  if (raw.widths && typeof raw.widths === 'object') {
    for (const [k, v] of Object.entries(raw.widths)) {
      if (STATUS_KEYS.includes(k) && v != null && Number.isFinite(Number(v))) widths[k] = clampWidth(v);
    }
  }
  return { visible, widths };
}

export function isVisible(layout, key) {
  return layout.visible.includes(key);
}

/** Show ↔ hide one column; the visible list stays in canonical order. */
export function toggleColumn(layout, key) {
  if (!STATUS_KEYS.includes(key)) return layout;
  const set = new Set(layout.visible);
  if (set.has(key)) set.delete(key); else set.add(key);
  return { ...layout, visible: STATUS_KEYS.filter((k) => set.has(k)) };
}

/** The width one column renders at (its stored width, else the default). */
export function widthOf(layout, key) {
  const w = layout.widths[key];
  return typeof w === 'number' ? w : DEFAULT_WIDTH;
}

/** A new layout with one column's width set (clamped). */
export function setWidth(layout, key, px) {
  if (!STATUS_KEYS.includes(key)) return layout;
  return { ...layout, widths: { ...layout.widths, [key]: clampWidth(px) } };
}

/** Where a drag started at `startWidth` and the pointer moved `dx` px, the width to show. */
export function dragWidth(startWidth, dx) {
  return clampWidth(startWidth + dx);
}

/** Two layouts describe the same board (same visible set, same effective widths). */
export function sameLayout(a, b) {
  if (!a || !b) return a === b;
  if (a.visible.length !== b.visible.length || a.visible.some((k, i) => k !== b.visible[i])) return false;
  return STATUS_KEYS.every((k) => widthOf(a, k) === widthOf(b, k));
}

/** The wire shape for PUT /api/taskgraph/layout. */
export function toWire(layout) {
  return { visible: [...layout.visible], widths: { ...layout.widths } };
}
