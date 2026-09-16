// Task filters (openspec task-filters): ONE filter model shared by the Kanban and the
// Task graph — by machine, by repo agent (machine/handle), by state (Kanban column)
// and by flag (blocked, stale), plus a text search. Multi-select within a group, AND
// across groups. The model lives in the URL query (?machine=spacex&agent=spacex/prg%232
// &state=doing) so a view can be bookmarked or shared, and the last filter is
// remembered per browser.
//
// Pure module (no React, no DOM): unit-tested with `node --test`. The React glue
// (shared store + hook) is in taskFilterStore.js; the bar is TaskFilterBar.jsx.

import { DELIVERED } from './kanbanColumns.js';

export const UNASSIGNED = 'unassigned';
export const FLAGS = [
  ['blocked', 'blocked', 'a prerequisite is not done'],
  ['stale', 'stale', 'assigned and pinged, no progress for a long time'],
];
export const SAVE_KEY = 'claudeweb_task_filters';
export const PARAM_KEYS = ['q', 'machine', 'agent', 'state', 'flag', 'hide'];

export function emptyFilter() {
  return { q: '', machines: [], agents: [], states: [], flags: [], hide: false };
}

export function isNarrowed(f) {
  return !!f && (f.q.trim().length > 0 || f.machines.length > 0 || f.agents.length > 0 || f.states.length > 0 || f.flags.length > 0);
}

export function sameFilter(a, b) {
  return formatFilter(a) === formatFilter(b);
}

/** Toggle `key` in a multi-select list (a new array either way). */
export function toggleValue(list, key) {
  return list.includes(key) ? list.filter((x) => x !== key) : [...list, key];
}

