// The Board check subtab's pure rules (openspec board-check-provenance): how the auto-verifier's
// status and journal read in words. Framework-free (node --test), like cardSections.js. The
// panel renders ONLY what these return, so the explanation cannot drift from the product.
import { ago } from './cardSections.js';

/** What set a pass off → words. */
export const TRIGGERS = {
  startup: 'at startup',
  timer: 'the minute timer',
  operator: 'you pressed Re-verify',
  policeman: 'the policeman synced a card',
};
export const triggerWord = (t) => TRIGGERS[t] || t || 'unknown';

/** The Board check's headline state from its status payload: [tone, label]. Pure. */
export function checkState(st) {
  if (!st) return ['loading', 'loading…'];
  if (st.running) return ['busy', 'pass running'];
  if (st.lastAt == null) return ['off', 'no pass yet'];
  return ['on', `every ${st.intervalSeconds || 60} s · ${st.passes} pass${st.passes === 1 ? '' : 'es'} since start`];
}

/** "last pass 12 s ago (the minute timer) · next in 48 s". Pure. */
export function timingLine(st, now = Date.now()) {
  if (!st || st.lastAt == null) return 'no pass yet';
  const parts = [`last pass ${ago(now - st.lastAt) || '0 s'} ago${st.last ? ` (${triggerWord(st.last.trigger)})` : ''}`];
  if (st.nextDueAt != null) {
    const due = st.nextDueAt - now;
    parts.push(due <= 0 ? 'next any moment' : `next in ${ago(due) || '0 s'}`);
  }
  if (st.startedAt) parts.push(`running since ${new Date(st.startedAt).toLocaleString()}`);
  return parts.join(' · ');
}

/** One journal entry in a sentence: what happened, or that nothing did. Pure. */
export function entrySummary(e) {
  if (!e) return '';
  if (e.error) return `failed: ${e.error}`;
  const bits = [];
  if (e.changes?.length) bits.push(`moved ${e.changes.length} card${e.changes.length === 1 ? '' : 's'}`);
  if (e.raised?.length) bits.push(`raised ${e.raised.length} 🆘`);
  if (e.cleared?.length) bits.push(`cleared ${e.cleared.length} 🆘`);
  if (bits.length === 0) return e.repeats > 1 ? `${e.repeats} quiet passes — nothing to move, nothing to flag` : 'quiet — nothing to move, nothing to flag';
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

// ---- What it is: the explainer's data -------------------------------------------------------

/** One pass, in order — every step is harness code. */
export const PASS = [
  ['git', 'For every assignee on this machine: read the recorded branch from its clone — commits, pushed, head.'],
  ['GitHub', 'For every card that names a pull request, on any machine: is it open, merged, closed? Is the merge live on the deployed build?'],
  ['move', 'Move each card FORWARD to what the facts prove, never backwards, never on a claim. Record the verified state and a plain warning when the column is ahead of the facts.'],
  ['judge', 'Judge every card: honest (column matches the facts) · not verified yet (column ahead of the facts) · stuck (pinged, no PR, blocked or silent past the window) · manual (yours, not policed).'],
  ['flag', 'Stamp 🆘 on every stuck card under its own name, board-check, and take that stamp off once the card moves again. Never touch anyone else’s flag.'],
];

/** What it writes on a card, and where you see it. */
export const WRITES = [
  ['Board check section', 'the one-line verdict for the card, with the time of the pass'],
  ['Links → verified', 'the highest state the facts prove (committed · PR open · merged · done)'],
  ['⚠️ warning', 'when the column claims more than the facts show'],
  ['🆘 Needs human, by board-check', 'when the card is stuck by the rules above'],
];

export const NEVER = [
  'move a card backwards, or on anyone’s say-so',
  'read an agent’s conversation — it only reads git, GitHub and the deploy log',
  'touch a manual card',
  'clear a flag it did not raise (the policeman’s, an agent’s, yours)',
  'talk to anyone: no prompt, no model, no message',
];

/** Two writers on one card, side by side. */
export const WRITERS = [
  ['runs', 'harness code, every 60 s and at startup; also when you press Re-verify or the policeman syncs a card', 'a model turn, every 5 min by default, in its own arch conversation'],
  ['reads', 'git on this machine, GitHub, the deploy log', 'the Board check’s verdict, every card, each assignee’s last messages, each repo’s PRs'],
  ['decides by', 'fixed rules', 'judgement, inside a fenced set of tools'],
  ['writes on the card', 'Board check section · verified state · ⚠️ · 🆘 as board-check', 'Agent section · 🆘 as policeman, with a reason · a card moved by calling a Board check pass'],
  ['can be wrong by', 'a fact it cannot see (a peer machine’s commits)', 'misreading a transcript'],
  ['history', 'this tab: every pass, every move, every flag', 'the Policeman tab: every session and every tool call'],
];
