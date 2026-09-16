import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, apiPost } from '../../api/client';

// One backend-owned "build an app from this dock's conversation" run, as the dock sees
// it (openspec add-ask-for-understanding, auto-understanding-after-turn, goal-app). The
// 🧠 Ask-for-understanding and the 🎯 Update-goal buttons share this exact state
// machine — only the API family differs (`base`: '/understanding' | '/goal'):
//
//   - start-or-join: POST {base}/ask with the builder lane's sessionId, then poll
//     GET {base}/status every 5 s (dock cadence) until the run is terminal;
//   - reattach on mount / repo change: pick up a running build (spinner + poll) or a
//     result that landed while this dock was away — without starting a run;
//   - the per-repo, SERVER-persisted Auto flag (GET/POST {base}/auto): optimistic
//     flip, reverted on error; the backend re-runs by itself after every completed
//     builder turn, browser or not;
//   - the poll nudge: when THIS dock watches its builder turn go running → done while
//     Auto is on, look for the auto-run 1.5 s later so the spinner/result appears
//     without a manual refresh (the client sees "done" a beat before the trigger
//     enqueues the job).
export default function useAppBuild({ repoId, base, enabled, sessionId, chatStatus, nudge = true }) {
  const [run, setRun] = useState(null); // { status, error? } | null
  const [auto, setAuto] = useState(false);
  const pollRef = useRef(null);

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const fetchStatus = useCallback(async () => {
    try {
      const r = await apiGet(`${base}/status`, { repoId });
      setRun(r);
      if (r.status !== 'running') stopPoll();
      return r;
    } catch {
      stopPoll();
      return null;
    }
  }, [base, repoId]);

  const startPoll = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(fetchStatus, 5000);
  };

  // Reattach on mount / repo-change.
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    setRun(null);
    (async () => {
      const r = await fetchStatus();
      if (alive && r?.status === 'running') startPoll();
    })();
    return () => {
      alive = false;
      stopPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, repoId, fetchStatus]);

  // Load the persisted auto flag on mount / repo-change.
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    setAuto(false);
    (async () => {
      try {
        const r = await apiGet(`${base}/auto`, { repoId });
        if (alive) setAuto(!!r.enabled);
      } catch { /* leave off; the toggle just shows the default */ }
    })();
    return () => { alive = false; };
  }, [enabled, base, repoId]);

  const toggleAuto = async () => {
    const next = !auto;
    setAuto(next);
    try {
      await apiPost(`${base}/auto`, { enabled: next }, { repoId });
    } catch {
      setAuto(!next); // revert the optimistic flip
    }
  };

  const prevStatusRef = useRef(chatStatus);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = chatStatus;
    if (!enabled || !auto || !nudge) return undefined;
    if (prev !== 'running' || chatStatus !== 'done') return undefined;
    const timer = setTimeout(async () => {
      const r = await fetchStatus();
      if (r?.status === 'running') startPoll();
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatStatus, enabled, auto, nudge, fetchStatus]);

  const ask = async () => {
    try {
      const r = await apiPost(`${base}/ask`, { sessionId }, { repoId });
      setRun(r);
      if (r.status === 'running') startPoll();
    } catch (err) {
      let text = err.message;
      try {
        text = JSON.parse(err.message).error || text;
      } catch { /* raw text */ }
      setRun({ status: 'error', error: text });
    }
  };

  return { run, busy: run?.status === 'running', auto, toggleAuto, ask };
}
