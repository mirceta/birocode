// The goal STEP PLAN's pure half (openspec goal-step-plan, fleet task 94c722e7): a goal
// conversation is an orchestration — an ordered list of steps the arch marks as it runs
// (pending → active → done | blocked | skipped). The server owns every state (mark_step,
// the NEEDS_HUMAN block, the carry-over on continue); this module only words and orders
// what the goal view carries: `goal.plan` = [{ index, title, done, kind, state, note,
// evidence, counter, updatedAt, awaitsHuman }], `goal.progress` = { done, total },
// `goal.activeStep`, `goal.blockedSteps`, `goal.planDerived`, `goal.continuesGoalId`.
// Framework-free, unit-tested under `node --test`.

export const STATES = ['pending', 'active', 'done', 'blocked', 'skipped'];
export const KINDS = ['send', 'wait', 'transfer', 'verify', 'relay-loop', 'human', 'other'];

/** The step list of a goal view (never null). */
export const planOf = (goal) => (Array.isArray(goal?.plan) ? goal.plan : []);

/** done + skipped over total — what the selector row shows as "2/5". */
export function planProgress(goal) {
  const steps = planOf(goal);
  if (goal?.progress && Number.isFinite(goal.progress.total)) return { done: goal.progress.done || 0, total: goal.progress.total };
  return { done: steps.filter((s) => s.state === 'done' || s.state === 'skipped').length, total: steps.length };
}

export const progressWord = (goal) => {
  const { done, total } = planProgress(goal);
  return total ? `${done}/${total}` : '';
};

/** Steps blocked (the arch's own block, or the harness's NEEDS_HUMAN block). */
export const blockedSteps = (goal) => planOf(goal).filter((s) => s.state === 'blocked');
export const hasBlockedStep = (goal) => blockedSteps(goal).length > 0;
/** A step blocked by a NEEDS_HUMAN ending: the one with the answer box. */
export const awaitingStep = (goal) => planOf(goal).find((s) => s.state === 'blocked' && s.awaitsHuman) || null;

/** The step the goal is on: the first active one, else null. */
export const activeStep = (goal) => planOf(goal).find((s) => s.state === 'active') || null;

/** The glyph + words of a step state, for the stepper and the circle indicator. */
export function stateWords(state) {
  switch (state) {
    case 'done': return { glyph: '✓', word: 'done' };
    case 'active': return { glyph: '▶', word: 'active' };
    case 'blocked': return { glyph: '✋', word: 'blocked' };
    case 'skipped': return { glyph: '–', word: 'skipped' };
    default: return { glyph: '○', word: 'pending' };
  }
}

/** A short label of the kind, for the pill. */
export const kindWord = (kind) => (kind === 'relay-loop' ? 'relay loop' : kind === 'human' ? 'operator' : kind || 'other');

/** The compact evidence lines of a step: [{ label, text, href }] — a URL becomes a link,
 * the closing line keeps its own row (rendered monospace by the panel). */
export function evidenceLines(step) {
  const e = step?.evidence;
  if (!e) return [];
  const out = [];
  if (e.closingLine) out.push({ label: 'closing line', text: e.closingLine, mono: true });
  if (e.hubPath) out.push({ label: 'hub', text: `${e.hubPath}${Number.isFinite(e.size) ? ` (${e.size} bytes)` : ''}` });
  if (e.jobId) out.push({ label: 'job', text: e.jobId });
  if (e.commit) out.push({ label: 'commit', text: e.commit, mono: true });
  if (e.url) out.push({ label: /\/pull\//.test(e.url) ? 'PR' : 'link', text: e.url, href: e.url });
  if (e.text) out.push({ label: '', text: e.text });
  return out;
}

/** The state the Operator can move a step to from the panel: never the one it is in. */
export const nextStates = (step) => STATES.filter((s) => s !== step?.state);

/** The one-line headline of the plan panel. */
export function planHeadline(goal) {
  const { done, total } = planProgress(goal);
  if (!total) return goal?.state === 'running' ? 'No step plan yet — the arch declares one on its first turn.' : 'No step plan.';
  const parts = [`${done}/${total} done`];
  const a = activeStep(goal);
  if (a) parts.push(`on step ${a.index}: ${a.title}`);
  const b = blockedSteps(goal).length;
  if (b) parts.push(`${b} blocked`);
  if (goal?.planDerived) parts.push('derived from the goal text');
  if (goal?.continuesGoalId) parts.push(`continues goal ${goal.continuesGoalId}`);
  return parts.join(' · ');
}

/** Whether an ended goal can be continued (its plan carried over). */
export const canContinue = (goal) => !!goal && ['capped', 'error', 'stopped'].includes(goal.state);
