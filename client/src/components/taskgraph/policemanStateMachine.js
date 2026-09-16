// The policeman (openspec one-policeman) as state diagrams in four tabs:
//
//   tab 0  THE PARTS   — what it is made of: ONE loop in harness code, the reader it asks one
//                        question, its settings and its journal; and what sits outside it (the arch
//                        as the fleet's directory, GitHub and git, the repo agents, the board)
//   tab 1  THE LOOP    — one pass, as a flowchart: for each in-flight card, trace its PR → read the
//                        facts → move forward → new words? → ask the model one question → write the
//                        Agent section → stuck, or column against the facts? → 🆘 → next card
//   tab 2  EACH CARD   — the states a card can be in as the loop sees it, what moves it, what it does
//   tab 3  BEFORE      — where this came from: two checkers (the Board check, the policeman
//                        conversation) writing on one card, folded into the one loop
//
// Pure data + validation (node --test); positions are preset so the picture is stable and
// readable — a layout engine would redraw it differently every time.

// Flowchart shapes (the legend follows these): terminal = start / end pill · state = rounded box
// (a state a card rests in) · io = parallelogram (a step that READS) · process = rectangle (a step
// that ACTS) · decision = diamond (a branch) · part = a building block (tab 0).
export const SHAPES = {
  terminal: 'start / end',
  state: 'a state it rests in',
  io: 'a step that reads',
  process: 'a step that acts',
  decision: 'a decision',
  part: 'a part it is made of',
};
// WHO decides — the honest split between program and prompt, on every node and edge:
//   code  = deterministic: the harness's C# does it (the timer, the facts, every move, the judge,
//           when the model is asked, how its answer is checked, every write, every flag, the journal)
//   model = the one question: from an agent's last words, which state is it in, and why
//   mixed = code acts on what the model read (a flag raised because the reading says asked / blocked)
//   human = outside the policeman: you (an answer on a card, Run now, reading on / off), or the arch
export const WHO = {
  code: { glyph: '⚙️', word: 'deterministic — harness code' },
  model: { glyph: '🧠', word: 'the model’s one question' },
  mixed: { glyph: '⚙️🧠', word: 'code acts on what the model read' },
  human: { glyph: '🧑', word: 'you, or the arch agent' },
};
const S = (id, label, sub, x, y, opts = {}) => ({ id, label, sub, x, y, kind: 'state', tone: 'plain', shape: 'state', who: 'code', ...opts });
const P = (id, label, sub, x, y, opts = {}) => S(id, label, sub, x, y, { parent: 'policeman', kind: 'part', shape: 'part', ...opts });
const L = (id, label, sub, x, y, opts = {}) => S(id, label, sub, x, y, { parent: 'loop', kind: 'step', ...opts });

