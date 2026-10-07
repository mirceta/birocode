// The Subagents tab's pure half (fleet task 592abffb, openspec arch-subagents-tab):
// every NON-DEFAULT arch conversation — goal conversations above all — as one row of a
// vertical selector, instead of one toolbar tab each. Row state, sorting, the tab's
// attention count and the title line live here so `node --test` covers them without a DOM.
//
// The circle indicator REUSES the repo agents' AgentStatusDot states (one palette, one
// meaning): a turn in progress → 'running' (pulsing); waiting on the Operator
// (NEEDS_HUMAN) → 'claimed' (amber — attention); an armed goal between polls → 'free'
// (green — alive); done / stopped / capped → 'idle' (grey); error → 'unknown' (faded).
// The exact state is always ALSO named by the row's badge word, so no meaning rides on
// colour alone (error keeps its own badge styling).

/** A conversation row as /api/arch/conversations reports it: { id, name, isDefault,
 * createdAt, running, busy, goal: { state, loopStatus, stopReason, stopDetail,
 * iterations, maxIterations, lastSentAt, endedAt, queued, goal } | null }. */

/** Waiting on the Operator: the goal loop escalated with NEEDS_HUMAN. */
export const needsHuman = (c) =>
  !!c?.goal && c.goal.loopStatus === 'escalate' && c.goal.stopReason === 'needs-human';

/** The AgentStatusDot state + label for one conversation row. */
export function subagentDot(c) {
  if (!c) return { state: 'unknown', label: 'unknown' };
  if (c.running) return { state: 'running', label: 'busy — a turn is running' };
  if (needsHuman(c)) return { state: 'claimed', label: `waiting on you — ${c.goal.stopDetail || 'NEEDS_HUMAN'}` };
  if (c.goal && c.busy) return { state: 'free', label: 'goal armed — idle between polls' };
  const g = c.goal;
  if (g?.state === 'error') return { state: 'unknown', label: 'error — its last run errored' };
  if (g) return { state: 'idle', label: g.state }; // done | stopped | capped
  return { state: 'idle', label: 'plain conversation' };
}

/** The row's badge word (always names the exact state; the dot is the glance). */
export function subagentBadge(c) {
  if (c?.running) return 'busy';
  if (needsHuman(c)) return 'needs you';
  if (c?.goal && c.busy) return 'polling';
  return c?.goal?.state || 'chat';
}

/** The row title: the goal's first line (truncated), else the conversation name. */
export function subagentTitle(c, max = 80) {
  const src = (c?.goal?.goal || c?.name || c?.id || '').split('\n')[0].trim();
  return src.length > max ? src.slice(0, max - 1).trimEnd() + '…' : src;
}

/** Last activity, for sorting and the "last poll" column. */
export const lastActivityAt = (c) =>
  Math.max(c?.goal?.lastSentAt || 0, c?.goal?.endedAt || 0, c?.goal?.startedAt || 0, c?.createdAt || 0);

/** Attention first (busy turn, needs-human, armed goal), then by last activity, newest
 * first. Stable enough for a 5 s poll: ties keep id order. */
export function sortSubagents(convs) {
  const rank = (c) => (c.running ? 0 : needsHuman(c) ? 0 : c.goal && c.busy ? 1 : 2);
  return [...(convs || [])].sort((a, b) =>
    rank(a) - rank(b) || lastActivityAt(b) - lastActivityAt(a) || String(a.id).localeCompare(String(b.id)));
}

/** The rows the tab lists: every non-default conversation. */
export const subagentList = (convs) => (convs || []).filter((c) => c && !c.isDefault);

/** The toolbar badge: how many subagents are active or waiting on the Operator. */
export const subagentAttention = (convs) =>
  subagentList(convs).filter((c) => c.running || needsHuman(c) || (c.goal && c.busy)).length;

/** iterations/cap, "3/12" — blank for a plain conversation. */
export const iterationsWord = (c) =>
  c?.goal ? `${c.goal.iterations ?? 0}${c.goal.maxIterations ? `/${c.goal.maxIterations}` : ''}` : '';
