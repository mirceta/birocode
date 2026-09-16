// The one live-activity rule (fleet-status task dfee16ea), pure so both the shared
// AgentStatusDot component and `node --test` use it. Fleet Status' original logic,
// verbatim: running wins, then on-default = free, then a known feature branch = claimed,
// else idle; a null agent (not in the fleet snapshot) reads as unknown. `a` is a
// fleet-status agent ({ runningSince, onDefault, branch }).
export function agentDotState(a) {
  if (!a) return 'unknown';
  if (a.runningSince) return 'running';
  if (a.onDefault) return 'free';
  if (a.branch && a.branch !== 'unknown') return 'claimed';
  return 'idle';
}

/// Working-badge emphasis (task 3546287b): a badge whose agent is ACTIVELY
/// WORKING — the same 'running' state that makes the dot blink — carries this
/// shared class so both the Kanban assignee chips and the Fleet Status chips
/// emphasize from ONE rule (each view adds its own size step on top; the
/// state→emphasis decision lives only here). Every other state: no class.
export function workingBadgeClass(state) {
  return state === 'running' ? 'agent-badge--working' : '';
}

export const AGENT_STATE_LABEL = {
  running: 'busy — a turn is running',
  free: 'free — on its default branch',
  claimed: 'claimed — on a feature branch',
  idle: 'idle',
  unknown: 'activity unknown',
};