export const NODES = [
  // ---- groups (compound parents) ---------------------------------------------------------------
  { id: 'parts', label: 'THE PARTS — what the policeman is made of', kind: 'group' },
  { id: 'policeman', label: '👮 THE POLICEMAN — one loop, four parts', kind: 'group', parent: 'parts', inline: true },
  { id: 'loop', label: 'THE LOOP — one pass, for each in-flight card', kind: 'group' },
  { id: 'cards', label: 'EACH CARD — one state per card per pass, one action per state', kind: 'group' },
  { id: 'before', label: 'BEFORE — two checkers, now one', kind: 'group' },
  { id: 'today', label: 'BEFORE — two checkers wrote on one card', kind: 'group', parent: 'before', inline: true },
  { id: 'one', label: 'NOW — one loop, one name on the card', kind: 'group', parent: 'before', inline: true },

  // ---- tab 0: the parts ------------------------------------------------------------------------
  P('p-loop', 'THE LOOP', 'harness code, every 60 s and at startup or Run now: trace · facts · move · judge · ask · flag · journal', -300, 0, { tone: 'ok' }),
  P('p-reader', 'THE READER', 'one stateless model call per card with new words: “which state is the agent in, and why, in one line” — checked against the seven states', 300, 0, { who: 'model', tone: 'ok' }),
  P('p-settings', 'Settings', 'reading on / off · the model · how many messages it is shown · questions per pass', -300, -280),
  P('p-journal', 'The journal', 'every pass: trigger, traces, moves, questions and answers, flags, verdict, cost, errors — the Policeman tab reads it', 300, -280),
  S('x-arch', 'The arch', 'the fleet’s directory: which agent is where, its GitHub remote, its last messages — and the road for your answer to an agent', -1000, 0, { parent: 'parts', kind: 'outside' }),
  S('x-github', 'git & GitHub', 'branches, pushes, pull requests, merges — the facts', -800, 320, { parent: 'parts', kind: 'outside' }),
  S('x-agents', 'The repo agents', 'what each assignee last said, on any machine of the fleet', -1000, -320, { parent: 'parts', kind: 'outside' }),
  S('x-board', 'The board', 'the cards: column, verified state, Board check, Agent section, 🆘', 900, 0, { parent: 'parts', kind: 'outside' }),

  // ---- tab 1: the loop — one pass, in code, with one 🧠 box ------------------------------------
  L('m-timer', 'every 60 s', 'and at startup, Run now, or Re-verify', -300, -260, { shape: 'terminal', tone: 'start' }),
  L('m-trace', 'trace its pull request', 'list the repo’s PRs on GitHub; a PR that names the card, its branch or its #ref is linked', -300, -80, { shape: 'io' }),
  L('m-facts', 'read the facts', 'git on this machine · GitHub · the deploy log', -300, 100, { shape: 'io' }),
  L('m-move', 'move it forward to the facts', 'never backwards, never on a claim; judge it honest / not verified / stuck', -300, 280, { shape: 'process' }),
  L('m-new', 'new words from the assignee?', 'since the card’s last reading', -300, 480, { shape: 'decision' }),
  L('m-ask', 'ask the model one question', 'its last messages → which state, and why, in one line', 200, 480, { shape: 'process', tone: 'ok', who: 'model' }),
  L('m-write', 'write the Agent section', 'state · one line · stamped by the loop, with the time', 200, 680, { shape: 'process' }),
  L('m-stuck', 'stuck, unanswered, or column against the facts?', 'by the rules, or by what the model read', -300, 700, { shape: 'decision', who: 'mixed' }),
  L('m-flag', '🆘 flag, with the reason', 'one name on it; you answer on the card', -300, 900, { shape: 'process', tone: 'bad' }),
  L('m-next', 'next card', 'until every in-flight card is done; then the journal', 200, 900, { shape: 'terminal' }),

  // ---- tab 2: each card ------------------------------------------------------------------------
  S('c-unassigned', '📥 Unassigned', 'To do, nobody on it → nothing', -120, 560, { parent: 'cards', kind: 'card' }),
  S('c-waiting', '⏳ Waiting for the arch', 'assigned, not pinged → nothing', 220, 560, { parent: 'cards', kind: 'card' }),
  S('c-working', 'Working', 'agent active, column = facts → the reading says Working', 560, 560, { parent: 'cards', kind: 'card', tone: 'ok', who: 'model' }),
  S('c-ahead', '⚠️ Ahead of the facts', 'column > verified → warned; flagged after two sweeps; never demoted', 1000, 560, { parent: 'cards', kind: 'card', tone: 'warn' }),
  S('c-behind', '⏩ Behind the facts', 'a PR traced or a merge found → moved forward', 220, 840, { parent: 'cards', kind: 'card', tone: 'ok' }),
  S('c-stuck', '🛑 Stuck', 'asked · blocked · errored · silent → 🆘 by rule', 560, 840, { parent: 'cards', kind: 'card', tone: 'bad', who: 'mixed' }),
  S('c-skip', '🚫 Not mine', 'manual · external owner · delivered → left alone', 1000, 840, { parent: 'cards', kind: 'card', shape: 'terminal' }),
  S('c-flagged', '🆘 Flagged', 'you answer on the card → the agent continues → cleared', -120, 1120, { parent: 'cards', kind: 'card', tone: 'bad' }),
  S('c-review', '👀 Waiting for review', 'PR open, agent done → the reading says so', 560, 1120, { parent: 'cards', kind: 'card', who: 'mixed' }),

  // ---- tab 3: before — two checkers, now one ----------------------------------------------------
  S('t-check', '🔎 Board check', 'harness code, every 60 s: git and GitHub facts → move forward → judge → flag stuck — hidden behind a stamp', -1500, 0, { parent: 'today', kind: 'part', shape: 'part' }),
  S('t-police', '👮 Policeman conversation', 'a model turn every 5 min: a six-step prompt over the whole board through fenced tools — the only thing you could see', -1500, 300, { parent: 'today', kind: 'part', shape: 'part', who: 'model' }),
  S('t-card', 'one card', 'Board check · Links · Agent · 🆘 — two names on it', -960, 150, { parent: 'today', kind: 'outside' }),
  S('n-loop', '👮 The policeman', 'one loop in code; the model answers one question per card with new words; one name on the card → tab 1', -200, 150, { parent: 'one', kind: 'part', shape: 'part', tone: 'ok' }),
];

const E = (source, target, label, kind = 'lifecycle', who = kind === 'flow' || kind === 'link' ? 'model' : 'code') => ({ id: `${source}->${target}`, source, target, label, kind, who });

