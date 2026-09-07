import { agentDotState, AGENT_STATE_LABEL } from './agentActivity';
import './agentStatusDot.css';

// The live per-agent activity dot (fleet-status task dfee16ea): the SAME indicator that
// sits to the LEFT of every repo-agent badge on the Fleet Status tab, lifted into one
// component so Fleet Status and the Kanban card badges render from ONE source and never
// drift. It pulses while the agent is running a turn, is solid green when free (on its
// default branch), amber when claimed on a feature branch, and grey when idle/unknown —
// the exact states/colours/animation Fleet Status already used. The state rule lives in
// agentActivity.js (pure, unit-tested).

// Not colour alone: the blink (running) vs steady (idle/free) is perceivable without
// colour, and the state is always named in the title + aria-label ("busy"/"free"/…).
export default function AgentStatusDot({ state, title }) {
  const s = state || 'unknown';
  const label = title || AGENT_STATE_LABEL[s] || AGENT_STATE_LABEL.unknown;
  return <span className={`agent-dot agent-dot--${s}`} role="img" aria-label={label} title={label} />;
}

export { agentDotState };
