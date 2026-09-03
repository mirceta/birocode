import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import { useFeature } from '../context/UiModeContext';
import { useDock } from '../context/DockContext';
import MessageBubble from '../components/chat/MessageBubble';
import ActivitySteps from '../components/chat/ActivitySteps';
import ThinkingIndicator from '../components/chat/ThinkingIndicator';
import ArchToolsPanel from '../components/arch/ArchToolsPanel';
import ArchHistoryPanel from '../components/arch/ArchHistoryPanel';
import useArchStream from '../hooks/useArchStream';
import '../components/chat/chat.css';
import './arch.css';

// The Arch tab (openspec: add-arch-agent, D9): the arch agent's own surface.
// Left: its conversation (operator messages, arch replies, harness wake-ups
// rendered as wake bubbles). Right: the managed-agents strip (availability,
// branch, last actor, elapsed, open-dock), the scope picker, the loop header
// (arm / suggest|drive / cap / Stop) and the home repo. State and the settled
// transcript read from GET /api/arch on a short poll; the CURRENT turn is live
// (task 6c): useArchStream attaches to the @arch run and the page renders its
// thinking / tool steps / streamed reply with the repo chat's own components,
// then hands over to the transcript once it carries the reply.

// The live turn and the polled transcript describe the same conversation, so
// the page shows each turn once: the transcript is cut at the live turn's own
// user message (the CLI writes the transcript as the turn goes), and a settled
// live turn is dropped only once the transcript holds a reply after that
// message — a reply the CLI never persisted stays on screen until the next
// turn starts. The running turn is always the transcript's LAST user message,
// so only that one is compared (a repeated prompt earlier on is not a match).
function splitLive(messages, turn) {
  if (!turn) return { visible: messages, persisted: false };
  let idx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { idx = i; break; }
  }
  const matches = idx !== -1 && !!turn.user && messages[idx].text === turn.user.text;
  if (!matches) {
    // No user event in the live turn: the transcript's trailing reply is the
    // only way to tell it has been persisted.
    const last = messages[messages.length - 1];
    const sameReply = !turn.user && !!last && last.role === 'assistant'
      && !!last.text && last.text.trim() === turn.assistant.text.trim();
    return { visible: sameReply ? messages.slice(0, -1) : messages, persisted: sameReply };
  }
  const persisted = messages.slice(idx + 1).some((m) => m.role === 'assistant' && m.text);
  return { visible: messages.slice(0, idx), persisted };
}

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
  // Managed agents on OTHER harnesses (openspec: add-fleet-arch-agent), as
  // keys "sourceId/repoId" — the same shape the server persists.
  const [fleetDraft, setFleetDraft] = useState([]);
  const [cap, setCap] = useState(6);
  const [mode, setMode] = useState('drive');
  // Lanes, like a repo dock's Builder | Ask | … row — the arch agent has three:
  // the conversation, its Tools (the harness MCP surface) and the History of
  // its tool calls. Chat is the default; the lane is view state, not persisted.
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

  // The live turn: when its stream ends, re-pull the transcript at once so the
  // hand-over (settled live turn -> persisted reply) does not wait for the poll.
  const stream = useArchStream({ onEnded: load });
  const { turn } = stream;

  useEffect(() => {
    if (!enabled) return undefined;
    alive.current = true;
    load();
    const t = setInterval(load, POLL_MS);
    const tick = setInterval(() => setTick((n) => n + 1), 1000);
    return () => { alive.current = false; clearInterval(t); clearInterval(tick); };
  }, [enabled, load]);

  // Attach whenever the server has a running arch turn with events this page
  // has not consumed — page load, a reload mid-turn, a loop-driven wake, an
  // arch-eval send (the run's `user` event puts its seq ahead at once). The
  // seq test is what makes a stale "running" read during hand-over harmless:
  // the run this page just finished reading is not ahead of it, so a settled
  // copy is never replaced by an empty one. A seq that went backwards means
  // the harness restarted.
  const run = state?.session?.run;
  useEffect(() => {
    if (!run) return;
    stream.noteServerSeq(run.lastSeq);
    if (run.status !== 'running' || stream.attached() || !stream.behind(run.lastSeq)) return;
    stream.attach();
  }, [run, stream]);

  const { visible, persisted } = splitLive(messages, turn);

  // Hand-over: the transcript now carries the settled turn's reply.
  useEffect(() => {
    if (turn && !turn.active && persisted) stream.discard();
  }, [turn, persisted, stream]);

  const liveLen = turn ? turn.assistant.text.length + turn.assistant.steps.length : 0;
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, liveLen]);

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
      setError('');
      // The user bubble comes from the run's own `user` event (the harness
      // emits it for every arch send), never drawn locally — one source.
      stream.attach();
      setTimeout(load, 800);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [draft, load, stream]);

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
      const s = await apiPost('/arch/scope', { repoIds: scopeDraft, fleet: fleetDraft });
      setState(s);
      setScopeOpen(false);
      setError('');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [scopeDraft, fleetDraft]);

  // Receiving-side opt-in: let fleet arch agents elsewhere send to THIS harness.
  const setAcceptSends = useCallback(async (accept) => {
    try {
      const s = await apiPost('/arch/fleet', { acceptSends: accept });
      setState(s);
      setError('');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, []);

  // Calling-side consent per subscribed harness: the collector's own flag.
  const setAllowSends = useCallback(async (sourceId, allow) => {
    try {
      await apiPost(`/collector/sources/${sourceId}/sends`, { allow });
      setError('');
      setTimeout(load, 300);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [load]);

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
  const managedFleet = new Set(state?.managedFleet || []);
  const fleet = state?.fleet || { sources: [] };
  const fleetSources = fleet.sources || [];
  const peerText = (s) => {
    const p = s.peer || {};
    if (p.status === 'ok') return `peer ok · build ${p.version || '?'} · ${p.acceptsSends ? 'accepts sends' : 'does not accept sends'}${p.gateOpen ? '' : ' · gate closed'}`;
    if (p.status === 'no-peer-api') return 'no peer API on that build — upgrade it';
    if (p.status === 'unauthorized') return 'peer refused the credential';
    if (p.status === 'unreachable') return `unreachable${p.detail ? ` · ${p.detail}` : ''}`;
    if (p.status === 'never') return 'not probed yet';
    return `${p.status || '?'}${p.detail ? ` · ${p.detail}` : ''}`;
  };

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
          <button
            type="button"
            role="tab"
            aria-selected={lane === 'history'}
            className={`arch__lane${lane === 'history' ? ' arch__lane--on' : ''}`}
            title="Every tool call of this conversation, with its arguments and result"
            onClick={() => setLane('history')}
          >
            🧾 History
          </button>
        </div>
        {!state?.gateOpen && <div className="arch__banner">Autopilot is disabled by the operator (host GUI). The arch agent cannot act until the gate is open.</div>}
        {state?.gateOpen && state?.killSwitch === false && <div className="arch__banner">The autopilot kill switch is off: the arch loop is paused.</div>}
        {error && <div className="arch__banner arch__banner--err">{error}</div>}
        {lane === 'tools' ? (
          <ArchToolsPanel />
        ) : lane === 'history' ? (
          <ArchHistoryPanel liveTurn={turn} sessionId={sessionId} />
        ) : (
        <>
        <div className="arch__scroll" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="arch__empty">
              <p>No conversation yet. Pick the repos it manages, arm it, then tell it what you want across them.</p>
              <p className="arch__dim">Its home repo: <code>{state?.home?.path}</code>{state?.home?.exists ? '' : ' (created on first arm)'}</p>
            </div>
          )}
          {visible.map((m, i) => (
            <div key={i} className="turn">
              <MessageBubble role={m.role} text={m.text} actor={m.actor} />
            </div>
          ))}
          {turn && (
            <div className="turn arch__live" data-live={turn.active ? 'on' : 'settled'}>
              {turn.user && <MessageBubble role="user" text={turn.user.text} actor={turn.user.actor} />}
              {turn.assistant.steps.length > 0 && <ActivitySteps steps={turn.assistant.steps} />}
              {turn.assistant.text && <MessageBubble role="assistant" text={turn.assistant.text} />}
              {turn.active && !turn.assistant.text && turn.assistant.steps.length === 0 && <ThinkingIndicator />}
              {turn.error && <div className="arch__banner arch__banner--err">{turn.error}</div>}
            </div>
          )}
          {running && !turn && <div className="arch__thinking">arch agent is working…</div>}
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
            <button type="button" className="arch__btn" onClick={() => { setScopeDraft([...managed]); setFleetDraft([...managedFleet]); setScopeOpen((o) => !o); }}>scope ✎</button>
          </div>
          {scopeOpen && (
            <div className="arch__scope">
              <div className="arch__scope-group">{fleet.selfLabel || 'this machine'} (self)</div>
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
              {fleetSources.map((s) => {
                const offerable = s.peer?.status === 'ok' && s.allowSends;
                return (
                  <div key={s.id} className="arch__scope-machine">
                    <div className="arch__scope-group">
                      <span className="arch__machine">{s.label}</span>
                      <span className="arch__dim"> · {offerable ? `${(s.repos || []).length} repo(s)` : !s.allowSends && s.peer?.status === 'ok' ? 'allow sends first (Fleet card)' : peerText(s)}</span>
                    </div>
                    {offerable && (s.repos || []).map((r) => (
                      // The peer's OWN arch scope decides (openspec add-fleet-arch-agent, D8):
                      // a repo its arch does not manage is shown, named as such, and cannot
                      // be scoped here — the fix is on that machine's Arch tab.
                      <label key={r.key} className={`arch__scope-row${r.managed === true ? '' : ' arch__scope-row--off'}`} data-managed-there={String(r.managed)}>
                        <input
                          type="checkbox"
                          disabled={r.managed !== true}
                          checked={fleetDraft.includes(r.key)}
                          onChange={(e) => setFleetDraft((d) => (e.target.checked ? [...d, r.key] : d.filter((x) => x !== r.key)))}
                        />
                        {r.name}{r.isSelf ? ' (harness)' : ''}{r.exists ? '' : ' — missing'}
                        {r.managed === true
                          ? <span className={`arch__avail arch__avail--${AVAIL_CLASS[r.availability] || 'dim'}`}>{r.availability}</span>
                          : <span className="arch__avail arch__avail--dim">{r.managed === false ? `not in ${s.label}'s arch scope` : 'peer build does not report its scope'}</span>}
                      </label>
                    ))}
                  </div>
                );
              })}
              <div className="arch__composer-row">
                <button type="button" className="arch__btn arch__btn--primary" onClick={saveScope}>Save scope</button>
                <button type="button" className="arch__btn" onClick={() => setScopeOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
          {agents.length === 0 && !scopeOpen && <div className="arch__dim">No managed repos. Open the scope picker.</div>}
          {agents.map((a) => (
            <div key={a.key || a.repoId} className="arch__agent" data-machine={a.machine}>
              <div className="arch__agent-top">
                <span className="arch__agent-name">
                  {a.isLocal === false && <span className="arch__machine" title={`on machine ${a.machine}`}>{a.machine}</span>}
                  {a.name}
                </span>
                <span className={`arch__avail arch__avail--${AVAIL_CLASS[a.availability] || 'dim'}`}>{a.availability}</span>
              </div>
              <div className="arch__dim arch__mono">
                {a.branch}{a.dirty ? ' · dirty' : ''}{a.branch !== a.defaultBranch ? ` (default ${a.defaultBranch})` : ''}
              </div>
              {a.isLocal === false && a.sendable === false && a.blocked && (
                <div className="arch__dim arch__blocked" data-blocked="true">not sendable: {a.blocked}</div>
              )}
              <div className="arch__dim">
                last actor {a.lastActor}
                {a.runningSince ? ` · running ${ago(a.runningSince)}` : ''}
                {a.availability === 'claimed' ? ' · your branch — left alone' : ''}
              </div>
              {a.tabId
                ? <button type="button" className="arch__link" onClick={() => openDock(a.tabId)}>open dock ↗</button>
                : <span className="arch__dim">{a.isLocal === false ? `dock on ${a.machine}` : 'no dock tab yet'}</span>}
            </div>
          ))}
        </section>

        <section className="arch__card arch__fleet">
          <div className="arch__card-head">
            <span>Fleet</span>
            <span className="arch__dim arch__mono">{fleet.selfLabel}{fleet.version ? ` · ${fleet.version}` : ''}</span>
          </div>
          <label className="arch__scope-row">
            <input
              type="checkbox"
              checked={!!fleet.acceptSends}
              disabled={!state?.gateOpen}
              onChange={(e) => setAcceptSends(e.target.checked)}
            />
            accept fleet sends (let arch agents on other machines task this harness's repos)
          </label>
          {fleetSources.length === 0 && <div className="arch__dim">No subscribed harnesses. Add one in the Harness Event Feed app (Local tab), then allow sends here.</div>}
          {fleetSources.map((s) => (
            <div key={s.id} className="arch__agent" data-source={s.id}>
              <div className="arch__agent-top">
                <span className="arch__agent-name"><span className="arch__machine">{s.label}</span></span>
                <span className={`arch__avail arch__avail--${s.peer?.status === 'ok' ? 'ok' : s.peer?.status === 'never' ? 'dim' : 'claimed'}`}>{s.peer?.status || '?'}</span>
              </div>
              <div className="arch__dim arch__mono arch__wrap">{s.address}</div>
              <div className="arch__dim">{peerText(s)}{s.status && s.status !== 'active' ? ` · feed ${s.status}` : ''}</div>
              {s.peer?.status === 'ok' && (
                <div className="arch__dim" data-managed-there={s.managedThere ?? 0}>
                  its arch manages {s.managedThere ?? 0} of {(s.repos || []).length} repo(s)
                  {(s.managedThere ?? 0) === 0 ? ' — nothing can be sent there until its operator scopes a repo on its Arch tab' : ''}
                </div>
              )}
              <label className="arch__scope-row">
                <input type="checkbox" checked={!!s.allowSends} onChange={(e) => setAllowSends(s.id, e.target.checked)} />
                allow sends to {s.label}
              </label>
            </div>
          ))}
          <div className="arch__dim">Both sides opt in: you allow sends to a machine here; its operator accepts fleet sends there. The collector itself only ever reads.</div>
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
