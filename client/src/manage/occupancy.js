// Manual agent occupancy (openspec manual-agent-occupancy): the pure half of the Status
// tab's free / occupied reading. The server puts `occupancy` on every fleet agent —
// { occupied, source: 'operator' | 'branch', setAt, note } — the Operator's setting when
// there is one, else the branch rule (free on the default branch, occupied otherwise).
// This module words it, splits a machine's agents into the two sections, and maps the
// filter chips; it never decides occupancy itself, so an old hub without the field falls
// back to the branch rule the same way the server does.

export function occupancyOf(a) {
  const o = a?.occupancy;
  const known = !!a?.branch && a.branch !== 'unknown';
  if (o && typeof o.occupied === 'boolean') {
    const manual = o.source === 'operator';
    return {
      occupied: o.occupied,
      source: manual ? 'operator' : 'branch',
      label: o.occupied ? 'occupied' : 'free',
      title: manual
        ? `${o.occupied ? 'occupied' : 'free'} — set by the Operator${o.note ? ` (${o.note})` : ''}`
        : o.occupied ? (known ? 'occupied — on a feature branch (branch rule)' : 'occupied — branch unknown (branch rule)') : 'free — on its default branch (branch rule)',
    };
  }
  // A hub that predates the field: the branch rule, as before.
  const occupied = !a?.onDefault;
  return { occupied, source: 'branch', label: occupied ? 'occupied' : 'free', title: occupied ? (known ? 'occupied — on a feature branch (branch rule)' : 'occupied — branch unknown (branch rule)') : 'free — on its default branch (branch rule)' };
}

export const isOccupied = (a) => occupancyOf(a).occupied;
export const isManual = (a) => occupancyOf(a).source === 'operator';

/** The two sections under a machine: occupied on top, free below. Order within each is kept. */
export function splitByOccupancy(agents) {
  const occupied = [];
  const free = [];
  for (const a of agents || []) (isOccupied(a) ? occupied : free).push(a);
  return { occupied, free };
}

/** The Status tab's state chips: the branch-based `main` / `feature` became occupancy-based. */
export const OCCUPANCY_FILTERS = [
  ['all', 'All', 'Every agent'],
  ['free', 'free', 'Free to be given work — the Operator\'s setting, else on its default branch'],
  ['occupied', 'occupied', 'Occupied — the Operator\'s setting, else on a feature branch'],
  ['running', 'running', 'A turn is running right now'],
  ['managed', '🏛 managed', 'In the arch agent\'s scope'],
];
const LEGACY_FILTER = { main: 'free', feature: 'occupied' };
export const normalizeFilter = (f) => LEGACY_FILTER[f] || (OCCUPANCY_FILTERS.some(([k]) => k === f) ? f : 'all');

export function matchesFilter(a, filter) {
  if (filter === 'running') return !!a.runningSince;
  if (filter === 'free') return !isOccupied(a);
  if (filter === 'occupied') return isOccupied(a);
  if (filter === 'managed') return !!a.managed;
  return true;
}

/** The detail badge: what is in effect and who decided. */
export function occupancyBadge(a) {
  const o = occupancyOf(a);
  return {
    key: 'occupancy',
    label: o.source === 'operator' ? `✋ ${o.label} — set by the Operator` : `${o.label} — branch rule`,
    tone: o.occupied ? 'warn' : 'ok',
    title: o.title,
    data: { occupied: o.occupied, occupancySource: o.source },
  };
}

/** The three-way control's body: occupied | free | null (automatic). */
export const occupancyBody = (sourceId, repoId, occupied) => ({ sourceId: sourceId || null, repoId, occupied });
