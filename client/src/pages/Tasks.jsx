import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../api/client';
import { useFeature } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';
import MessageBubble from '../components/chat/MessageBubble';
import ActivitySteps from '../components/chat/ActivitySteps';
import ThinkingIndicator from '../components/chat/ThinkingIndicator';
import useArchStream from '../hooks/useArchStream';
import '../components/chat/chat.css';
import './arch.css';

// The Tasks agent's surface (openspec: tasks-agent, D6): the conversation with a
// live view of the running turn (Chat lane) and the eight harness tools with
// their call counts (Tools lane). Built on the arch page's classes and chat
// components: the transcript is polled from GET /api/tasks/messages while the
// Chat lane shows it; the CURRENT turn streams in through the same hook the
// arch page uses, pointed at the "@tasks" run slot. Hosted as the studio Tasks
// tab and as a tab/pane of the Management App the dashboard embeds.

const POLL_MS = 4000;

// The transcript and the live turn describe the same conversation: cut the
// transcript at the live turn's own user message so nothing shows twice, and
// keep a settled live turn until the transcript carries a reply after it.
function splitLive(messages, turn) {
  if (!turn?.user) return { visible: messages, persisted: false };
  let idx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') { idx = i; break; }
  }
  if (idx < 0 || (messages[idx].text || '').trim() !== (turn.user.text || '').trim()) {
    return { visible: messages, persisted: false };
  }
  const persisted = messages.slice(idx + 1).some((m) => m.role === 'assistant');
  return { visible: messages.slice(0, idx), persisted };
}

function ToolsLane() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    apiGet('/tasks/tools')
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e?.message || String(e)); });
    return () => { alive = false; };
  }, []);
  if (error) return <div className="arch__banner arch__banner--err">{error}</div>;
  if (!data) return <div className="arch__thinking">Loading the tool surface…</div>;
  return (
    <div className="arch__overview tasks__tools" data-tools>
      <div className="arch__card">
        <div className="arch__card-head">MCP server</div>
        <div className="arch__dim arch__wrap">
          <code className="arch__mono">{data.server?.name}</code> · {data.server?.transport} · <code className="arch__mono">{data.server?.url}</code>
          {' '}· protocol {data.server?.protocolVersion} · token {data.server?.tokenSet ? 'set' : 'missing'}
        </div>
        <div className="arch__dim" style={{ marginTop: 6 }}>
          {data.totalCalls} tool call{data.totalCalls === 1 ? '' : 's'} recorded · home <code className="arch__mono arch__wrap">{data.home?.path}</code>{data.home?.exists ? '' : ' (created on first send)'}
        </div>
      </div>
      {(data.tools || []).map((tl) => (
        <div key={tl.name} className="arch__card" data-tool={tl.name}>
          <div className="arch__card-head">
            <span><code className="arch__mono">{tl.name}</code></span>
            <span className="arch__pill">{tl.calls} call{tl.calls === 1 ? '' : 's'}</span>
          </div>
          <div className="arch__dim arch__wrap">{tl.description}</div>
          {tl.inputSchema?.properties && Object.keys(tl.inputSchema.properties).length > 0 && (
            <ul className="arch__dim" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {Object.entries(tl.inputSchema.properties).map(([n, p]) => (
                <li key={n}><code className="arch__mono">{n}</code> <span>({p.type}{(tl.inputSchema.required || []).includes(n) ? ', required' : ''})</span> — {p.description}</li>
              ))}
            </ul>
          )}
          {tl.lastOutcome && <div className="arch__dim" style={{ marginTop: 6 }}>last: {tl.lastOutcome}</div>}
        </div>
      ))}
    </div>
  );
}

