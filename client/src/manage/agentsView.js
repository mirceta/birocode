// The Status → Agents subtab's two scan aids (openspec status-agents-attention), pure so they
// unit-test under `node --test`:
//  - the split / merged LAYOUT of a machine's agents — two sections (Occupied above Free) or
//    one list with the occupancy marked on each row — remembered per browser;
//  - "finished, not yet checked": an agent whose turn ended and whose result nobody
//    acknowledged. The STATE is the dock's server-owned `unseenResult` latch (the dashboard's
//    exclamation dot), relayed on every fleet agent; it stays until the Operator's dedicated
//    "mark as checked" (POST /api/arch/fleet/checked) — never cleared by expanding the agent.
import { splitByOccupancy, isOccupied } from './occupancy.js';

export const LAYOUT_KEY = 'manageapp.fleetAgentsLayout';
export const LAYOUTS = ['split', 'merged'];

/** The remembered layout: 'split' (default) or 'merged'. `get` reads persisted state. */
export function readLayout(get) {
  try {
    const v = get ? get(LAYOUT_KEY) : null;
    return LAYOUTS.includes(v) ? v : 'split';
  } catch {
    return 'split';
  }
}

/** A turn is running right now. */
export const isRunning = (a) => !!a?.runningSince;

/** Finished and not yet checked: the latch is set and no turn runs (running outranks it). */
export const isFinishedUnchecked = (a) => !isRunning(a) && !!a?.unseenResult;

/** What the "running" view shows: a running turn OR a finish nobody checked yet. */
export const needsAttention = (a) => isRunning(a) || isFinishedUnchecked(a);

/** The three-way activity reading for the chip and the legend. */
export function attentionState(a) {
  if (isRunning(a)) return 'running';
  if (isFinishedUnchecked(a)) return 'finished';
  return 'idle';
}

/** The order inside every section and in the merged list (openspec fleet-status-compact-layout):
 * running first, then finished-not-checked, then idle — alphabetical by name within each group —
 * so the chips that need eyes lead every row and the rest reads like an index. Stable: equal
 * agents keep the hub's order. */
const attentionRank = { running: 0, finished: 1, idle: 2 };
const nameOf = (a) => String(a?.name || a?.handle || '').toLowerCase();
export function orderAgents(agents) {
  return (agents || []).map((a, i) => ({ a, i })).sort((x, y) =>
    (attentionRank[attentionState(x.a)] - attentionRank[attentionState(y.a)])
    || nameOf(x.a).localeCompare(nameOf(y.a))
    || (x.i - y.i)).map(({ a }) => a);
}

/** Merged mode: ONE list per machine — occupied first, then free, each order kept — so the
 * rows still read in the split order without the section headers. */
export function mergedList(agents) {
  const { occupied, free } = splitByOccupancy(agents);
  return [...occupied, ...free];
}

/** The row marker in merged mode: what the section header used to say. */
export const occupancyMarker = (a) => (isOccupied(a) ? 'occupied' : 'free');

/** The body of the acknowledgement call. */
export const checkedBody = (sourceId, repoId) => ({ sourceId: sourceId || null, repoId });

/**
 * The client's optimistic view of acknowledgements (the hub's status re-reads a peer's latch on
 * its next describe): `acked` is the set of agent keys the Operator checked; a key leaves the
 * set once the agent is seen running again (a new turn → a new result to check).
 */
export function reconcileAcked(acked, agents) {
  if (!acked || acked.size === 0) return acked || new Set();
  const next = new Set(acked);
  for (const a of agents || []) if (isRunning(a) && next.has(a.key)) next.delete(a.key);
  return next;
}

/** The agent as the tab sees it after acknowledgements: the latch is hidden while acked. */
export function withAck(a, acked) {
  return acked?.has(a.key) && a.unseenResult && !isRunning(a) ? { ...a, unseenResult: false } : a;
}
