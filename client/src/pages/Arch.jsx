import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import { useFeature } from '../context/UiModeContext';
import { useDock } from '../context/DockContext';
import MessageBubble from '../components/chat/MessageBubble';
import ArchToolsPanel from '../components/arch/ArchToolsPanel';
import './arch.css';

// The Arch tab (openspec: add-arch-agent, D9): the arch agent's own surface.
// Left: its conversation (operator messages, arch replies, harness wake-ups
// rendered as wake bubbles). Right: the managed-agents strip (availability,
// branch, last actor, elapsed, open-dock), the scope picker, the loop header
// (arm / suggest|drive / cap / Stop) and the home repo. Everything reads from
// GET /api/arch on a short poll — the transcript is the durable record and the
// CLI writes it as the turn goes, so a poll is enough for a middle manager.

const POLL_MS = 3000;
const AVAIL_CLASS = { available: 'ok', busy: 'busy', claimed: 'claimed', unmanaged: 'dim' };

function ago(ms) {
  if (!ms) return '';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${String(s % 60).padStart(2, '0')} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

// `popup`: rendered inside the dashboard's pop-up frame (desktop) — the frame
// owns the title + ×, so the page drops its own title row; "open dock" then
// closes the dashboard via `onOpenDock` instead of navigating (the docks are
// already underneath).
export default function Arch({ popup = false, onOpenDock = null }) {
  const enabled = useFeature('archTab');
  const [state, setState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeDraft, setScopeDraft] = useState([]);
  const [cap, setCap] = useState(6);
  const [mode, setMode] = useState('drive');
  // Lanes, like a repo dock's Builder | Ask | … row — but the arch agent only
  // has two that apply: the conversation, and its Tools (the harness MCP
  // surface). Chat is the default; the lane is view state, not persisted.
  const [lane, setLane] = useState('chat');
  const [, setTick] = useState(0);
  const scrollRef = useRef(null);
  const alive = useRef(true);
  const { setActiveTab } = useDock();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      const s = await apiGet('/arch');
      if (!alive.current) return;
      setState(s);
      const m = await apiGet('/arch/messages');
      if (!alive.current) return;
      setSessionId(m.sessionId);
      setMessages(m.messages || []);
      setError('');
    } catch (e) {
      if (alive.current) setError(e?.message || String(e));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    alive.current = true;
    load();
    const t = setInterval(load, POLL_MS);
    const tick = setInterval(() => setTick((n) => n + 1), 1000);
    return () => { alive.current = false; clearInterval(t); clearInterval(tick); };
  }, [enabled, load]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length]);

  // Suggest mode: the engine's pending wake prompt pre-fills the composer.
  const pending = state?.loop?.pendingPrompt || '';
  useEffect(() => {
    if (pending && !draft) setDraft(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  const running = state?.session?.run?.status === 'running';
  const loop = state?.loop;
  const armed = !!loop?.active;

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    try {
      await apiPost('/arch/send', { text });
      setDraft('');
      setMessages((m) => [...m, { role: 'user', text, actor: 'human' }]);
      setError('');
      setTimeout(load, 800);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [draft, load]);

  const loopAction = useCallback(async (body) => {
    try {
      const s = await apiPost('/arch/loop', body);
      setState(s);
      setError('');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, []);

  const saveScope = useCallback(async () => {
    try {
      const s = await apiPost('/arch/scope', { repoIds: scopeDraft });
      setState(s);
      setScopeOpen(false);
      setError('');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [scopeDraft]);

  const stopTurn = useCallback(async () => {
    try { await apiPost('/arch/stop-turn', {}); setTimeout(load, 500); } catch (e) { setError(e?.message || String(e)); }
  }, [load]);

  const openDock = useCallback((tabId) => {
    if (!tabId) return;
    setActiveTab(tabId);
    if (popup && onOpenDock) onOpenDock();
    else navigate('/studio');
  }, [setActiveTab, navigate, popup, onOpenDock]);

  if (!enabled) return <div className="arch arch--off">The Arch tab is an Advanced-mode feature.</div>;

  const agents = state?.agents || [];
  const repos = state?.repos || [];
  const managed = new Set(state?.managedRepoIds || []);

  return (
    <div className={`arch${popup ? ' arch--popup' : ''}`}>
      <div className="arch__cols">
      <div className="arch__main">
        <div className="arch__head">
          {!popup && <span className="arch__title">Arch agent</span>}
          <span className="arch__meta">
            {loop ? (
              <>
                <span className={`arch__pill arch__pill--${armed ? 'on' : 'off'}`}>{armed ? 'armed' : `loop ${loop.status}`}</span>
                {' · '}{loop.mode}{' · '}{loop.iterationsDone}/{loop.maxIterations || '∞'}
                {loop.stopReason ? ` · ${loop.stopReason}${loop.stopDetail ? `: ${loop.stopDetail}` : ''}` : ''}
              </>
            ) : <span className="arch__pill arch__pill--off">never armed</span>}
            {running && <span className="arch__pill arch__pill--busy">turn running</span>}
            {sessionId && <span className="arch__dim"> · session {sessionId.slice(0, 8)}</span>}
          </span>
        </div>
        <div className="arch__lanes" role="tablist" aria-label="Arch lanes">
          <button
            type="button"
            role="tab"
            aria-selected={lane === 'chat'}
            className={`arch__lane${lane === 'chat' ? ' arch__lane--on' : ''}`}
            title="Talk to the arch agent — the only instructions it follows"
            onClick={() => setLane('chat')}
          >
            💬 Chat
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={lane === 'tools'}
            className={`arch__lane${lane === 'tools' ? ' arch__lane--on' : ''}`}
            title="The harness tools the arch session gets on every turn"
            onClick={() => setLane('tools')}
          >
            🔌 Tools
          </button>
        </div>
        {!state?.gateOpen && <div className="arch__banner">Autopilot is disabled by the operator (host GUI). The arch agent cannot act until the gate is open.</div>}
        {state?.gateOpen && state?.killSwitch === false && <div className="arch__banner">The autopilot kill switch is off: the arch loop is paused.</div>}
        {error && <div className="arch__banner arch__banner--err">{error}</div>}
        {lane === 'tools' ? (
          <ArchToolsPanel />
        ) : (
        <>
        <div className="arch__scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="arch__empty">
              <p>No conversation yet. Pick the repos it manages, arm it, then tell it what you want across them.</p>
              <p className="arch__dim">Its home repo: <code>{state?.home?.path}</code>{state?.home?.exists ? '' : ' (created on first arm)'}</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className="turn">
              <MessageBubble role={m.role} text={m.text} actor={m.actor} />
            </div>
          ))}
          {running && <div className="arch__thinking">arch agent is working…</div>}
        </div>
        <div className="arch__composer">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={pending ? 'Pending wake-up (suggest mode) — send it or edit it' : 'Tell the arch agent what you want across the repos it manages…'}
            rows={3}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }}
          />
          <div className="arch__composer-row">
            <button type="button" className="arch__btn arch__btn--primary" onClick={send} disabled={running || !draft.trim()}>
              {running ? 'busy' : 'Send'}
            </button>
            {running && <button type="button" className="arch__btn arch__btn--danger" onClick={stopTurn}>Stop turn</button>}
            <span className="arch__dim">Ctrl+Enter sends. Messages here are the only instructions it follows.</span>
          </div>
        </div>
        </>
        )}
      </div>

      <aside className="arch__side">
        <section className="arch__card">
          <div className="arch__card-head">
            <span>Loop</span>
            {armed
              ? <button type="button" className="arch__btn arch__btn--danger" onClick={() => loopAction({ action: 'disarm' })}>■ Stop arch agent</button>
              : (
                <button type="button" className="arch__btn arch__btn--primary" onClick={() => loopAction({ action: 'arm', mode, maxIterations: cap })} disabled={managed.size === 0 || !state?.gateOpen}>
                  ▶ Arm
                </button>
              )}
          </div>
          <div className="arch__row">
            <label>
              mode
              <select value={mode} onChange={(e) => { setMode(e.target.value); if (armed) loopAction({ action: 'mode', mode: e.target.value }); }}>
                <option value="drive">drive — sends wake-ups itself</option>
                <option value="suggest">suggest — pre-fills the composer</option>
              </select>
            </label>
            <label>
              cap
              <input type="number" min={1} max={100} value={cap} onChange={(e) => setCap(Number(e.target.value) || 1)} disabled={armed} />
            </label>
          </div>
          <div className="arch__dim">
            {state?.engine ? `engine: ${state.engine.decision}${state.engine.reason ? ` — ${state.engine.reason}` : ''}` : 'engine: idle'}
            {' · '}watermark {state?.watermark ?? '–'}
          </div>
          <div className="arch__dim">Stop = disarm: no further sends; running repo turns finish on their own.</div>
        </section>

        <section className="arch__card">
          <div className="arch__card-head">
            <span>Managed agents ({agents.length})</span>
            <button type="button" className="arch__btn" onClick={() => { setScopeDraft([...managed]); setScopeOpen((o) => !o); }}>scope ✎</button>
          </div>
          {scopeOpen && (
            <div className="arch__scope">
              {repos.map((r) => (
                <label key={r.id} className="arch__scope-row">
                  <input
                    type="checkbox"
                    checked={scopeDraft.includes(r.id)}
                    onChange={(e) => setScopeDraft((d) => (e.target.checked ? [...d, r.id] : d.filter((x) => x !== r.id)))}
                  />
                  {r.name}{r.isSelf ? ' (harness)' : ''}{r.exists ? '' : ' — missing'}
                </label>
              ))}
              <div className="arch__composer-row">
                <button type="button" className="arch__btn arch__btn--primary" onClick={saveScope}>Save scope</button>
                <button type="button" className="arch__btn" onClick={() => setScopeOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
          {agents.length === 0 && !scopeOpen && <div className="arch__dim">No managed repos. Open the scope picker.</div>}
          {agents.map((a) => (
            <div key={a.repoId} className="arch__agent">
              <div className="arch__agent-top">
                <span className="arch__agent-name">{a.name}</span>
                <span className={`arch__avail arch__avail--${AVAIL_CLASS[a.availability] || 'dim'}`}>{a.availability}</span>
              </div>
              <div className="arch__dim arch__mono">
                {a.branch}{a.dirty ? ' · dirty' : ''}{a.branch !== a.defaultBranch ? ` (default ${a.defaultBranch})` : ''}
              </div>
              <div className="arch__dim">
                last actor {a.lastActor}
                {a.runningSince ? ` · running ${ago(a.runningSince)}` : ''}
                {a.availability === 'claimed' ? ' · your branch — left alone' : ''}
              </div>
              {a.tabId
                ? <button type="button" className="arch__link" onClick={() => openDock(a.tabId)}>open dock ↗</button>
                : <span className="arch__dim">no dock tab yet</span>}
            </div>
          ))}
        </section>

        <section className="arch__card">
          <div className="arch__card-head"><span>Home repo</span></div>
          <div className="arch__dim arch__mono arch__wrap">{state?.home?.path}</div>
          {!state?.home?.exists && <div className="arch__dim">not created yet — arming creates it</div>}
          {(state?.home?.commits || []).map((c) => (
            <div key={c.sha} className="arch__dim arch__mono">{c.sha} {c.subject} <span className="arch__dim">· {ago(c.at)} ago</span></div>
          ))}
          <div className="arch__dim">Tools denied in its session: {(state?.disallowedTools || []).join(', ')}. It reads repos through the harness only.</div>
        </section>
      </aside>
      </div>
    </div>
  );
}
