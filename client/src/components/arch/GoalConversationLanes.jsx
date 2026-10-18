import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import SubagentTranscript from './SubagentTranscript';
import ArchHistoryPanel from './ArchHistoryPanel';
import { Params } from './ArchToolsPanel';
import '../dashboard/toolsPanel.css';
import './archTools.css';

// A repo agent's goal conversation, with the same four lanes the arch's goal conversations have
// (openspec repo-agent-subagents): 💬 Chat (its transcript + composer), 🔌 Tools (the harness
// tools its turns get, its permission scope and how often it called each), 🧾 History (every tool
// call of its session, the arch History lane fed from /goal-conversations/{id}/tool-calls) and
// 🔁 Loops (the goal loop the engine drives it with, the engine's last decision, Stop / Continue).
// The lane is device-local view state, remembered across goal conversations.

const LANES = [
  ['chat', '💬', 'Chat', 'Talk to the goal conversation: its transcript and a composer'],
  ['tools', '🔌', 'Tools', 'The harness tools its turns get, and its permission scope'],
  ['history', '🧾', 'History', 'Every tool call of its session, with its arguments and result'],
  ['loops', '🔁', 'Loops', 'The goal loop the engine drives it with'],
];
const LANE_KEY = 'claudeweb_goalconv_lane';
const POLL_MS = 5000;

function ago(at) {
  const ms = typeof at === 'number' ? at : at ? Date.parse(at) : 0;
  if (!ms) return '';
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

// Poll one of the goal conversation's read-only endpoints while its lane is open.
function usePolled(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setData(await apiGet(path)); setError(''); } catch (e) { setError(e?.message || String(e)); }
  }, [path]);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);
  return { data, error, load };
}

const POLICY_WORDS = {
  'read-only': 'a read-only helper: its CLI runs in plan mode, so every edit, write and mutating command is blocked',
  concurrent: 'a concurrent writer: full access, runs alongside the agent with no lock (it was told to touch only its own files)',
  writer: 'a writer: full access, and it only runs while the agent and every other writer are idle',
};

export function GoalToolsPanel({ id }) {
  const { data: view, error } = usePolled(`/goal-conversations/${encodeURIComponent(id)}/tools`);
  if (!view && !error) return <div className="toolsp arch-tools"><div className="toolsp__empty">Loading its tool surface…</div></div>;
  if (!view) return <div className="toolsp arch-tools"><div className="toolsp__err" role="alert">Couldn't load its tools: {error}</div></div>;
  const server = view.server || {};
  const tools = view.tools || [];
  const builtin = view.builtin || [];
  return (
    <div className="toolsp arch-tools" data-goal-tools={id} data-tools-policy={view.policy}>
      <div className="toolsp__head"><h2>Tools</h2></div>
      <p className="toolsp__intro">
        Every turn of this goal conversation gets the repo agent's harness tools through the <code>{server.name}</code> MCP
        server ({server.transport} at <code>{server.url || '?'}</code>) under its own identity <code>{server.identity}</code>,
        so <code>mark_step</code> and <code>edit_goal_plan</code> act on its own plan. It is {POLICY_WORDS[view.policy] || view.policy}.
        Claude Code's built-in tools come on top, scoped by that permission mode.
      </p>
      <div className="arch-tools__stats">
        <span><b>{tools.length}</b> harness tools</span>
        <span><b>{view.totalCalls ?? 0}</b> calls across {view.sessions ?? 0} session(s)</span>
        <span>permission mode <b data-goal-permission>{view.permissionMode}</b></span>
      </div>
      {builtin.length > 0 && (
        <section className="toolsp__tool arch-tools__tool" data-goal-builtin>
          <div className="toolsp__toolhead arch-tools__toolhead"><b className="arch-tools__name">built-in tools it used</b></div>
          <div className="arch-tools__desc">
            {builtin.map((b) => <span key={b.name} className="arch-tools__mono" style={{ marginRight: 12 }}>{b.name} × {b.calls}</span>)}
          </div>
        </section>
      )}
      {tools.map((tool) => (
        <section className="toolsp__tool arch-tools__tool" key={tool.name} data-tool={tool.name}>
          <div className="toolsp__toolhead arch-tools__toolhead">
            <b className="arch-tools__name">{tool.name}</b>
            <span className="arch-tools__usage">
              {tool.refusedHere ? 'refused here — a goal conversation never starts another'
                : tool.calls > 0 ? `${tool.calls} call${tool.calls === 1 ? '' : 's'} · last ${ago(tool.lastAt)}${tool.lastOutcome === 'error' ? ' · error' : ''}` : 'never called'}
            </span>
          </div>
          <p className="arch-tools__desc">{tool.description}</p>
          <Params schema={tool.inputSchema} />
          <div className="arch-tools__callname">call name in the session: <code>{tool.callName}</code></div>
        </section>
      ))}
    </div>
  );
}