function clean(list) {
  const out = [];
  for (const x of list || []) {
    if (typeof x !== 'string') continue;
    const v = x.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** A well-formed filter from any partial/unknown object (persisted or typed). */
export function normalizeFilter(raw) {
  const f = emptyFilter();
  if (!raw || typeof raw !== 'object') return f;
  f.q = typeof raw.q === 'string' ? raw.q : '';
  f.machines = clean(raw.machines);
  f.agents = clean(raw.agents);
  f.states = clean(raw.states);
  f.flags = clean(raw.flags);
  f.hide = raw.hide === true || raw.hide === '1' || raw.hide === 1;
  return f;
}

// ---- URL query --------------------------------------------------------------------------

function toParams(search) {
  if (search instanceof URLSearchParams) return search;
  const s = typeof search === 'string' ? search : '';
  return new URLSearchParams(s.startsWith('?') ? s.slice(1) : s);
}

/** Does the query carry any filter key at all? (Absent = fall back to the saved filter.) */
export function hasFilterParams(search) {
  const p = toParams(search);
  return PARAM_KEYS.some((k) => p.has(k));
}

/** The filter encoded in a query string; a key may repeat (machine=a&machine=b) or hold
 * a comma list (machine=a,b). Returns null when the query carries no filter key. */
export function parseFilter(search) {
  const p = toParams(search);
  if (!PARAM_KEYS.some((k) => p.has(k))) return null;
  const multi = (k) => p.getAll(k).flatMap((v) => v.split(',')).map((v) => v.trim()).filter(Boolean);
  return normalizeFilter({
    q: p.get('q') || '',
    machines: multi('machine'),
    agents: multi('agent'),
    states: multi('state'),
    flags: multi('flag'),
    hide: p.get('hide') === '1',
  });
}

/** The query string (no leading "?") for a filter: empty when nothing is set. */
export function formatFilter(f) {
  const p = new URLSearchParams();
  const n = normalizeFilter(f);
  if (n.q.trim()) p.set('q', n.q.trim());
  for (const m of n.machines) p.append('machine', m);
  for (const a of n.agents) p.append('agent', a);
  for (const s of n.states) p.append('state', s);
  for (const fl of n.flags) p.append('flag', fl);
  if (n.hide) p.set('hide', '1');
  return p.toString();
}

/** `href` with its filter keys replaced by the filter's (other keys — tab, layout — kept). */
export function withFilterInUrl(href, f) {
  const u = new URL(href, 'http://x/');
  for (const k of PARAM_KEYS) u.searchParams.delete(k);
  const extra = new URLSearchParams(formatFilter(f));
  for (const [k, v] of extra) u.searchParams.append(k, v);
  return href.startsWith('http') ? u.toString() : u.pathname + (u.search || '') + (u.hash || '');
}

// ---- persistence (last filter per browser) ----------------------------------------------

export function readSavedFilter(storage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return null;
    return normalizeFilter(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSavedFilter(storage, f) {
  try { storage?.setItem(SAVE_KEY, JSON.stringify(normalizeFilter(f))); } catch { /* private mode */ }
}

// ---- the fleet: machines and agent handles ---------------------------------------------

/** A machine's key in the fleet status: "self" for this box, else its source id. */
export function sourceKeyOf(node) {
  return node?.sourceId ? node.sourceId : 'self';
}

/** The assignees of a task (openspec task-multi-assignee): the recorded list when the
 * card has one, else the legacy single assignee from the card's own fields, else []. Each
 * entry carries its own status (the card's status is the aggregate). */
export function assigneesOf(node) {
  if (!node) return [];
  if (Array.isArray(node.assignees) && node.assignees.length > 0) {
    return node.assignees.map((a) => ({ ...a, sourceId: a.sourceId || null, repoId: a.repoId, status: a.status || 'todo' }));
  }
  return node.repoId ? [{ sourceId: node.sourceId || null, repoId: node.repoId, status: node.status || 'todo' }] : [];
}

/** Every repo agent the fleet status knows, keyed "sourceKey|repoId", with its handle
 * (openspec stable-handles). An agent without a handle gets "<machine>/<name>", and
 * "#2", "#3"… when the name repeats on that machine. */
export function agentHandles(fleet) {
  const out = new Map();
  for (const m of fleet?.machines || []) {
    const sourceKey = m.self ? 'self' : m.sourceId;
    const used = new Set();
    for (const a of m.agents || []) {
      let handle = a.handle || '';
      if (!handle) {
        const base = `${m.machine}/${a.name || String(a.repoId || '').slice(0, 8)}`;
        handle = base;
        for (let k = 2; used.has(handle.toLowerCase()); k++) handle = `${base}#${k}`;
      }
      used.add(handle.toLowerCase());
      out.set(`${sourceKey}|${a.repoId}`, { handle, machine: m.machine, name: a.name, sourceKey, repoId: a.repoId, remoteUrl: a.remoteUrl || null, managed: !!a.managed });
    }
  }
  return out;
}

/** sourceKey → machine label from the fleet status. */
export function machineLabels(fleet) {
  const out = new Map();
  for (const m of fleet?.machines || []) out.set(m.self ? 'self' : m.sourceId, m.machine);
  return out;
}

/** What the filter needs to know about the fleet, derived once per fleet status. */
export function filterContext(fleet, columnOf) {
  const labels = machineLabels(fleet);
  return {
    agents: agentHandles(fleet),
    machineLabel: (sourceKey) => labels.get(sourceKey) || (sourceKey === 'self' ? 'this machine' : sourceKey),
    columnOf: columnOf || ((n) => n?.status || 'todo'),
  };
}

// ---- the task view the filter matches on --------------------------------------------

/** A task reduced to what the filter reads: its machine labels and agent handles — one
 * per assignee (openspec task-multi-assignee; empty = unassigned; `machine`/`agent` are
 * the primary's for single-value readers), its state (the Kanban column), its flags, and
 * the text the search scans. `flags` is a list such as ['blocked']. */
export function taskView(node, ctx, flags = []) {
  const set = assigneesOf(node);
  const machines = [];
  const agents = [];
  const assignees = set.map((a) => {
    const sourceKey = sourceKeyOf(a);
    const machine = ctx.machineLabel(sourceKey);
    const known = ctx.agents.get(`${sourceKey}|${a.repoId}`);
    const handle = known?.handle || `${machine}/${String(a.repoId).slice(0, 8)}`;
    if (!machines.includes(machine)) machines.push(machine);
    agents.push(handle);
    return { ...a, machine, handle };
  });
  const state = ctx.columnOf(node);
  return {
    id: node.id,
    title: node.title || '',
    machine: machines[0] ?? null,
    agent: agents[0] ?? null,
    machines,
    agents,
    assignees,
    state,
    flags: [...flags],
    text: `${node.title || ''} ${node.note || ''} ${machines.join(' ')} ${agents.join(' ')} ${assignees.map((a) => a.status).join(' ')} ${state} ${flags.join(' ')}`.toLowerCase(),
  };
}

/** Does a view pass one group of the filter? Empty group = everything passes. */
export function matchesGroup(view, f, group) {
  switch (group) {
    case 'q': {
      const words = f.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
      return words.every((w) => view.text.includes(w));
    }
    case 'machine': {
      // ANY assignee matches (openspec task-multi-assignee).
      const ms = view.machines || (view.machine === null ? [] : [view.machine]);
      return f.machines.length === 0 || f.machines.some((m) => (m === UNASSIGNED ? ms.length === 0 : ms.includes(m)));
    }
    case 'agent': {
      const as = view.agents || (view.agent === null ? [] : [view.agent]);
      return f.agents.length === 0 || f.agents.some((a) => (a === UNASSIGNED ? as.length === 0 : as.includes(a)));
    }
    case 'state':
      return f.states.length === 0 || f.states.includes(view.state);
    case 'flag':
      return f.flags.length === 0 || f.flags.some((fl) => view.flags.includes(fl));
    default:
      return true;
  }
}

const GROUPS = ['q', 'machine', 'agent', 'state', 'flag'];

/** AND across the groups (skipping `except`, for faceted counts). */
export function matchesTask(view, f, except = null) {
  return GROUPS.every((g) => g === except || matchesGroup(view, f, g));
}

/** The ids of the views that pass the whole filter. */
export function applyFilter(views, f) {
  const out = new Set();
  for (const v of views) if (matchesTask(v, f)) out.add(v.id);
  return out;
}

/** Faceted counts: for each group, how many tasks each chip WOULD show given the other
 * groups' selection — the numbers on the chips. `states` covers every column plus any
 * state seen; `flags` only the flags that exist on some task. */
export function facets(views, f, columns = []) {
  const count = (group, keyOf) => {
    const m = new Map();
    for (const v of views) {
      if (!matchesTask(v, f, group)) continue;
      for (const k of keyOf(v)) m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  };
  // A task counts once per distinct machine / agent it has (openspec task-multi-assignee).
  const machines = count('machine', (v) => { const ms = v.machines || (v.machine === null ? [] : [v.machine]); return ms.length ? [...new Set(ms)] : [UNASSIGNED]; });
  const agents = count('agent', (v) => { const as = v.agents || (v.agent === null ? [] : [v.agent]); return as.length ? [...new Set(as)] : [UNASSIGNED]; });
  const states = count('state', (v) => [v.state]);
  const flags = count('flag', (v) => v.flags);
  const stateKeys = [...columns.map((c) => (Array.isArray(c) ? c[0] : c.key)), ...views.map((v) => v.state)];
  const orderedStates = [...new Set(stateKeys)];
  const present = new Set(views.flatMap((v) => v.flags));
  return {
    machines, agents, states, flags,
    stateKeys: orderedStates,
    flagKeys: FLAGS.map(([k]) => k).filter((k) => present.has(k) || f.flags.includes(k)),
    total: views.length,
    shown: views.filter((v) => matchesTask(v, f)).length,
  };
}

/** The chips of a group: every key with a count, plus any selected key that no task
 * carries any more (so it can still be un-selected), plus the `always` keys (every
 * column, even an empty one); machines/agents sorted by label with Unassigned last. */
export function chipsOf(counts, selected, { unassigned = false, order = null, always = [] } = {}) {
  const keys = new Set([...always, ...counts.keys(), ...selected]);
  if (unassigned) keys.add(UNASSIGNED);
  let list = [...keys];
  if (order) {
    const idx = new Map(order.map((k, i) => [k, i]));
    list.sort((a, b) => (idx.has(a) ? idx.get(a) : 1e9) - (idx.has(b) ? idx.get(b) : 1e9) || a.localeCompare(b));
  } else {
    list.sort((a, b) => (a === UNASSIGNED) - (b === UNASSIGNED) || a.localeCompare(b));
  }
  return list.map((key) => ({ key, count: counts.get(key) || 0, on: selected.includes(key) }));
}

/** Blocked ids: a task that is not delivered and waits on a prerequisite that is not
 * delivered (openspec kanban-lifecycle-columns: merged work unblocks its dependents).
 * Edges: source waits on target. */
export function blockedIds(nodes, edges, statusOf = (n) => n.status) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Set();
  for (const n of nodes) {
    if (DELIVERED(statusOf(n))) continue;
    const waitsOn = edges.filter((e) => e.source === n.id).map((e) => byId.get(e.target)).filter(Boolean);
    if (waitsOn.some((p) => !DELIVERED(statusOf(p)))) out.add(n.id);
  }
  return out;
}

/** Stale ids: parked in committed / pr-opened with no activity past the window — the
 * same rule the Kanban's stale badge uses (`staleHours` rides on the board reply). */
export function staleIds(nodes, staleMs, now = Date.now()) {
  const out = new Set();
  if (!(staleMs > 0)) return out;
  for (const n of nodes) {
    if ((n.status === 'committed' || n.status === 'pr-opened') && now - (n.updatedAt || 0) > staleMs) out.add(n.id);
  }
  return out;
}

/** The flags of one task for taskView(): ['blocked'], ['stale'], both or none. */
export function flagsOf(id, blocked, stale) {
  const f = [];
  if (blocked?.has(id)) f.push('blocked');
  if (stale?.has(id)) f.push('stale');
  return f;
}
