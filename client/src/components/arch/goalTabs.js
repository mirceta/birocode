// The per-goal tabbed view (fleet task 93b481e6): the right pane of a selected goal
// conversation in the Subagents tab becomes three tabs — Step plan · Chat · Understanding.
// Pure so it unit-tests under `node --test`: the tab list, the default when nothing is
// remembered, the blocked-step badge rule, and the per-goal memory of the choice.

export const GOAL_TABS = [
  ['plan', 'Step plan'],
  ['chat', 'Chat'],
  ['understanding', 'Understanding'],
];
export const GOAL_TAB_KEYS = GOAL_TABS.map(([k]) => k);

const KEY = (id) => `manageapp.goalTab.${id}`;

/** A step needs the Operator: blocked or awaiting an answer. Drives the Step-plan badge
 * and the default tab. Tolerant of an older goal object without the counts. */
export function planBlocked(goal) {
  return !!goal && ((goal.blockedSteps || 0) > 0 || !!goal.awaitsHuman);
}

/** The tab to open when this goal has no remembered choice: Step plan if a step is
 * blocked/awaiting (it needs eyes first), else Chat (the main interaction). */
export function defaultTab(goal) {
  return planBlocked(goal) ? 'plan' : 'chat';
}

/** The remembered tab for this goal, or null when none/invalid. `get` reads persisted state. */
export function readGoalTab(id, get) {
  try {
    const v = id ? get(KEY(id)) : null;
    return GOAL_TAB_KEYS.includes(v) ? v : null;
  } catch {
    return null;
  }
}

/** Remember the tab for this goal. `set` writes persisted state. */
export function writeGoalTab(id, tab, set) {
  try { if (id && GOAL_TAB_KEYS.includes(tab)) set(KEY(id), tab); } catch { /* private mode */ }
}

/** The tab to show: the remembered choice wins (even if a step later blocks — the badge
 * signals that without yanking the Operator away), else the sensible default. */
export function resolveGoalTab(id, goal, get) {
  return readGoalTab(id, get) || defaultTab(goal);
}
