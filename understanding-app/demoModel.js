// The one-policeman DEMO's model (openspec one-policeman, proposal stage): a pure, scripted
// simulation of the proposed Policeman tab — one code loop that sweeps every card, asks the model
// one question per card with new messages, moves and flags by rule, and journals everything.
// Nothing here is real: the fleet, the transcripts, the PRs and the model's answers are fake and
// scripted so the Operator can click through the UI and judge whether it reads right.
// Pure (node --test): runPass(state, trigger) → a new state.

export const STATES = {
  working: ['⚙️', 'Working', 'the agent is actively on it'],
  'waiting-review': ['👀', 'Waiting for review', 'its work is up as a pull request'],
  'asked-question': ['❓', 'Asked a question', 'the agent asked something and nobody has answered'],
  blocked: ['⛔', 'Blocked', 'the agent says it cannot proceed'],
  'claims-done': ['🗣', 'Says done', 'the agent says it finished, but the facts do not show it yet'],
  idle: ['💤', 'Idle', 'nothing has happened in its conversation'],
  errored: ['💥', 'Errored', 'the agent’s last turn failed'],
};
export const COLUMNS = { todo: 'To do', doing: 'Doing', committed: 'Committed', 'pr-opened': 'PR open', 'pr-merged': 'Merged', done: 'Done' };
export const TRIGGERS = { startup: 'at startup', timer: 'the minute timer', operator: 'you pressed Run now', answer: 'you answered a flag' };
const M = 60_000;
const H = 60 * M;

