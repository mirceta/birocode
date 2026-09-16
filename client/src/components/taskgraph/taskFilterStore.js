import { useSyncExternalStore } from 'react';
import {
  emptyFilter, hasFilterParams, isNarrowed, normalizeFilter, parseFilter, readSavedFilter, sameFilter,
  withFilterInUrl, writeSavedFilter,
} from './taskFilters';

// The ONE task filter of the page (openspec task-filters): the Kanban, the Task graph
// and its legends all read and write the same object, so a chip clicked in one pane
// narrows the other pane too (the Management App shows them side by side). On load
// the URL wins when it carries a filter key (a shared or bookmarked link), else the
// browser's last filter; every change is written back to both.

let current = null;
const listeners = new Set();

function init() {
  if (current) return current;
  let f = null;
  try { if (typeof window !== 'undefined' && hasFilterParams(window.location.search)) f = parseFilter(window.location.search); } catch { /* opaque origin */ }
  if (!f) {
    try { f = readSavedFilter(typeof localStorage === 'undefined' ? null : localStorage); } catch { f = null; }
  }
  current = f || emptyFilter();
  // A remembered filter shows in the address bar too, so the page is shareable as seen.
  if (isNarrowed(current)) syncUrl(current);
  return current;
}

function syncUrl(f) {
  try {
    if (typeof window === 'undefined' || !window.history?.replaceState) return;
    const next = withFilterInUrl(window.location.href, f);
    if (next !== window.location.href) window.history.replaceState(window.history.state, '', next);
  } catch { /* private mode / opaque origin */ }
}

export function getTaskFilter() {
  return init();
}

export function setTaskFilter(next) {
  const prev = init();
  const value = normalizeFilter(typeof next === 'function' ? next(prev) : next);
  if (sameFilter(prev, value)) return;
  current = value;
  writeSavedFilter(typeof localStorage === 'undefined' ? null : localStorage, value);
  syncUrl(value);
  for (const l of listeners) l();
}

function subscribe(listener) {
  listeners.add(listener);
  // Back/forward between two shared links re-reads the filter from the URL.
  const onPop = () => {
    try {
      if (!hasFilterParams(window.location.search)) return;
      const f = parseFilter(window.location.search);
      if (f && !sameFilter(f, init())) { current = f; for (const l of listeners) l(); }
    } catch { /* ignore */ }
  };
  if (typeof window !== 'undefined') window.addEventListener('popstate', onPop);
  return () => {
    listeners.delete(listener);
    if (typeof window !== 'undefined') window.removeEventListener('popstate', onPop);
  };
}

/** [filter, setFilter] — the shared filter, live across every mounted view. */
export function useTaskFilter() {
  const f = useSyncExternalStore(subscribe, getTaskFilter, getTaskFilter);
  return [f, setTaskFilter];
}

/** Test seam: forget the in-memory filter so the next read re-initialises. */
export function resetTaskFilterForTests() {
  current = null;
}
