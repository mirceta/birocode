// Goal references (fleet task 64dcb229): the Operator can NAME a goal conversation when talking to the arch.
// A goal's reference is its 8-char id ("4ccefa45"), the id edit_goal_plan / stop_arch_goal / list_arch_goals take.
// This module is the pure half: the mention text, finding "goal <id>" in chat text (the finished-goal summary,
// NEEDS_HUMAN questions, the arch's replies) so it can become a chip, and the tiny event bus that carries a
// mention into the Arch composer and an "open this goal" request to the Subagents tab. Node-tested.

export const MENTION_KEY = 'arch.pendingMention';
export const MENTION_EVENT = 'arch:mention';
export const OPEN_GOAL_EVENT = 'arch:open-goal';
export const OPEN_TAB_EVENT = 'manage:open-tab';

/** "goal 4ccefa45" anywhere in text, case-insensitive; the id is 8 hex chars, a whole word. */
const GOAL_RE = /\bgoal\s+([0-9a-f]{8})\b/gi;

/** A short title from the goal's first line (≤ max chars, ellipsis). */
export function shortTitle(text, max = 48) {
  const one = String(text || '').split('\n')[0].replace(/^Request from [^:]+:\s*/i, '').replace(/\s+/g, ' ').trim();
  return one.length > max ? one.slice(0, max - 1).trimEnd() + '…' : one;
}

/** The text a mention inserts: `goal 4ccefa45 (Build the Prompts tab)`. */
export function goalMention(goal) {
  if (!goal?.id) return '';
  const t = shortTitle(goal.goal || goal.text || '');
  return t ? `goal ${goal.id} (${t})` : `goal ${goal.id}`;
}

/** A board task's mention: `task 5cc3e900 (title)` — the #ref the board tools take. */
export function taskMention(task) {
  if (!task?.id) return '';
  const id = String(task.id).slice(0, 8);
  const t = shortTitle(task.title || '', 40);
  return t && t !== '(deleted)' ? `task ${id} (${t})` : `task ${id}`;
}

/** Text split into plain runs and goal refs: [{ text }, { goal: '4ccefa45', raw: 'goal 4ccefa45' }, …]. */
export function splitGoalRefs(text) {
  const out = [];
  const s = String(text || '');
  GOAL_RE.lastIndex = 0;
  let last = 0;
  let m;
  while ((m = GOAL_RE.exec(s)) !== null) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    out.push({ goal: m[1].toLowerCase(), raw: m[0] });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/** For markdown: every "goal <id>" becomes a link to "#goal-<id>" the renderer turns into a chip. Code spans
 * and existing links are left alone (a cheap guard: no rewrite inside backticks or [..](..)). */
export function linkGoalRefsMarkdown(md) {
  return String(md || '').split(/(`[^`]*`|\[[^\]]*\]\([^)]*\))/).map((part, i) => (i % 2 === 1 ? part
    : part.replace(GOAL_RE, (raw, id) => `[${raw}](#goal-${id.toLowerCase()})`))).join('');
}

/** "#goal-4ccefa45" → "4ccefa45", else null. */
export function goalOfHref(href) {
  const m = /^#goal-([0-9a-f]{8})$/i.exec(String(href || ''));
  return m ? m[1].toLowerCase() : null;
}

/** Insert `piece` into `draft` at the caret [start, end): a separating space on either side when needed; returns
 * { text, caret } (the caret lands right after the inserted piece and its trailing space). */
export function insertAt(draft, piece, start, end) {
  const d = String(draft || '');
  const a = Number.isInteger(start) ? Math.max(0, Math.min(start, d.length)) : d.length;
  const b = Number.isInteger(end) ? Math.max(a, Math.min(end, d.length)) : a;
  const before = d.slice(0, a);
  const after = d.slice(b);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const trail = after && /^\s/.test(after) ? '' : ' ';
  const text = before + lead + piece + trail + after;
  return { text, caret: (before + lead + piece + trail).length };
}

const winOf = (w) => w || (typeof window !== 'undefined' ? window : null);

/** Send a mention to the Operator-facing Arch composer and ask the Management App for the Arch tab. The text also
 * waits in sessionStorage, so an Arch tab that mounts after the switch still picks it up. */
export function mentionInArch(piece, w) {
  const win = winOf(w);
  if (!win || !String(piece || '').trim()) return false;
  try { win.sessionStorage?.setItem(MENTION_KEY, String(piece)); } catch { /* private mode */ }
  try { win.dispatchEvent(new win.CustomEvent(MENTION_EVENT, { detail: { text: String(piece) } })); } catch { /* no events */ }
  try { win.dispatchEvent(new win.CustomEvent(OPEN_TAB_EVENT, { detail: { tab: 'arch' } })); } catch { /* no events */ }
  return true;
}

/** The waiting mention, consumed (null when none). */
export function takeMention(w) {
  const win = winOf(w);
  try {
    const t = win?.sessionStorage?.getItem(MENTION_KEY);
    if (t) win.sessionStorage.removeItem(MENTION_KEY);
    return t || null;
  } catch { return null; }
}

/** Ask the Management App to open a goal in the Subagents tab (ignored elsewhere). */
export function openGoal(goalId, w) {
  const win = winOf(w);
  try { win?.dispatchEvent(new win.CustomEvent(OPEN_GOAL_EVENT, { detail: { goalId: String(goalId || '').toLowerCase() } })); return true; } catch { return false; }
}

/** The conversation running a goal, from /api/arch/conversations rows; null when unknown. */
export const conversationOfGoal = (convs, goalId) =>
  (convs || []).find((c) => c?.goal?.id && String(c.goal.id).toLowerCase() === String(goalId || '').toLowerCase()) || null;
