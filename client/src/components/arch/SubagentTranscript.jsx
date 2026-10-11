import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import MessageBubble from '../chat/MessageBubble';
import ActivitySteps from '../chat/ActivitySteps';
import ThinkingIndicator from '../chat/ThinkingIndicator';
import { stepsFromToolCalls } from '../chat/turnSteps';
import useArchStream from '../../hooks/useArchStream';

// A repo agent's subagent conversation (openspec repo-agent-subagents): its own transcript
// (GET /api/subagents/{id}/messages), its running turn live (the same multiplexed stream the
// arch uses — the run slot is keyed by the subagent's key, fallback /api/subagents/{id}/stream),
// rendered with the repo chat's own bubbles and activity steps, plus a composer that sends a
// message to the subagent (queued for its next turn / the answer when held / a follow-up turn
// once it ended). The arch's goal conversations keep the Arch page; this is the repo twin.

const POLL_MS = 3000;
const TAIL = 40;

export default function SubagentTranscript({ row, onChanged = null }) {
  const sub = row?.goal || {};
  const id = row?.id;
  const [messages, setMessages] = useState([]);
  const [total, setTotal] = useState(0);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const r = await apiGet(`/subagents/${encodeURIComponent(id)}/messages?tail=${TAIL}`);
      setMessages(Array.isArray(r?.messages) ? r.messages : []);
      setTotal(r?.total || 0);
    } catch { /* next poll */ }
  }, [id]);
  useEffect(() => {
    setMessages([]); setNote(''); setText('');
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const stream = useArchStream({ onEnded: load, repoId: sub.key || id, streamPath: `/subagents/${encodeURIComponent(id || '')}/stream` });
  const { turn } = stream;
  // Attach while its turn runs (the panel's 5 s poll carries `running`); drop the settled copy once
  // the transcript on disk has caught up (the next poll after the turn ends).
  useEffect(() => { if (sub.running && !stream.attached()) stream.attach(); }, [sub.running, stream]);
  useEffect(() => { if (turn && !turn.active && !sub.running) { const t = setTimeout(() => stream.discard(), 4000); return () => clearTimeout(t); } return undefined; }, [turn, sub.running, stream]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, turn?.assistant?.text]);

  const send = async () => {
    const body = text.trim();
    if (!body || !id) return;
    setBusy(true); setNote('…');
    try {
      const r = await apiPost(`/subagents/${encodeURIComponent(id)}/message`, { text: body });
      setNote(r?.detail || r?.status || 'sent');
      if (r?.ok) setText('');
      onChanged?.();
      setTimeout(load, 500);
    } catch (e) { setNote(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const ended = sub.state && sub.state !== 'running';
  const placeholder = sub.held ? 'Your answer — it clears the blocked step and resumes the subagent'
    : ended ? 'A follow-up question — one turn in the subagent\'s own session (its loop is not re-armed)'
      : 'A message for the subagent — queued and carried by its next turn';

  return (
    <div className="sa__transcript" data-subagent-transcript={id} data-subagent-total={total}>
      <div className="sa__meta-line">
        <b>{sub.name}</b>
        <span className="sa__dim"> · {sub.readOnly ? 'read-only helper' : `${sub.concurrent ? 'concurrent writer' : 'writer'} on ${sub.branch || '?'}`} · {sub.iterations ?? 0}/{sub.maxIterations || '∞'} turns{sub.outcome ? ` · ${sub.outcome}` : ''}{sub.summaryPending ? ' · summary waiting for the agent to be idle' : sub.summaryDelivered ? ' · summary delivered to the agent' : ''}</span>
      </div>
      <div className="sa__scroll" ref={scrollRef}>
        {total > messages.length && <div className="sa__dim sa__pad">{total - messages.length} earlier message(s) not shown</div>}
        {messages.length === 0 && !turn && <div className="sa__dim sa__pad" data-subagent-no-messages>No turns yet — the subagent speaks when the agent is idle (the engine waits for the checkout).</div>}
        {messages.map((m, i) => (
          <div key={i} className="turn" data-subagent-message={m.role}>
            {m.role === 'assistant' && m.toolCalls?.length > 0 && <ActivitySteps steps={stepsFromToolCalls(m.toolCalls)} />}
            <MessageBubble role={m.role} text={m.text} actor={m.actor} />
          </div>
        ))}
        {turn && (
          <div className="turn" data-live={turn.active ? 'on' : 'settled'}>
            {turn.user && <MessageBubble role="user" text={turn.user.text} actor={turn.user.actor} />}
            {turn.assistant.steps.length > 0 && <ActivitySteps steps={turn.assistant.steps} />}
            {turn.assistant.text && <MessageBubble role="assistant" text={turn.assistant.text} />}
            {turn.active && !turn.assistant.text && turn.assistant.steps.length === 0 && <ThinkingIndicator />}
          </div>
        )}
      </div>
      <div className="sa__composer">
        <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} data-subagent-composer />
        <button type="button" className="gp__btn gp__btn--primary" onClick={send} disabled={busy || !text.trim()} data-subagent-send>{sub.held ? 'Answer' : 'Send'}</button>
        {note && <span className="sa__dim" data-subagent-note>{note}</span>}
      </div>
    </div>
  );
}
