// Pure helpers of the phone remote (openspec sofa-mode, design D3) — node-tested.

/** The views the phone's view row offers, in order. */
export const REMOTE_VIEWS = ['kanban', 'status', 'arch', 'fleet'];

/** A dock tab's badge for the agent list: busy | waiting | unseen | '' (one, by urgency). */
export function badgeOf(tab) {
  if (!tab) return '';
  if (tab.status === 'running') return 'busy';
  if (tab.waiting) return 'waiting';
  if (tab.unseenResult) return 'unseen';
  return '';
}

/** What the header says the projector shows, from the screens list: null when nothing listens. */
export function showingLine(screens) {
  const list = Array.isArray(screens) ? screens : [];
  if (!list.length) return null;
  const s = list[0];
  return s.activeAgent ? `${s.name} · ${s.activeAgent}` : s.view ? `${s.name} · ${s.view}` : s.name;
}

/** The last assistant message of a transcript, or null. */
export function lastReply(messages) {
  const list = Array.isArray(messages) ? messages : [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if ((m.role || '').toLowerCase() === 'assistant' && (m.text || '').trim()) return m;
  }
  return null;
}

/**
 * The open question of a conversation, if its latest turn ended on an AskUserQuestion: the LAST
 * tool call of the session is an AskUserQuestion with no result yet, and the last message is the
 * assistant's. Returns { question, options: [{ label, description }] } or null.
 */
export function openQuestion(toolCalls, messages) {
  const tools = Array.isArray(toolCalls) ? toolCalls : [];
  const last = tools[tools.length - 1];
  if (!last || last.name !== 'AskUserQuestion') return null;
  if ((last.result || '').trim()) return null;
  const msgs = Array.isArray(messages) ? messages : [];
  const lastMsg = msgs[msgs.length - 1];
  if (lastMsg && (lastMsg.role || '').toLowerCase() === 'user') return null;
  let input = last.input;
  if (typeof input === 'string') { try { input = JSON.parse(input); } catch { return null; } }
  const q = input?.questions?.[0];
  if (!q) return null;
  const options = (q.options || []).map((o) => ({ label: o.label || String(o), description: o.description || '' })).filter((o) => o.label);
  return options.length ? { question: q.question || '', header: q.header || '', options } : null;
}

/** Body for POST /api/chat from the phone: the lane only when not builder, the session when known. */
export function chatBody(text, { lane, sessionId } = {}) {
  const body = { message: text };
  if (lane && lane !== 'builder') body.lane = lane;
  if (sessionId) body.sessionId = sessionId;
  return body;
}

/** The composer's target label: the agent's name, "the arch", or nothing. */
export function targetLabel(target, t = (k) => k) {
  if (!target) return '';
  if (target.kind === 'arch') return t('remote.theArch');
  return target.name || target.repoId || '';
}

/** Digits only, at most six — what the PIN field accepts. */
export function cleanPin(raw) {
  return String(raw || '').replace(/\D/g, '').slice(0, 6);
}
