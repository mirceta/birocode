import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../api/client';
import ErrorBanner from '../components/shared/ErrorBanner';
import './autopilot.css';

// Loop-autopilot (plans/loop-autopilot.md): the live dashboard. The backend engine
// (AutopilotService) classifies each armed, idle agent's last message into a routine
// prompt or "escalate"; this tab surfaces that, lets you arm/disarm agents, set the
// confidence threshold, and hit the kill switch.
//
// Two modes (the Auto-advance switch): OFF = suggest-only (it predicts, you press
// send); ON = auto-advance (Slice 3) — a confident, non-risky suggestion is SENT to
// the agent on your behalf, every send recorded in the audit trail.
const POLL_MS = 4000;

const BADGE = {
  suggestion: { cls: 'sugg', label: 'suggestion' },
  sent: { cls: 'sent', label: 'sent' },
  escalate: { cls: 'esc', label: 'needs you' },
  running: { cls: 'run', label: 'running' },
  idle: { cls: 'idle', label: 'idle' },
  paused: { cls: 'idle', label: 'paused' },
  off: { cls: 'off', label: 'off' },
};

export default function Autopilot() {
  const [tab, setTab] = useState('agents');
  const [data, setData] = useState(null); // { enabled, threshold, denyList, agents, log }
  const [discover, setDiscover] = useState(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({});
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      setData(await apiGet('/autopilot'));
      setError('');
    } catch {
      setError('Could not load autopilot state.');
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [load]);

  // Lazy-load the discovered set the first time the Routine-prompts tab opens.
  useEffect(() => {
    if (tab === 'prompts' && !discover) {
      apiGet('/autopilot/discover').then(setDiscover).catch(() => setError('Could not load discovery.'));
    }
  }, [tab, discover]);

  const mutate = useCallback(async (body) => {
    try {
      setData(await apiPost('/autopilot/config', body)); // returns fresh state
    } catch {
      setError('Could not update autopilot settings.');
    }
  }, []);

  const agents = data?.agents ?? [];
  const log = data?.log ?? [];
  const audit = data?.audit ?? [];
  const enabled = data?.enabled ?? true;
  const autoAdvance = data?.autoAdvance ?? false;
  const threshold = data?.threshold ?? 0.85;
  const routines = discover?.routines ?? [];

  return (
    <div className="autopilot">
      <header className="autopilot__head">
        <div>
          <h2 className="autopilot__title">Autopilot</h2>
          <p className="autopilot__sub">
            Advances idle agents through your routine prompts, or escalates when it
            hits a real decision. {autoAdvance
              ? 'Auto-advance is ON — confident, non-risky prompts are sent for you.'
              : 'Suggest-only — you still press send.'}
          </p>
        </div>
      </header>

      {error && <ErrorBanner message={error} />}

      <nav className="ap-tabs">
        <button className={tab === 'agents' ? 'on' : ''} onClick={() => setTab('agents')}>Agents</button>
        <button className={tab === 'prompts' ? 'on' : ''} onClick={() => setTab('prompts')}>
          Routine prompts{routines.length ? ` ${routines.length}` : ''}
        </button>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
          Suggestion history
        </button>
        <button className={tab === 'audit' ? 'on' : ''} onClick={() => setTab('audit')}>
          Audit{audit.length ? ` ${audit.length}` : ''}
        </button>
      </nav>

      {tab === 'agents' && (
        <>
          <div className="ap-bar">
            <button
              className={`ap-switch ${enabled ? 'on' : ''}`}
              onClick={() => mutate({ enabled: !enabled })}
              title="Global kill switch"
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
      )}

      {tab === 'prompts' && (
        <>
          <p className="autopilot__summary">
            The set the brain may send — confirmed from your custom prompts + mined history.
            Autopilot only ever sends one of these, or escalates.
          </p>
          <ol className="autopilot__list">
            {routines.map((r, i) => (
              <li key={i} className="routine">
                <div className="routine__rank">{i + 1}</div>
                <div className="routine__body">
                  <div className="routine__line">
                    <span className="routine__text">{r.text}</span>
                    <span className="routine__count">×{r.count}</span>
                    {r.matchesCustomPrompt && <span className="routine__tag">★ custom</span>}
                  </div>
                  <div className="routine__meta">
                    {r.sessions} sessions · {r.repos} repos
                    {r.sampleContexts?.length > 0 && (
                      <button className="routine__toggle" onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}>
                        {open[i] ? 'hide contexts' : 'show contexts'}
                      </button>
                    )}
                  </div>
                  {open[i] && r.sampleContexts?.length > 0 && (
                    <ul className="routine__contexts">
                      {r.sampleContexts.map((c, j) => (
                        <li key={j} className="routine__context">
                          <span className="routine__context-label">after</span> {c}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
            {discover && routines.length === 0 && <li className="autopilot__empty">No routine prompts discovered yet.</li>}
          </ol>
        </>
      )}

      {tab === 'history' && (
        <ul className="ap-log">
          {log.map((e, i) => (
            <li key={i}>
              <span className="ap-log__t">{new Date(e.at).toLocaleTimeString()}</span>
              <span className="ap-log__ag">{e.repoName}</span>
              <span className={`ap-out out-${e.outcome === 'escalated' ? 'esc' : 'sugg'}`}>{e.outcome}</span>
              <span className="ap-log__pr">{e.label ? <code>{e.label}</code> : <span className="ap-muted">—</span>}</span>
              <span className="ap-log__cf">{e.confidence ? e.confidence.toFixed(2) : ''}</span>
            </li>
          ))}
          {log.length === 0 && <li className="autopilot__empty">No suggestions yet — arm an agent and wait for its next idle turn.</li>}
        </ul>
      )}

      {tab === 'audit' && (
        <>
          <p className="autopilot__summary">
            Every prompt autopilot actually <b>sent</b> on your behalf — the durable,
            append-only record (most recent first).
          </p>
          <ul className="ap-log ap-log--audit">
            {audit.map((e, i) => (
              <li key={i}>
                <span className="ap-log__t">{new Date(e.at).toLocaleString()}</span>
                <span className="ap-log__ag">{e.repoName}</span>
                <span className="ap-out out-sent">sent</span>
                <span className="ap-log__pr"><code>{e.prompt}</code></span>
                <span className="ap-log__cf">{e.confidence ? e.confidence.toFixed(2) : ''}</span>
                <span className="ap-log__ans" title={e.answeredMessage}>↳ {e.answeredMessage}</span>
              </li>
            ))}
            {audit.length === 0 && (
              <li className="autopilot__empty">
                Nothing auto-sent yet. Turn on Auto-advance and arm an agent.
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
