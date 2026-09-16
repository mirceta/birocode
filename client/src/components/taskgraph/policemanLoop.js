// The Policeman tab's pure rules (openspec one-policeman): how the loop's status, sweep rows and
// journal read in words. Framework-free (node --test), like cardSections.js. The panel renders
// ONLY what these return, so the explanation cannot drift from the product.
import { ago, OBSERVATIONS } from './cardSections.js';

/** What set a pass off → words. */
export const TRIGGERS = {
  startup: 'at startup',
  timer: 'the minute timer',
  operator: 'you pressed Run now',
};
export const triggerWord = (t) => TRIGGERS[t] || t || 'unknown';

/** The column words the board uses. */
export const COLUMN = { todo: 'To do', doing: 'Doing', committed: 'Committed', 'pr-opened': 'PR open', 'pr-merged': 'Merged', done: 'Done' };
export const columnWord = (s) => COLUMN[s] || COLUMN.todo;

/** The loop's headline state from its status payload: [tone, label]. Pure. */
export function loopState(st) {
  if (!st) return ['loading', 'loading…'];
  if (st.running) return ['busy', 'pass running'];
  if (st.lastAt == null) return ['off', 'no pass yet'];
  const cadence = `every ${st.intervalSeconds || 60} s · ${st.passes} pass${st.passes === 1 ? '' : 'es'} since start`;
  if (st.settings && st.settings.enabled === false) return ['wait', `${cadence} · reading off`];
  return ['on', cadence];
}

/** "last pass 12 s ago (the minute timer) · next in 48 s · 2 cards need you". Pure. */
export function timingLine(st, now = Date.now()) {
  if (!st || st.lastAt == null) return 'no pass yet';
  const parts = [`last pass ${ago(now - st.lastAt) || '0 s'} ago${st.last ? ` (${triggerWord(st.last.trigger)})` : ''}`];
  if (st.nextDueAt != null) {
    const due = st.nextDueAt - now;
    parts.push(due <= 0 ? 'next any moment' : `next in ${ago(due) || '0 s'}`);
  }
  const need = (st.cards || []).filter((c) => c.needsHuman).length;
  parts.push(need ? `${need} card${need === 1 ? '' : 's'} need${need === 1 ? 's' : ''} you` : 'nothing needs you');
  return parts.join(' · ');
}

/** One journal entry in a sentence: what happened, or that nothing did. Pure. */
export function entrySummary(e) {
  if (!e) return '';
  if (e.error) return `failed: ${e.error}`;
  const bits = [];
  if (e.traced?.length) bits.push(`traced ${e.traced.length} PR${e.traced.length === 1 ? '' : 's'}`);
  if (e.changes?.length) bits.push(`moved ${e.changes.length} card${e.changes.length === 1 ? '' : 's'}`);
  if (e.questions?.length) {
    const tokens = e.questions.reduce((n, q) => n + (q.tokens || 0), 0);
    bits.push(`asked 🧠 ${e.questions.length}${tokens ? ` (${tokens.toLocaleString('en-US')} tokens)` : ''}`);
  }
  if (e.raised?.length) bits.push(`raised ${e.raised.length} 🆘`);
  if (e.cleared?.length) bits.push(`cleared ${e.cleared.length} 🆘`);
  if (bits.length === 0) return e.repeats > 1 ? `${e.repeats} quiet passes — nothing to move, nobody to ask, nothing to flag` : 'quiet — nothing to move, nobody to ask, nothing to flag';
  return bits.join(' · ');
}

/** When an entry ran: one time, or a run's span. Pure. */
export function entryWhen(e, now = Date.now()) {
  if (!e) return '';
  const first = ago(now - e.at) || '0 s';
  if (e.repeats > 1 && e.lastAt && e.lastAt !== e.at) return `${first} → ${ago(now - e.lastAt) || '0 s'} ago`;
  return `${first} ago`;
}

/** The verdict counts in the same words the board uses. Pure. */
export const verdictLine = (v) => (v ? `${v.honest} honest · ${v.dishonest} not verified yet · ${v.stuck} need human · ${v.manual} manual` : 'no verdict yet');

