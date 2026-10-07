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

import { hasBlockedStep, awaitingStep, activeStep } from './goalPlan.js';

/** Waiting on the Operator: the goal loop escalated with NEEDS_HUMAN. A running goal in
 * that state is HELD (openspec goal-step-plan): it keeps its agents until the answer. */
export const needsHuman = (c) =>
  !!c?.goal && c.goal.loopStatus === 'escalate' && c.goal.stopReason === 'needs-human';

/** A step of the goal's plan is blocked (the arch's block or the NEEDS_HUMAN block). */
export const stepBlocked = (c) => hasBlockedStep(c?.goal);

/** The AgentStatusDot state + label for one conversation row. The circle reflects the
 * ACTIVE STEP's state when the goal has a plan (openspec goal-step-plan): a blocked step
 * is amber like NEEDS_HUMAN; an active step on an armed goal is green. */
export function subagentDot(c) {
  if (!c) return { state: 'unknown', label: 'unknown' };
  if (c.running) return { state: 'running', label: 'busy — a turn is running' };
  if (needsHuman(c)) {
    const q = awaitingStep(c.goal);
    return { state: 'claimed', label: `waiting on you — ${(q && q.note) || c.goal.stopDetail || 'NEEDS_HUMAN'}` };
  }
  if (stepBlocked(c)) return { state: 'claimed', label: `step blocked — ${c.goal.plan.find((s) => s.state === 'blocked').title}` };
  if (c.goal && c.busy) {
    const a = activeStep(c.goal);
    return { state: 'free', label: a ? `goal armed — on step ${a.index}: ${a.title}` : 'goal armed — idle between polls' };
  }
  const g = c.goal;
  if (g?.state === 'error') return { state: 'unknown', label: 'error — its last run errored' };
  if (g) return { state: 'idle', label: g.state }; // done | stopped | capped
  return { state: 'idle', label: 'plain conversation' };
}

/** The row's badge word (always names the exact state; the dot is the glance). */
export function subagentBadge(c) {
  if (c?.running) return 'busy';
  if (needsHuman(c)) return 'needs you';
  if (stepBlocked(c)) return 'blocked';
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
  const rank = (c) => (c.running ? 0 : needsHuman(c) || stepBlocked(c) ? 0 : c.goal && c.busy ? 1 : 2);
  return [...(convs || [])].sort((a, b) =>
    rank(a) - rank(b) || lastActivityAt(b) - lastActivityAt(a) || String(a.id).localeCompare(String(b.id)));
}

/** The rows the tab lists: every non-default conversation. */
export const subagentList = (convs) => (convs || []).filter((c) => c && !c.isDefault);

/** The toolbar badge: how many subagents are active, waiting on the Operator, or have a
 * blocked step in their plan (openspec goal-step-plan). */
export const subagentAttention = (convs) =>
  subagentList(convs).filter((c) => c.running || needsHuman(c) || stepBlocked(c) || (c.goal && c.busy)).length;

/** How many goals have a blocked step — the count the brief asks the badge to carry. */
export const blockedGoals = (convs) => subagentList(convs).filter((c) => stepBlocked(c)).length;

/** iterations/cap, "3/12" — blank for a plain conversation. */
export const iterationsWord = (c) =>
  c?.goal ? `${c.goal.iterations ?? 0}${c.goal.maxIterations ? `/${c.goal.maxIterations}` : ''}` : '';
