import { useState } from 'react';
import { mentionInArch, openGoal } from './goalRefs';
import './goalRefs.css';

// A goal's reference chip (fleet task 64dcb229), styled like the Kanban card's #ref: the goal's 8-char id. Click
// copies it (or, with `opens`, opens that goal in the Subagents tab — the chips inside the Arch chat); the tooltip
// carries the full conversation id and the goal's first line.

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* insecure origin: fall back */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch { return false; }
}

export default function GoalRef({ id, conversationId = null, title = '', opens = false, label = null }) {
  const [copied, setCopied] = useState(false);
  if (!id) return null;
  const tip = `goal ${id}${conversationId ? ` · conversation ${conversationId}` : ''}${title ? `\n${String(title).split('\n')[0]}` : ''}\n${opens ? 'click: open it in the Subagents tab' : 'click: copy the id'}`;
  const onClick = async (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (opens) { openGoal(id); return; }
    if (await copyText(id)) { setCopied(true); setTimeout(() => setCopied(false), 1200); }
  };
  return (
    <button type="button" className={`gref${opens ? ' gref--opens' : ''}${copied ? ' gref--copied' : ''}`} onClick={onClick} title={tip} data-goal-ref={id}>
      <code className="gref__code">{label || `#${id}`}</code>{copied && <span className="gref__ok" aria-live="polite">copied</span>}
    </button>
  );
}

/** "💬 mention": puts the reference into the Arch agent composer (at the caret) and switches to the Arch tab. */
export function MentionButton({ text, what = 'goal', compact = false }) {
  if (!text) return null;
  return (
    <button type="button" className="gref__mention" onClick={(e) => { e.stopPropagation(); mentionInArch(text); }} title={`Mention in the Arch chat: inserts “${text}” into the composer so you can finish the sentence`} data-mention={text} data-mention-kind={what}>
      💬{compact ? '' : ' mention'}
    </button>
  );
}
