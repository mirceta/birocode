import { useState } from 'react';
import '../../pages/autopilot.css';

// The "Loops" sub-tab of the AutopilotConsole (plans/autopilot-loop-mode.md). Loop
// mode is the deterministic sibling of the classifier: for an armed agent it resends
// ONE fixed prompt every time the agent finishes a turn, until a stop condition —
// the sentinel phrase, a deny-list hit, the iteration cap, or a run error. No brain,
// no LLM judge. One loop per agent.
//
// Per agent we show either the ARM form (prompt + sentinel + cap) or, once armed, the
// LIVE status (iteration counter, state badge, Stop). A finished loop shows its
// outcome and an "Arm again" affordance that reopens the form, pre-filled.

const DEFAULT_SENTINEL = 'LOOP_DONE';
const DEFAULT_CAP = 10;

// Loop status → badge class suffix (reuses the st-* / out-* palette in autopilot.css).
const LOOP_BADGE = {
  looping: { cls: 'run', label: 'looping' },
  done: { cls: 'sent', label: 'done' },
  escalate: { cls: 'esc', label: 'escalated' },
  capped: { cls: 'esc', label: 'capped' },
  error: { cls: 'esc', label: 'error' },
  stopped: { cls: 'off', label: 'stopped' },
};

function LoopRow({ agent, loop, loopAction }) {
  const active = loop?.active;
  // The form is open whenever there's no active loop and the user hasn't dismissed it.
  const [editing, setEditing] = useState(false);
  const [prompt, setPrompt] = useState(loop?.prompt || '');
  const [sentinel, setSentinel] = useState(loop?.sentinel || DEFAULT_SENTINEL);
  const [cap, setCap] = useState(loop?.maxIterations || DEFAULT_CAP);
  const [busy, setBusy] = useState(false);

  const showForm = !active && (editing || !loop);

  const arm = async () => {
    if (!prompt.trim()) return;
    setBusy(true);
    try {
      await loopAction({
        repoId: agent.repoId, action: 'start',
        prompt: prompt.trim(), sentinel: sentinel.trim() || DEFAULT_SENTINEL,
        maxIterations: Number(cap) || DEFAULT_CAP,
      });
      setEditing(false);
    } finally { setBusy(false); }
  };

  const stop = async () => {
    setBusy(true);
    try { await loopAction({ repoId: agent.repoId, action: 'stop' }); }
    finally { setBusy(false); }
  };

  const b = LOOP_BADGE[loop?.status] ?? LOOP_BADGE.stopped;

  return (
    <li className={`lp-card ${active ? 'is-active' : ''}`}>
      <div className="lp-card__head">
        <span className="lp-card__repo">{agent.repoName}</span>
        {loop && <span className={`ap-state st-${b.cls}`}>{b.label}</span>}
      </div>

      {active ? (
        // --- live status ---
        <div className="lp-live">
          <code className="lp-live__prompt" title={loop.prompt}>{loop.prompt}</code>
          <div className="lp-live__meta">
            <span className="lp-stat">
              <span className="lp-stat__k">iterations</span>
              <span className="lp-stat__v">{loop.iterationsDone} / {loop.maxIterations}</span>
            </span>
            <span className="lp-stat">
              <span className="lp-stat__k">sentinel</span>
              <code className="lp-stat__v">{loop.sentinel}</code>
            </span>
            {loop.lastSentAt > 0 && (
              <span className="lp-stat">
                <span className="lp-stat__k">last sent</span>
                <span className="lp-stat__v">{new Date(loop.lastSentAt).toLocaleTimeString()}</span>
              </span>
            )}
          </div>
          <div className="lp-progress">
            <div className="lp-progress__bar"
              style={{ width: `${Math.min(100, (loop.iterationsDone / loop.maxIterations) * 100)}%` }} />
          </div>
          <button className="lp-stop" onClick={stop} disabled={busy}>■ Stop loop</button>
        </div>
      ) : showForm ? (
        // --- arm form ---
        <form className="lp-form" onSubmit={(e) => { e.preventDefault(); arm(); }}>
          <label className="lp-field">
            <span className="lp-field__k">Prompt to resend</span>
            <textarea
              className="lp-field__prompt" rows={2} value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. Keep going. Do the next slice yourself. Print LOOP_DONE when nothing is left."
            />
          </label>
          <div className="lp-form__row">
            <label className="lp-field">
              <span className="lp-field__k">Sentinel (stop phrase)</span>
              <input className="lp-field__in" value={sentinel}
                onChange={(e) => setSentinel(e.target.value)} placeholder={DEFAULT_SENTINEL} />
            </label>
            <label className="lp-field lp-field--cap">
              <span className="lp-field__k">Max iterations</span>
              <input className="lp-field__in" type="number" min={1} max={100} value={cap}
                onChange={(e) => setCap(e.target.value)} />
            </label>
          </div>
          <div className="lp-form__actions">
            <button className="lp-arm" type="submit" disabled={busy || !prompt.trim()}>Arm loop</button>
            {loop && <button className="lp-mini" type="button" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
        </form>
      ) : (
        // --- finished loop: outcome + re-arm ---
        <div className="lp-done">
          <span className="ap-muted">
            {loop.iterationsDone} iteration{loop.iterationsDone === 1 ? '' : 's'} sent
            {loop.status === 'done' && ' · agent reported done'}
            {loop.status === 'escalate' && ' · handed back to you (risky action)'}
            {loop.status === 'capped' && ' · stopped at the cap'}
            {loop.status === 'error' && ' · paused on a run error'}
            {loop.status === 'stopped' && ' · stopped by you'}
          </span>
          <button className="lp-mini on" onClick={() => setEditing(true)}>Arm again</button>
        </div>
      )}
    </li>
  );
}

export default function LoopsView({ data, loopAction }) {
  const agents = data?.agents ?? [];
  const loops = data?.loops ?? [];
  const byRepo = Object.fromEntries(loops.map((l) => [l.repoId, l]));

  return (
    <>
      <p className="autopilot__summary">
        Loop mode resends <b>one fixed prompt</b> every time the agent finishes a turn, so it
        pushes itself through “which slice next?”-style questions. It stops the moment the agent
        prints the <b>sentinel</b>, mentions a deny-listed risky action, or hits the iteration
        cap. Deterministic — no brain, no LLM judge. Sends are still fenced by the operator gate
        and the kill switch, and every resend is audited.
      </p>
      <ul className="lp-list">
        {agents.map((a) => (
          <LoopRow key={a.repoId} agent={a} loop={byRepo[a.repoId]} loopAction={loopAction} />
        ))}
        {agents.length === 0 && <li className="autopilot__empty">No agents yet.</li>}
      </ul>
    </>
  );
}