export function ago(ms) {
  if (ms == null || ms < 0) return '0 s';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

/** The fake fleet, as it stands before the first pass. `messages` are the assignee's last words
 * (t = when); `unread` marks the ones the loop has not asked the model about yet. */
export function initialCards(now) {
  return [
    { id: 'a1b2c3d4e5f6', title: 'Export the invoice register as CSV', agent: 'razvoj2016/prg#1', column: 'doing', verified: 'doing', pr: null,
      messages: [{ t: now - 3 * H, text: 'Register export is drafted. Which API key should the export use — production or the sandbox one? I need it to continue.', unread: true }],
      observation: null, flag: null },
    { id: 'b2c3d4e5f6a1', title: 'Add OAuth login to the admin console', agent: 'razvoj2016/prg#2', column: 'doing', verified: 'committed', pr: null,
      messages: [{ t: now - 25 * M, text: 'Opened PR #42 with the OAuth flow and the callback route; tests pass. Waiting for review.', unread: true }],
      observation: null, flag: null },
    { id: 'c3d4e5f6a1b2', title: 'Rename the settings page', agent: 'kiki-laptop/web#1', column: 'pr-opened', verified: 'doing', pr: null,
      messages: [{ t: now - 2 * H, text: 'Renamed the page and the route. I will push once the snapshot tests are updated.', unread: true }],
      observation: null, flag: null },
    { id: 'd4e5f6a1b2c3', title: 'Nightly backup job', agent: 'razvoj2016/ops#1', column: 'doing', verified: 'doing', pr: null,
      messages: [{ t: now - 6 * M, text: 'Running the migration script against the staging copy now; will report in a few minutes.', unread: true }],
      observation: null, flag: null },
    { id: 'e5f6a1b2c3d4', title: 'Rate limiter for the public API', agent: 'kiki-laptop/api#1', column: 'doing', verified: 'doing', pr: null,
      messages: [{ t: now - 30 * H, text: 'Starting on the token bucket.', unread: false }],
      observation: { state: 'working', summary: 'started on the token bucket', at: now - 30 * H }, flag: null },
    { id: 'f6a1b2c3d4e5', title: 'Fix the flaky login test', agent: 'razvoj2016/prg#1', column: 'done', verified: 'done', pr: { n: 39, state: 'merged' },
      messages: [{ t: now - 2 * 24 * H, text: 'Merged; the test has been green for two days.', unread: false }],
      observation: { state: 'working', summary: 'delivered', at: now - 2 * 24 * H }, flag: null },
  ];
}

export function initialState(now = Date.now()) {
  return { now, startedAt: now, passes: 0, running: true, intervalS: 60, cards: initialCards(now), journal: [], answers: [] };
}

/** The model's fake answer to "which state, and why" from the latest unread message. Pure, scripted. */
export function answerFor(card) {
  const last = card.messages[card.messages.length - 1]?.text || '';
  if (/which api key|should .* use|\?/i.test(last)) return { state: 'asked-question', summary: 'asks which API key the export should use; nobody has answered' };
  if (/waiting for review|opened pr/i.test(last)) return { state: 'waiting-review', summary: 'PR #42 is up; the agent is waiting for review' };
  if (/cannot|blocked|no access/i.test(last)) return { state: 'blocked', summary: 'says it cannot proceed' };
  if (/writing|running|continuing|now/i.test(last)) return { state: 'working', summary: last.length > 70 ? last.slice(0, 67).trim() + '…' : last };
  if (/all done|is done|finished|merged/i.test(last)) return { state: 'claims-done', summary: 'says it is finished' };
  if (/error|failed|crash/i.test(last)) return { state: 'errored', summary: 'its last turn failed' };
  return { state: 'working', summary: last.length > 70 ? last.slice(0, 67).trim() + '…' : last };
}

const tokensFor = (card) => 900 + card.messages.slice(-4).reduce((n, m) => n + m.text.length, 0) * 3;

/** The scripted world: what the FACTS do between passes (GitHub, git, the agents). Pure. */
function worldStep(state) {
  const p = state.passes + 1;
  const now = state.now;
  const cards = state.cards.map((c) => ({ ...c, messages: c.messages.map((m) => ({ ...m })), pr: c.pr && { ...c.pr } }));
  const by = Object.fromEntries(cards.map((c) => [c.id, c]));
  if (p === 1) by.b2c3d4e5f6a1.pr = { n: 42, state: 'open' };                                   // GitHub: the OAuth PR exists
  if (p === 2) by.d4e5f6a1b2c3.messages.push({ t: now - 20_000, text: 'Migration done on staging; writing the restore test now.', unread: true });
  if (p === 3) by.b2c3d4e5f6a1.pr = { n: 42, state: 'merged' };                                 // GitHub: merged
  if (p === 4) by.c3d4e5f6a1b2.messages.push({ t: now - 10_000, text: 'Pushed the rename and opened PR #43.', unread: true }), (by.c3d4e5f6a1b2.pr = { n: 43, state: 'open' });
  // An answered flag: the agent reads the answer and continues.
  for (const a of state.answers) {
    const c = by[a.id];
    if (c && !a.seen) { c.messages.push({ t: now - 5_000, text: `Thanks — "${a.text}". Continuing with that.`, unread: true }); a.seen = true; }
  }
  return cards;
}

const rank = (s) => Object.keys(COLUMNS).indexOf(s);

/** One pass of the loop: facts → move forward → one question per card with new messages →
 * write the observation → flag by rule → journal. Pure; returns the new state. */
export function runPass(state, trigger = 'timer') {
  const now = state.now + (trigger === 'timer' ? state.intervalS * 1000 : 5_000);
  const cards = worldStep({ ...state, now });
  const moves = []; const questions = []; const raised = []; const cleared = [];
  for (const c of cards) {
    if (c.column === 'done') continue;
    // 1. facts → move forward, never backwards, never on a claim
    let verified = c.verified;
    if (c.pr?.state === 'open') verified = 'pr-opened';
    if (c.pr?.state === 'merged') verified = 'pr-merged';
    if (rank(verified) > rank(c.verified)) c.verified = verified;
    if (rank(c.verified) > rank(c.column)) { moves.push({ id: c.id, title: c.title, from: c.column, to: c.verified, fact: c.pr ? `PR #${c.pr.n} ${c.pr.state} on GitHub` : 'branch facts' }); c.column = c.verified; }
    // 2. new words from the assignee? → ask the model ONE question
    const unread = c.messages.filter((m) => m.unread);
    if (unread.length) {
      const a = answerFor(c);
      questions.push({ id: c.id, title: c.title, excerpt: unread[unread.length - 1].text, state: a.state, summary: a.summary, tokens: tokensFor(c) });
      c.observation = { state: a.state, summary: a.summary, at: now };
      for (const m of c.messages) m.unread = false;
    }
    // 3. flag by rule, informed by the reading
    const lastWord = c.messages[c.messages.length - 1]?.t ?? now;
    const silentH = (now - lastWord) / H;
    let reason = null;
    if (c.observation?.state === 'asked-question' && now - c.observation.at >= 0 && (now - lastWord) > 2 * H) reason = `asked a question ${ago(now - lastWord)} ago and nobody answered`;
    else if (c.observation?.state === 'blocked') reason = 'the agent says it is blocked';
    else if (c.observation?.state === 'errored') reason = 'the agent’s last turn failed';
    else if (!c.pr && silentH > 24 && c.column === 'doing') reason = `pinged, no PR and no progress for ${ago(now - lastWord)} (window 24 h)`;
    else if (rank(c.column) > rank(c.verified)) { c.against = (c.against || 0) + 1; if (c.against >= 2) reason = `the column says ${COLUMNS[c.column]} but the facts show only ${COLUMNS[c.verified]}, for ${c.against} sweeps`; }
    if (rank(c.column) <= rank(c.verified)) c.against = 0;
    if (reason && !c.flag) { c.flag = { reason, at: now, answered: false }; raised.push({ id: c.id, title: c.title, reason }); }
    else if (!reason && c.flag) { cleared.push({ id: c.id, title: c.title, reason: c.flag.reason }); c.flag = null; }
  }
  const quiet = !moves.length && !questions.length && !raised.length && !cleared.length;
  const entry = { at: now, trigger, checked: cards.filter((c) => c.column !== 'done').length, moves, questions, raised, cleared, quiet, tokens: questions.reduce((n, q) => n + q.tokens, 0), durationMs: 30 + questions.length * 800 + moves.length * 40 };
  return { ...state, now, passes: state.passes + 1, cards, journal: [entry, ...state.journal].slice(0, 200), answers: state.answers.filter((a) => !a.seen) };
}

/** The Operator answers a flag on a card: the flag stays until the agent has read the answer
 * (next pass), but is marked answered now. Pure. */
export function answerFlag(state, id, text) {
  const cards = state.cards.map((c) => (c.id === id && c.flag ? { ...c, flag: { ...c.flag, answered: true, answer: text } } : c));
  return { ...state, cards, answers: [...state.answers, { id, text, seen: false }] };
}

/** A card's timeline: every journal entry that moved, asked about, flagged or unflagged it, newest first. Pure. */
export function timelineOf(state, id) {
  return state.journal.filter((e) => e.moves.some((m) => m.id === id) || e.questions.some((q) => q.id === id) || e.raised.some((f) => f.id === id) || e.cleared.some((f) => f.id === id));
}

export const short = (id) => id.slice(0, 8);