export function GoalLoopPanel({ id, sub, onChanged = null }) {
  const { data, error, load } = usePolled(`/goal-conversations/${encodeURIComponent(id)}/loop`);
  const [cap, setCap] = useState(5);
  const [note, setNote] = useState('');
  const act = async (path, body, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setNote('…');
    try {
      const r = await apiPost(`/goal-conversations/${encodeURIComponent(id)}/${path}`, body);
      setNote(r?.detail || r?.status || r?.error || 'ok');
      load(); onChanged?.();
    } catch (e) { setNote(e?.message || String(e)); }
  };
  if (!data && !error) return <div className="sa__pad sa__dim">Loading its loop…</div>;
  if (!data) return <div className="sa__pad sa__err" role="alert">Couldn't load its loop: {error}</div>;
  const loop = data.loop;
  const engine = data.engine || {};
  // Its own fetch, not the list row: the row polls on its own clock and lags an end by seconds.
  const running = (data.state || sub?.state) === 'running';
  return (
    <div className="gcl" data-goal-loop={id} data-goal-loop-status={loop?.status || 'none'}>
      <section className="gcl__card">
        <div className="gcl__head">
          <span>Goal loop</span>
          <code className="sa__dim">{data.key}</code>
        </div>
        {loop ? (
          <div className="gcl__grid">
            <span className="sa__dim">state</span><b data-goal-loop-active={loop.active ? 'on' : 'off'}>{loop.active ? 'armed' : 'ended'} · {loop.status}{loop.phase ? ` · ${loop.phase}` : ''}</b>
            <span className="sa__dim">kind · mode</span><span>{loop.kind} · {loop.mode}</span>
            <span className="sa__dim">turns</span><span data-goal-loop-turns>{loop.iterationsDone}/{loop.maxIterations || '∞'}</span>
            <span className="sa__dim">armed by</span><span>{loop.armedBy}{loop.armedAt ? ` · ${ago(loop.armedAt)}` : ''}</span>
            <span className="sa__dim">last send</span><span>{loop.lastSentAt ? ago(loop.lastSentAt) : 'not yet'}</span>
            <span className="sa__dim">session</span><code>{loop.sessionId ? loop.sessionId.slice(0, 8) : 'starts fresh on its first turn'}</code>
            {loop.stopReason ? <><span className="sa__dim">stopped</span><span>{loop.stopReason}{loop.stopDetail ? ` — ${loop.stopDetail}` : ''}</span></> : null}
          </div>
        ) : <div className="sa__dim">No loop on file — it ended and was cleaned up, or never armed.</div>}
      </section>
      <section className="gcl__card">
        <div className="gcl__head"><span>Engine</span><span className="sa__dim">ticks every {Math.round(engine.tickSeconds || 0)} s</span></div>
        <div className="gcl__grid">
          <span className="sa__dim">turn running</span><b>{engine.busy ? 'yes' : 'no'}</b>
          <span className="sa__dim">last decision</span><span data-goal-loop-decision>{engine.decision || '—'}{engine.reason ? ` — ${engine.reason}` : ''}</span>
          <span className="sa__dim">waits for</span><span data-goal-loop-block>{!running ? 'nothing — it has ended' : data.writerBlock || (sub?.readOnly ? 'nothing — a read-only helper runs alongside the agent' : 'nothing — the checkout is free')}</span>
        </div>
      </section>
      <section className="gcl__card">
        <div className="gcl__head"><span>Control</span></div>
        <div className="gcl__row">
          {running
            ? <button type="button" className="gp__btn" onClick={() => act('stop', {}, `Stop goal conversation ${id}? Its summary still goes to the agent.`)} data-goal-loop-stop>■ stop</button>
            : (
              <>
                <label className="sa__dim">more turns <input type="number" min={1} max={30} value={cap} onChange={(e) => setCap(e.target.value)} data-goal-loop-cap /></label>
                <button type="button" className="gp__btn gp__btn--primary" onClick={() => act('continue', { maxIterations: Number(cap) || 5 })} data-goal-loop-continue>▶ continue from the plan</button>
              </>
            )}
          {note && <span className="sa__dim" data-goal-loop-note>{note}</span>}
        </div>
        {loop?.goal && (
          <details className="gcl__goal">
            <summary className="sa__dim">the loop prompt it is driven with</summary>
            <pre>{loop.goal}</pre>
          </details>
        )}
      </section>
    </div>
  );
}

export default function GoalConversationLanes({ row, onChanged = null }) {
  const id = row?.id;
  const [lane, setLaneState] = useState(() => { try { return localStorage.getItem(LANE_KEY) || 'chat'; } catch { return 'chat'; } });
  const setLane = (l) => { setLaneState(l); try { localStorage.setItem(LANE_KEY, l); } catch { /* private mode */ } };
  const on = LANES.some(([l]) => l === lane) ? lane : 'chat';
  return (
    <div className="gcl-wrap" data-goal-lanes={id} data-goal-lane={on}>
      <div className="gcl__lanes" role="tablist">
        {LANES.map(([l, icon, label, title]) => (
          <button key={l} type="button" role="tab" aria-selected={on === l} className={`gcl__lane${on === l ? ' gcl__lane--on' : ''}`} title={title} onClick={() => setLane(l)} data-goal-lane-chip={l}>
            {icon} {label}
          </button>
        ))}
      </div>
      <div className="gcl__body">
        {on === 'chat' && <SubagentTranscript row={row} onChanged={onChanged} />}
        {on === 'tools' && <div className="gcl__scroll"><GoalToolsPanel id={id} /></div>}
        {on === 'history' && <div className="gcl__scroll"><ArchHistoryPanel key={id} fetchPath={`/goal-conversations/${encodeURIComponent(id)}/tool-calls`} who="the goal conversation" sessionId={row?.goal?.sessionId || null} /></div>}
        {on === 'loops' && <div className="gcl__scroll"><GoalLoopPanel id={id} sub={row?.goal} onChanged={onChanged} /></div>}
      </div>
    </div>
  );
}
