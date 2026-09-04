import '../../pages/autopilot.css';

// The "Agents" sub-tab of the AutopilotConsole (plans/autopilot-to-harness.md):
// the global controls (kill switch / auto-advance / confidence threshold), the
// and the per-agent status + arm/disarm list.
// Lives in its own file so the console stays readable; the console is rendered
// identically by both the routed tab and the dashboard dock.
export const BADGE = {
  suggestion: { cls: 'sugg', label: 'suggestion' },
  sent: { cls: 'sent', label: 'sent' },
  escalate: { cls: 'esc', label: 'needs you' },
  running: { cls: 'run', label: 'running' },
  idle: { cls: 'idle', label: 'idle' },
  paused: { cls: 'idle', label: 'paused' },
  off: { cls: 'off', label: 'off' },
};

export default function AgentsView({ data, mutate }) {
  const agents = data?.agents ?? [];
  const enabled = data?.enabled ?? true;
  const autoAdvance = data?.autoAdvance ?? false;
  const threshold = data?.threshold ?? 0.85;
  const brain = data?.brain ?? 'cli';
  const brainModel = data?.brainModel ?? 'haiku';

  return (
    <>
      <div className="ap-bar">
        <button
          className={`ap-switch ${enabled ? 'on' : ''}`}
          onClick={() => mutate({ enabled: !enabled })}
          title="Global kill switch — affects every agent"
        >
          <span className="ap-switch__knob" />
        </button>
        <b>Autopilot</b>
        <span className="ap-muted">{enabled ? 'on · armed agents only' : 'killed · all manual'}</span>

        <span className="ap-bar__sep" />
        <button
          className={`ap-switch ${autoAdvance ? 'on ap-switch--hot' : ''}`}
          onClick={() => mutate({ autoAdvance: !autoAdvance })}
          disabled={!enabled}
          title="Auto-advance: actually send confident, non-risky prompts"
        >
          <span className="ap-switch__knob" />
        </button>
        <b>Auto-advance</b>
        <span className="ap-muted">{autoAdvance ? 'sending for you' : 'suggest-only'}</span>

        <span className="ap-bar__sep" />
        {/* The classifier behind the suggestion kind (fix-suggestion-loop-inert,
            D5): "cli" = a one-shot Claude call routes to one of your prompts
            (the default); "stub" = the offline word-overlap matcher. */}
        <button
          className={`ap-switch ${brain === 'cli' ? 'on' : ''}`}
          onClick={() => mutate({ brain: brain === 'cli' ? 'stub' : 'cli' })}
          disabled={!enabled}
          title="Brain: cli = one-shot Claude classification; stub = offline word-overlap matcher"
        >
          <span className="ap-switch__knob" />
        </button>
        <b>Claude brain</b>
        <span className="ap-muted">{brain === 'cli' ? `cli · ${brainModel}` : 'stub matcher'}</span>

        <span className="ap-bar__spacer" />
        <span className="ap-thresh">
          confidence ≥ <b>{threshold.toFixed(2)}</b>
          <button onClick={() => mutate({ threshold: +(threshold - 0.05).toFixed(2) })} disabled={threshold <= 0.5}>−</button>
          <button onClick={() => mutate({ threshold: +(threshold + 0.05).toFixed(2) })} disabled={threshold >= 0.99}>+</button>
        </span>
      </div>

      <ul className="ap-agents">
        {agents.map((a) => {
          const b = BADGE[a.decision] ?? BADGE.idle;
          return (
            <li key={a.repoId} className={`ap-agent ${a.decision === 'escalate' ? 'is-esc' : ''} ${a.armed ? '' : 'is-off'}`}>
              <span className={`ap-state st-${b.cls}`}>{b.label}</span>
              <span className="ap-agent__id">{a.repoName}</span>
              <span className="ap-agent__pred">
                {a.decision === 'suggestion' && (
                  <>→ <code>{a.label}</code> <span className="ap-conf">{a.confidence.toFixed(2)}</span></>
                )}
                {a.decision === 'escalate' && <span className="ap-muted">{a.reason}</span>}
                {a.decision === 'running' && <span className="ap-muted">agent is running…</span>}
                {(a.decision === 'idle' || a.decision === 'paused' || a.decision === 'off') && (
                  <span className="ap-muted">{a.reason || (a.armed ? '' : 'not armed')}</span>
                )}
              </span>
              <button
                className={`ap-mini ${a.armed ? 'on' : ''}`}
                onClick={() => mutate({ repoId: a.repoId, armed: !a.armed })}
              >
                {a.armed ? 'Disarm' : 'Arm'}
              </button>
            </li>
          );
        })}
        {agents.length === 0 && <li className="autopilot__empty">No agents yet.</li>}
      </ul>
    </>
  );
}