/** What the last pass did to one sweep row, as short lines: [[verb, text], …]. Pure. */
export function rowActions(row) {
  const p = row?.thisPass;
  if (!p) return [];
  const out = [];
  for (const t of p.traced || []) out.push(['traced', `${t.pr} — ${t.how}`]);
  for (const m of p.moved || []) out.push(['moved', `${columnWord(m.from)} → ${columnWord(m.to)}`]);
  for (const q of p.asked || []) out.push(q.error ? ['asked 🧠', `no usable answer — ${q.error}`] : ['asked 🧠', `one question · ${(q.tokens || 0).toLocaleString('en-US')} tokens`]);
  if (p.raised) out.push(['raised', '🆘']);
  if (p.cleared) out.push(['cleared', '🆘']);
  return out;
}

/** The model's reading of a row as [icon, word, meaning]; a dash when nothing was read yet. Pure. */
export function readingOf(row) {
  const o = row?.observation;
  if (!o) return ['—', 'not read yet', 'the agent has said nothing since the card was assigned, or reading is off'];
  const [icon, word, meaning] = OBSERVATIONS[o.state] || ['👁', o.state, ''];
  return [icon, word, meaning];
}

/** The flag on a row in words: null, or { text, sub }. Pure. */
export function flagOf(row, now = Date.now()) {
  const f = row?.needsHuman;
  if (!f) return null;
  const who = f.by === 'policeman' || f.by === 'board-check' ? 'the policeman' : f.by === 'agent' ? 'the agent' : f.by === 'operator' ? 'you' : f.by;
  if (f.answer) return { text: 'answered — waiting for the agent', sub: `you: “${f.answer}” · ${ago(now - (f.answeredAt || f.at))} ago` };
  return { text: 'needs you', sub: `${f.reason || 'a human has to step in'} · raised ${ago(now - f.at)} ago by ${who}` };
}

// ---- What it is: the explainer's data ---------------------------------------------------------

/** One pass, in order — every step but one is harness code. */
export const PASS = [
  ['trace', 'For every in-flight card whose assignee records no pull request yet: list that repo’s PRs on GitHub and trace each to the card it delivers (recorded PR or branch, the card’s #ref in the title, or the title itself). A traced PR is linked to the card.', 'code'],
  ['facts', 'For every assignee on this machine: read the recorded branch from its clone. For every card that names a pull request, on any machine: is it open, merged, closed? Is the merge live?', 'code'],
  ['move', 'Move each card FORWARD to what the facts prove — never backwards, never on a claim. Record the verified state and a plain warning when the column is ahead of the facts.', 'code'],
  ['judge', 'Judge every card: honest · not verified yet · stuck (pinged, no PR, blocked or silent past the window) · manual. Stamp 🆘 on the mechanically stuck.', 'code'],
  ['ask', 'For every card whose assignee has said something new since the card’s last reading: ONE question to the model — “here are its last messages: which state is it in, and why, in one line”. The answer, checked against the seven states, becomes the card’s Agent section. Nothing new, nothing asked.', 'model'],
  ['flag', 'Flag by rule, informed by the reading: a question, a block or an error that stands unanswered for two hours; a column that contradicts the facts for two sweeps. One name on the flag. You answer on the card; the answer goes to the agent; the flag clears once the agent continues.', 'code'],
  ['journal', 'Write the pass down: what set it off, what it traced, moved, asked and answered, raised and cleared, the verdict, the cost, any error.', 'code'],
];

/** What it writes on a card, and where you see it. */
export const WRITES = [
  ['Board check section', 'the one-line verdict for the card, with the time of the pass'],
  ['Links → verified', 'the highest state the facts prove (committed · PR open · merged · done), and the PR it traced'],
  ['Agent section', 'the model’s one-line reading of what the assignee last said, with the state and the time'],
  ['🆘 Needs human', 'by rule (stuck, unanswered, or a column against the facts) — with the reason, and your answer once you give one'],
];

export const NEVER = [
  'move a card backwards, or on anyone’s say-so',
  'let the model move, flag or clear anything — it answers one question, code does the rest',
  'talk to an agent on its own — only your answer to a flag reaches an agent, in your name',
  'touch a manual card',
  'clear a flag it did not raise (an agent’s, yours)',
];

/** Where this came from: two checkers, now one. */
export const BEFORE = [
  ['the Board check', 'harness code every minute: facts, moves, the judge, stuck flags — hidden behind a stamp on the card'],
  ['the policeman conversation', 'a model turn every five minutes running a six-step prompt over the whole board through fenced tools — the only thing you could see'],
  ['now', 'one loop, one name: the code runs the sweep and asks the model one question per card that has new words; no conversation, no prompt to follow, no sessions, no fences'],
];