export const EDGES = [
  // ---- tab 0: the parts — how they hand over ---------------------------------------------------
  E('p-settings', 'p-loop', 'reading on / off · model · tail', 'part', 'human'),
  E('p-loop', 'p-reader', 'a card with new words: one question', 'part'),
  E('p-reader', 'p-loop', 'one state + one line', 'part', 'model'),
  E('p-loop', 'p-journal', 'every pass, written down', 'part'),
  E('x-arch', 'p-loop', 'which agent is where · its remote · its last messages', 'part'),
  E('p-loop', 'x-github', 'lists PRs · reads branches, pushes, merges', 'part'),
  E('x-agents', 'x-arch', 'their conversations', 'part'),
  E('p-loop', 'x-board', 'moves · Agent section · 🆘 by rule', 'part'),
  E('x-board', 'x-arch', 'your answer on a flag → the agent, in your name', 'part', 'human'),

  // ---- tab 1: the loop --------------------------------------------------------------------------
  E('m-timer', 'm-trace', 'for each in-flight card', 'merge'),
  E('m-trace', 'm-facts', '', 'merge'),
  E('m-facts', 'm-move', '', 'merge'),
  E('m-move', 'm-new', '', 'merge'),
  E('m-new', 'm-ask', 'yes', 'merge'),
  E('m-ask', 'm-write', 'its answer, if valid', 'merge', 'model'),
  E('m-write', 'm-stuck', '', 'merge'),
  E('m-new', 'm-stuck', 'no', 'merge'),
  E('m-stuck', 'm-flag', 'yes', 'merge', 'mixed'),
  E('m-stuck', 'm-next', 'no', 'merge'),
  E('m-flag', 'm-next', '', 'merge'),
  { ...E('m-next', 'm-trace', 'next card', 'merge'), curve: 'arc' },

  // ---- tab 2: each card -------------------------------------------------------------------------
  E('c-unassigned', 'c-waiting', 'arch or you assign', 'card', 'human'),
  E('c-waiting', 'c-working', 'arch pings', 'card', 'human'),
  E('c-working', 'c-ahead', 'someone moved it past the facts', 'card', 'human'),
  E('c-ahead', 'c-working', 'facts catch up', 'card'),
  E('c-working', 'c-behind', 'PR traced to the card', 'card'),
  E('c-working', 'c-stuck', 'asks · blocks · errors · silent > window', 'card', 'mixed'),
  E('c-working', 'c-skip', 'delivered · go manual · external owner', 'card'),
  E('c-ahead', 'c-stuck', 'two sweeps against the facts', 'card'),
  E('c-behind', 'c-review', 'moved → PR open', 'card'),
  E('c-behind', 'c-skip', 'moved → merged / done', 'card'),
  E('c-review', 'c-skip', 'merged', 'card'),
  E('c-review', 'c-ahead', 'PR closed unmerged', 'card'),
  E('c-stuck', 'c-flagged', '🆘 with the reason', 'card', 'mixed'),
  E('c-flagged', 'c-working', 'you answer · the agent continues', 'card', 'human'),

  // ---- tab 3: before → now ----------------------------------------------------------------------
  E('t-check', 't-card', 'verified state · Board check section · 🆘 as board-check', 'merge'),
  E('t-police', 't-card', 'Agent section · 🆘 as policeman', 'merge', 'model'),
  { ...E('t-police', 't-check', 'sync a card: asked for one Board check pass', 'merge', 'mixed'), curve: 'arc' },
  E('t-card', 'n-loop', 'folded into', 'merge'),
];

const nodeData = (n) => ({ id: n.id, label: n.label, sub: n.sub || '', kind: n.kind, tone: n.tone || 'plain', shape: n.shape || (n.kind === 'group' ? 'group' : 'state'), who: n.who || 'code' });
const nodeClasses = (n) => `${n.kind} tone-${n.tone || 'plain'} shape-${n.shape || (n.kind === 'group' ? 'group' : 'state')} who-${n.who || 'code'}`;
const edgeElement = (e) => ({ data: { id: e.id, source: e.source, target: e.target, label: e.label, kind: e.kind, who: e.who || 'code', curve: e.curve || 'bezier' }, classes: `${e.kind} who-${e.who || 'code'}` });

/** Cytoscape elements: nodes carry their preset position; groups none (they size to children). */
export function toElements() {
  return [
    ...NODES.map((n) => ({
      data: { ...nodeData(n), parent: n.parent || undefined },
      position: n.kind === 'group' ? undefined : { x: n.x, y: n.y },
      classes: nodeClasses(n),
    })),
    ...EDGES.map(edgeElement),
  ];
}

