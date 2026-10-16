import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';

// The Understanding tab of a goal conversation (fleet task 93b481e6): the goal-conversation
// twin of the repo agents' "Ask for understanding". A button forks an ephemeral subagent that
// reads THIS goal's conversation and authors a self-contained SPA explaining its orchestration;
// the harness serves it no-store at /api/arch/goals/{id}/understanding/app/ and we iframe it
// here. The build is owned server-side (its own cancellation token), so this poll only watches
// it — a dashboard refresh never cancels a run, and we reattach via the status endpoint.

const POLL_MS = 3000;

export default function GoalUnderstandingTab({ goalId }) {
  const [status, setStatus] = useState(null); // { status, error, summary, built, builtAt }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [frameKey, setFrameKey] = useState(0); // bump to reload the iframe (no-store, so a reload shows the latest)
  const runningRef = useRef(false);

  const base = `/arch/goals/${encodeURIComponent(goalId)}/understanding`;
  const appSrc = `/api${base}/app/`;

  const load = useCallback(async () => {
    try {
      const r = await apiGet(`${base}/status`);
      setStatus(r);
      const running = r?.status === 'running';
      // A build that just finished → reload the iframe so the fresh app shows.
      if (runningRef.current && !running) setFrameKey((k) => k + 1);
      runningRef.current = running;
    } catch {
      /* keep the last status on a transient error */
    }
  }, [base]);

  useEffect(() => { setStatus(null); setErr(''); runningRef.current = false; load(); }, [load, goalId]);
  useEffect(() => {
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const ask = async () => {
    setBusy(true); setErr('');
    try {
      const r = await apiPost(base, {});
      setStatus(r);
      runningRef.current = r?.status === 'running';
    } catch (e) {
      setErr(e?.message || String(e));
    } finally { setBusy(false); }
  };

  const running = status?.status === 'running';
  const built = !!status?.built;

  return (
    <div className="gu" data-goal-understanding={goalId}>
      <div className="gu__bar">
        <button type="button" className="gu__btn gu__btn--primary" onClick={ask} disabled={busy || running} data-gu-ask>
          🧠 {built ? 'Update understanding' : 'Ask for understanding'}
        </button>
        {running && <span className="gu__state gu__state--run" data-gu-status="running">building… reading this goal's conversation</span>}
        {!running && status?.status === 'error' && <span className="gu__state gu__state--err" data-gu-status="error">{status.error}</span>}
        {!running && status?.status === 'done' && <span className="gu__state gu__state--ok" data-gu-status="done">{status.summary || 'built — rendered below'}</span>}
        {err && <span className="gu__state gu__state--err">{err}</span>}
        <span className="gu__spacer" />
        {built && <button type="button" className="gu__btn" onClick={() => setFrameKey((k) => k + 1)} title="Reload the rendered app" data-gu-reload>↻ reload</button>}
      </div>
      {built ? (
        <iframe key={frameKey} className="gu__frame" src={appSrc} title="Goal understanding app" data-gu-frame />
      ) : (
        <div className="gu__empty" data-gu-empty>
          No Understanding app for this goal yet. Press <b>Ask for understanding</b> — a subagent
          reads this goal conversation and builds a visual explanation of its orchestration
          (the objective, the step plan, and what it has delegated), rendered here.
        </div>
      )}
    </div>
  );
}
