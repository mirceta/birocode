// Who owns a set of subagents (openspec repo-agent-subagents): the arch (its goal
// conversations, /api/arch/…) or one repo agent (its subagents, /api/subagents…). The
// Subagents panel and the goal-plan stepper read every path and label from an owner, so the
// Management tab and the dock's Subagents lane are ONE component, not a fork. Pure; tested.

const enc = encodeURIComponent;

/** The arch: rows are /api/arch/conversations' conversations (goal inside). The default. */
export const archOwner = {
  kind: 'arch',
  listPath: '/arch/conversations',
  rowsOf: (r) => (Array.isArray(r?.conversations) ? r.conversations : null),
  goalPath: (goalId, what) => `/arch/goals/${enc(goalId)}/${what}`,
  stepPath: (goalId, index) => `/arch/goals/${enc(goalId)}/steps/${index}`,
  storageKey: (k) => `manageapp.${k}`,
  title: 'Goal conversations',
  emptyText: 'No goal conversations yet. Start one from the Arch tab\'s Loops lane ("▶ Start goal conversation"), or ask the arch: “arch, run a goal: … on …”.',
  stopTitle: (id) => `Stop goal ${id} (stop_arch_goal): releases the repos and tasks it owns`,
  stopConfirm: (id) => `Stop goal ${id}? Its conversation releases the repos and tasks it owns.`,
  nothingSelected: 'Nothing selected — every goal the arch runs will appear in the list on the left, with its live state; the toolbar stays two tabs however many there are.',
};

/** A subagent record as a panel row: the same { id, name, isDefault, createdAt, running, busy,
 * goal } shape the arch's conversations have, with the subagent view as the goal. */
export function subagentRow(s) {
  if (!s) return null;
  return {
    id: s.id,
    name: s.name,
    isDefault: false,
    createdAt: s.startedAt,
    running: !!s.running,
    busy: !!s.busy,
    readOnly: !!s.readOnly,
    goal: { ...s, id: s.id, goal: s.goal, conversation: { id: s.id, name: s.name } },
  };
}

/** One repo agent: rows are its subagents. */
export function repoOwner(repoId, repoName = '') {
  return {
    kind: 'repo',
    repoId,
    listPath: `/subagents?repo=${enc(repoId)}`,
    rowsOf: (r) => (Array.isArray(r?.subagents) ? r.subagents.map(subagentRow) : null),
    goalPath: (id, what) => `/subagents/${enc(id)}/${what}`,
    stepPath: (id, index) => `/subagents/${enc(id)}/steps/${index}`,
    storageKey: (k) => `dock.${k}.${repoId}`,
    title: 'Subagents',
    emptyText: `No subagents yet. ${repoName || 'This agent'} starts one with its start_subagent tool, or start one here: a goal (STEP n — lines become the plan), it runs in this checkout when the agent is idle and reports back into the agent's conversation.`,
    stopTitle: (id) => `Stop subagent ${id}: its turn is killed, its summary still reaches the agent`,
    stopConfirm: (id) => `Stop subagent ${id}? Its summary still reaches the parent agent's conversation.`,
    nothingSelected: 'Nothing selected — every subagent of this agent appears in the list on the left, with its live state.',
  };
}

/** How many subagents of a list need eyes: a running turn, an armed loop, or waiting on an answer. */
export function subagentCounts(list) {
  const rows = (list || []).filter(Boolean);
  return {
    running: rows.filter((s) => s.state === 'running').length,
    busy: rows.filter((s) => s.running).length,
    needsHuman: rows.filter((s) => s.state === 'running' && s.held).length,
    total: rows.length,
  };
}

/** The Status chip / lane label word for an agent's subagent counts ({ running, total, needsHuman }). */
export function subagentBadgeWord(counts) {
  if (!counts || !counts.total) return '';
  const r = counts.running || 0;
  const n = counts.needsHuman || 0;
  if (r === 0) return `⑂ ${counts.total} ended`;
  return `⑂ ${r} subagent${r === 1 ? '' : 's'}${n ? ` · ${n} waiting` : ''}`;
}