/** The entry node of each tab, and the terminal ones. */
export const ENTRIES = new Set(['m-timer', 'c-unassigned', 'p-settings', 'x-agents', 't-check', 't-police']);
export const TERMINALS = new Set(['c-skip', 'x-github', 'x-board', 'n-loop', 'p-journal']);

/** The four tabs, one picture each. */
export const LEVELS = {
  parts: { title: 'The parts', blurb: 'what the policeman is made of: one loop in harness code, the reader it asks one question per card with new words, its settings and its journal — and what sits outside it', ref: null },
  loop: { title: 'The loop', blurb: 'one pass, for each in-flight card: trace its PR, read the facts, move it forward, ask the model one question if the assignee said something new, write the Agent section, flag by rule; exactly one box is the model’s', ref: null },
  cards: { title: 'Each card', blurb: 'the nine states a card can be in as the loop sees it, what a pass finds to move it, and the one action it takes there', ref: null },
  before: { title: 'Before — two checkers, now one', blurb: 'where this came from: the Board check (harness code, every minute, hidden behind a stamp) and the policeman conversation (a model turn every five minutes, the only thing you could see) both wrote on one card; folded into one loop with one name', ref: null },
};

export function levelElements(level) {
  const L = LEVELS[level];
  if (!L) throw new Error('unknown level ' + level);
  // A tab shows the nodes directly under it, plus its inline groups (boxes drawn inside the tab) and their nodes.
  const groups = NODES.filter((n) => n.kind === 'group' && n.parent === level && n.inline);
  const groupIds = new Set(groups.map((g) => g.id));
  const own = NODES.filter((n) => n.kind !== 'group' && (n.parent === level || groupIds.has(n.parent)));
  const ids = new Set(own.map((n) => n.id));
  const nodes = [
    ...groups.map((g) => ({ data: nodeData(g), classes: nodeClasses(g) })),
    ...own.map((n) => ({ data: { ...nodeData(n), parent: groupIds.has(n.parent) ? n.parent : undefined }, position: { x: n.x, y: n.y }, classes: nodeClasses(n) })),
  ];
  if (L.ref) {
    ids.add(L.ref.id);
    nodes.push({ data: { id: L.ref.id, label: L.ref.label, sub: L.ref.sub, kind: 'ref', tone: 'plain', shape: 'ref', who: 'mixed', to: L.ref.to }, position: { x: L.ref.x, y: L.ref.y }, classes: 'ref shape-ref who-mixed' });
  }
  const edges = EDGES.filter((e) => ids.has(e.source) && ids.has(e.target)).map(edgeElement);
  return [...nodes, ...edges];
}

/** Every endpoint and parent exists; every node (not a group) is reachable and, except the
 * terminal ones, has a way out; the card machine never moves a card backwards; exactly one node
 * of the loop is the model's. */
export function validate() {
  const ids = new Set(NODES.map((n) => n.id));
  const problems = [];
  for (const n of NODES) if (n.parent && !ids.has(n.parent)) problems.push(`${n.id}: unknown parent ${n.parent}`);
  for (const e of EDGES) {
    if (!ids.has(e.source)) problems.push(`${e.id}: unknown source`);
    if (!ids.has(e.target)) problems.push(`${e.id}: unknown target`);
  }
  for (const n of NODES) if (n.kind !== 'group' && !WHO[n.who || 'code']) problems.push(`${n.id}: unknown who ${n.who}`);
  for (const e of EDGES) if (!WHO[e.who || 'code']) problems.push(`${e.id}: unknown who ${e.who}`);
  const outs = new Set(EDGES.map((e) => e.source));
  const ins = new Set(EDGES.map((e) => e.target));
  for (const n of NODES) {
    if (n.kind === 'group') continue;
    if (!ENTRIES.has(n.id) && !ins.has(n.id)) problems.push(`${n.id}: unreachable`);
    if (!TERMINALS.has(n.id) && !outs.has(n.id)) problems.push(`${n.id}: dead end`);
  }
  const order = ['c-unassigned', 'c-waiting', 'c-working', 'c-behind', 'c-review', 'c-skip'];
  for (const e of EDGES.filter((e) => e.kind === 'card')) {
    const a = order.indexOf(e.source);
    const b = order.indexOf(e.target);
    if (a >= 0 && b >= 0 && b < a && !(e.source === 'c-flagged' || e.target === 'c-working')) problems.push(`${e.id}: moves a card backwards`);
  }
  const brains = NODES.filter((n) => n.parent === 'loop' && n.who === 'model');
  if (brains.length !== 1) problems.push(`the loop has ${brains.length} model boxes, not one`);
  return { ok: problems.length === 0, problems, nodes: NODES.length, edges: EDGES.length };
}