export default function Tasks({ popup = false }) {
  const enabled = useFeature('tasksAgent');
  const { t } = useT();
  const [state, setState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [lane, setLane] = useState('chat');
  const scrollRef = useRef(null);
  const alive = useRef(true);
  const laneRef = useRef(lane);
  laneRef.current = lane;

  const load = useCallback(async () => {
    try {
      const s = await apiGet('/tasks');
      if (!alive.current) return;
      setState(s);
      if (laneRef.current !== 'chat') { setError(''); return; }
      const m = await apiGet('/tasks/messages');
      if (!alive.current) return;
      setMessages(m.messages || []);
      setError('');
    } catch (e) {
      if (alive.current) setError(e?.message || String(e));
    }
  }, []);

  const stream = useArchStream({ onEnded: load, repoId: '@tasks', streamPath: '/tasks/stream' });
  const { turn } = stream;

  useEffect(() => {
    if (!enabled) return undefined;
    alive.current = true;
    load();
    const tm = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => { alive.current = false; clearInterval(tm); };
  }, [enabled, load]);
  useEffect(() => {
    if (enabled && lane === 'chat') load();
  }, [enabled, lane, load]);

  const run = state?.session?.run;
  useEffect(() => {
    if (!run) return;
    stream.noteServerSeq(run.lastSeq);
    if (run.status !== 'running' || stream.attached() || !stream.behind(run.lastSeq)) return;
    stream.attach();
  }, [run, stream]);

  const { visible, persisted } = splitLive(messages, turn);
  useEffect(() => {
    if (turn && !turn.active && persisted) stream.discard();
  }, [turn, persisted, stream]);

  const liveLen = turn ? turn.assistant.text.length + turn.assistant.steps.length : 0;
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages.length, liveLen]);

  const running = run?.status === 'running';

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text) return;
    try {
      await apiPost('/tasks/send', { text });
      setDraft('');
      setError('');
      stream.attach();
      setTimeout(load, 800);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, [draft, load, stream]);

  const stopTurn = useCallback(async () => {
    try { await apiPost('/tasks/stop-turn', {}); setTimeout(load, 500); } catch (e) { setError(e?.message || String(e)); }
  }, [load]);

  if (!enabled) {
    return <div className="arch arch--off tasks">{t('nav.tasks')}: Advanced mode only.</div>;
  }

  return (
    <div className={`arch tasks${popup ? ' arch--popup' : ''}`} data-tasks>
      <div className="arch__cols">
        <div className="arch__main">
          <div className="arch__head">
            <span className="arch__title">🗂 {t('nav.tasks')} agent</span>
            <span className="arch__meta">
              <span className={`arch__pill ${running ? 'arch__pill--busy' : 'arch__pill--on'}`}>{running ? 'working' : 'idle'}</span>
              turns ideas and prompts into linked tasks on the Task graph
            </span>
          </div>
          <div className="arch__lanes" role="tablist" aria-label="Tasks lanes">
            <button type="button" role="tab" aria-selected={lane === 'chat'} className={`arch__lane${lane === 'chat' ? ' arch__lane--on' : ''}`} onClick={() => setLane('chat')}>💬 Chat</button>
            <button type="button" role="tab" aria-selected={lane === 'tools'} className={`arch__lane${lane === 'tools' ? ' arch__lane--on' : ''}`} onClick={() => setLane('tools')}>🔌 Tools</button>
          </div>
          {error && <div className="arch__banner arch__banner--err">{error}</div>}
          {lane === 'tools' ? (
            <ToolsLane />
          ) : (
            <>
              <div className="arch__scroll" ref={scrollRef}>
                {messages.length === 0 && !turn && (
                  <div className="arch__empty">
                    <p>No conversation yet. Paste a long prompt or a list of things to do; the Tasks agent splits it into tasks with dependencies on the Task graph, and files pure ideas on the Ideas board.</p>
                    <p className="arch__dim">Its home folder: <code>{state?.home?.path}</code>{state?.home?.exists ? '' : ' (created on first send)'}</p>
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
                {running && !turn && <div className="arch__thinking">the Tasks agent is working…</div>}
              </div>
              <div className="arch__composer">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Describe the work; the Tasks agent breaks it into linked tasks…"
                  rows={3}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }}
                />
                <div className="arch__composer-row">
                  <button type="button" className="arch__btn arch__btn--primary" onClick={send} disabled={running || !draft.trim()} data-send>
                    {running ? 'busy' : 'Send'}
                  </button>
                  {running && <button type="button" className="arch__btn arch__btn--danger" onClick={stopTurn}>Stop turn</button>}
                  <span className="arch__dim">Ctrl+Enter sends. Its only tools are the ideas board and the task graph.</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
