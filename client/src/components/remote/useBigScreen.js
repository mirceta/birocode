// The big-screen listener (openspec sofa-mode, design D2). While this tab is a big screen it polls
// GET /api/remote/commands after the last seq it handled, runs each command through the dispatch
// table, and heartbeats what it shows to POST /api/remote/screens so the phone can say "projector is
// showing: …". Whether on or off, it installs `window.claudewebRemote(cmd)` — the hook an embedding
// host (the living-room WebView2 presenter) calls directly, no polling needed.
import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { harnessRootFromLocation } from '../../manage/harnessLink.js';
import {
  BIG_SCREEN_KEY, SCREEN_ID_KEY, SEQ_KEY, createDispatcher, detectBundle, readBigScreen, restoreZoom,
} from './remoteDispatch.js';

const POLL_MS = 1000;
const HEARTBEAT_MS = 5000;

function screenId() {
  try {
    let id = sessionStorage.getItem(SCREEN_ID_KEY);
    if (!id) { id = Math.random().toString(36).slice(2, 10); sessionStorage.setItem(SCREEN_ID_KEY, id); }
    return id;
  } catch { return 'screen'; }
}

/**
 * `activeAgent` / `activeRepoId` / `view`: what this tab shows (for the heartbeat and for `stop`);
 * `navigate`: the SPA router's navigate when the page is the studio (null in the Management App).
 * Returns { on, name, setOn, health, lastOutcome, pairNew }.
 */
export function useBigScreen({ activeAgent = null, activeRepoId = null, view = null, navigate = null, layout = null } = {}) {
  const [{ on, name }, setState] = useState(() => (typeof window === 'undefined' ? { on: false, name: '' } : readBigScreen(window.localStorage, window.location.search)));
  const [health, setHealth] = useState('ok'); // ok | warn
  const [lastOutcome, setLastOutcome] = useState('');
  const live = useRef({ activeAgent, activeRepoId, view, navigate, layout });
  live.current = { activeAgent, activeRepoId, view, navigate, layout };
  const selfRepo = useRef(null);
  const dispatchRef = useRef(null);

  // The dispatcher and the hook — installed once per page, on or off.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    restoreZoom(window, document);
    apiGet('/repos').then((list) => { selfRepo.current = (Array.isArray(list) ? list : []).find((r) => r.isSelf)?.id || null; }).catch(() => {});
    const dispatch = createDispatcher({
      win: window,
      doc: document,
      root: harnessRootFromLocation(),
      bundle: detectBundle(window.location.pathname),
      screenName: name || 'big screen',
      selfRepoId: () => selfRepo.current,
      activeRepoId: () => live.current.activeRepoId,
      navigate: (p) => live.current.navigate?.(p),
      post: apiPost,
    });
    dispatchRef.current = dispatch;
    const hook = async (cmd) => { const out = await dispatch(cmd); setLastOutcome(out); return out; };
    window.claudewebRemote = hook;
    return () => { if (window.claudewebRemote === hook) delete window.claudewebRemote; };
  }, [name]);

  // Polling + heartbeat while on.
  useEffect(() => {
    if (!on || typeof window === 'undefined') return undefined;
    let stopped = false;
    let seq = -1;
    try { const s = Number(sessionStorage.getItem(SEQ_KEY)); if (Number.isFinite(s) && s >= 0) seq = s; } catch { /* private mode */ }
    const id = screenId();
    const beat = () => apiPost('/remote/screens', {
      id, name: name || 'big screen', url: window.location.href,
      activeAgent: live.current.activeAgent, view: live.current.view, layout: live.current.layout,
    }).catch(() => {});
    const poll = async () => {
      if (stopped) return;
      try {
        const r = await apiGet(`/remote/commands?after=${seq}`);
        if (stopped) return;
        setHealth('ok');
        const cmds = Array.isArray(r?.commands) ? r.commands : [];
        for (const c of cmds) {
          seq = c.seq;
          try { sessionStorage.setItem(SEQ_KEY, String(seq)); } catch { /* private mode */ }
          const out = await dispatchRef.current?.(c);
          if (out) setLastOutcome(out);
        }
        if (!cmds.length && typeof r?.seq === 'number' && r.seq > seq) {
          seq = r.seq; // catch up (a fresh listener) — nothing to replay
          try { sessionStorage.setItem(SEQ_KEY, String(seq)); } catch { /* private mode */ }
        }
      } catch { setHealth('warn'); }
    };
    beat();
    poll();
    const pollTimer = setInterval(poll, POLL_MS);
    const beatTimer = setInterval(beat, HEARTBEAT_MS);
    return () => { stopped = true; clearInterval(pollTimer); clearInterval(beatTimer); };
  }, [on, name]);

  const setOn = useCallback((next, nextName) => {
    const nm = next ? (nextName || name || 'big screen') : '';
    try { window.localStorage.setItem(BIG_SCREEN_KEY, nm); } catch { /* private mode */ }
    if (!next) { try { sessionStorage.removeItem(SEQ_KEY); } catch { /* private mode */ } }
    setState({ on: !!next, name: nm });
  }, [name]);

  const pairNew = useCallback(() => apiPost('/remote/pair/new'), []);

  return { on, name, setOn, health, lastOutcome, pairNew };
}
