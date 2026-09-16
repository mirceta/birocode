// The policeman's FULL workings as state diagrams in four tabs (openspec policeman-observes-agents,
// policeman-module). It is built of five parts, and the tabs follow the parts:
//
//   tab 0  THE PARTS         — what it is made of and how they nest: a MAIN machine the harness runs
//                              (the lifecycle), which on every pass hands control to a SUB-machine
//                              the model runs (the pass, i.e. the prompt), which can act only by
//                              calling TOOLS through the FENCES; the tools read and move the board
//   tab 1  THE MAIN MACHINE  — the lifecycle: the states the policeman conversation itself is in
//                              (not set up · armed · pass running · waiting for you · rolling over ·
//                              errored · stopped · disarmed) and what moves it — all harness code
//   tab 2  THE SUB-MACHINE   — inside "pass running": the steps of one pass in the order the prompt
//                              gives them, with its two inner loops — the model drives this
//   tab 3  EACH CARD         — inside the judging step: the nine states a card can be in as the
//                              policeman sees it, what moves it, and the one action taken in each
//   tab 4  TWO CHECKERS → ONE — today the Board check (code, every minute) and the policeman (a model
//                              turn, every five minutes) both write on one card; merged, one loop
//                              does the sweep and asks the model one question per card (openspec
//                              one-policeman)
//
// Pure data + validation (node --test); positions are preset so the picture is stable and
// readable — a layout engine would redraw it differently every time.

// Flowchart shapes (the legend follows these): terminal = start / end pill · state = rounded box
// (a state the agent or a card rests in) · io = parallelogram (a step that READS) · process =
// rectangle (a step that ACTS) · decision = diamond (a branch) · part = a building block (tab 0).
export const SHAPES = {
  terminal: 'start / end',
  state: 'a state it rests in',
  io: 'a step that reads',
  process: 'a step that acts',
  decision: 'a decision',
  part: 'a part it is made of',
};
// WHO decides — the honest split between program and prompt, on every node and edge:
//   code  = deterministic: the harness's C# does it (timers, caps, the verifier's facts and
//           moves, the tool fences, the mechanical judge, provenance stamps)
//   model = prompt-driven: the policeman (an LLM turn) judges or chooses (reading a transcript,
//           picking an observation state, deciding to flag, writing the verdict, the step order)
//   mixed = the model calls it, the code decides the outcome (sync_card links → the verifier
//           moves; flag_needs_human → the code stamps and refuses manual cards)
//   human = outside the policeman: you, or the arch agent (Start/Stop, Resolve, assign, ping)
export const WHO = {
  code: { glyph: '⚙️', word: 'deterministic — harness code' },
  model: { glyph: '🧠', word: 'prompt-driven — the model judges' },
  mixed: { glyph: '⚙️🧠', word: 'the model calls it, the code decides' },
  human: { glyph: '🧑', word: 'you, or the arch agent' },
};
const S = (id, label, sub, x, y, opts = {}) => ({ id, label, sub, x, y, kind: 'state', tone: 'plain', shape: 'state', who: 'code', ...opts });
const P = (id, label, sub, x, y, opts = {}) => S(id, label, sub, x, y, { parent: 'policeman', kind: 'part', shape: 'part', ...opts });

export const NODES = [
  // ---- groups (compound parents) ---------------------------------------------------------------
  { id: 'parts', label: 'THE PARTS — what the policeman is made of', kind: 'group' },
  { id: 'policeman', label: '👮 THE POLICEMAN — one standing conversation, five parts', kind: 'group', parent: 'parts', inline: true },
  { id: 'agent', label: 'THE MAIN MACHINE — the lifecycle of the conversation', kind: 'group' },
  { id: 'pass', label: 'PASS RUNNING — the sub-machine: one pass, in the prompt’s order', kind: 'group', parent: 'agent' },
  { id: 'cards', label: 'EACH CARD — one state per card per pass, one action per state', kind: 'group', parent: 'pass' },
  { id: 'merge', label: 'TWO CHECKERS → ONE', kind: 'group' },
  { id: 'today', label: 'TODAY — two checkers write on one card', kind: 'group', parent: 'merge', inline: true },
  { id: 'one', label: 'MERGED — one loop; the model is asked one question per card (openspec one-policeman)', kind: 'group', parent: 'merge', inline: true },

  // ---- tab 0: the parts (how it is composed; the policeman's own parts sit in one box) ------------
  S('x-arch', 'The arch', 'the harness’s standing-agent host: it runs each turn and keeps the session', -1000, 0, { parent: 'parts', kind: 'outside' }),
  P('p-identity', 'Identity', 'who it is: 👮 Policeman, one per harness; its actor tag; the word it retires with', -300, -290),
  P('p-lifecycle', 'MAIN MACHINE · the lifecycle', 'armed → pass running → waiting / rolling over / errored → armed …', -300, 0, { tone: 'ok' }),
  P('p-prompt', 'SUB-MACHINE · the pass', 'the prompt’s steps, in order, run by the model on every pass', 260, 0, { who: 'model', tone: 'ok' }),
  P('p-fences', 'The fences', 'the closed list of tools the model may call; anything else is withheld and refused', 260, 260),
  P('p-tools', 'The tools', 'what actually happens when the model calls one: read, observe, sync, flag', 260, 520),
  S('x-agents', 'The repo agents', 'what each assignee last said, on any machine of the fleet', 820, 260, { parent: 'parts', kind: 'outside' }),
  S('x-board', 'The board', 'the cards, their columns, marks and PRs — the facts', 820, 520, { parent: 'parts', kind: 'outside' }),

  // ---- tab 4: two checkers today ---------------------------------------------------------------
  S('t-check', '🔎 Board check', 'harness code, every 60 s: git and GitHub facts → move forward → judge → flag stuck', -1500, 0, { parent: 'today', kind: 'part', shape: 'part' }),
  S('t-police', '👮 Policeman', 'a model turn, every 5 min: reads the verdict, the cards, each transcript, each repo’s PRs → observes, syncs, flags', -1500, 300, { parent: 'today', kind: 'part', shape: 'part', who: 'model' }),
  S('t-card', 'one card', 'Board check · Links · Agent · 🆘 — two names on it', -960, 150, { parent: 'today', kind: 'outside' }),

  // ---- tab 4: merged — one loop, in code, with one 🧠 box ------------------------------------------
  S('m-timer', 'every 60 s', 'and at startup, Re-verify, or a sync', -300, -260, { parent: 'one', kind: 'step', shape: 'terminal', tone: 'start' }),
  S('m-facts', 'read the facts for the card', 'git on this machine · GitHub · the deploy log · its PR, traced', -300, -80, { parent: 'one', kind: 'step', shape: 'io' }),
  S('m-move', 'move it forward to the facts', 'never backwards, never on a claim', -300, 100, { parent: 'one', kind: 'step', shape: 'process' }),
  S('m-new', 'new messages from the assignee?', 'since the last observation', -300, 300, { parent: 'one', kind: 'step', shape: 'decision' }),
  S('m-ask', 'ask the model one question', 'these are its last messages: which state is it in, and why, in one line', 200, 300, { parent: 'one', kind: 'step', shape: 'process', tone: 'ok', who: 'model' }),
  S('m-write', 'write the Agent section', 'state · one line · stamped by the loop, with the time', 200, 500, { parent: 'one', kind: 'step', shape: 'process' }),
  S('m-stuck', 'stuck, or column against the facts?', 'by the rules, or by what the model read', -300, 520, { parent: 'one', kind: 'step', shape: 'decision' }),
  S('m-flag', '🆘 flag, with the reason', 'one name on it; you answer on the card', -300, 720, { parent: 'one', kind: 'step', shape: 'process', tone: 'bad' }),
  S('m-next', 'next card', 'until every in-flight card is done', 200, 720, { parent: 'one', kind: 'step', shape: 'terminal' }),

  // ---- tab 1: the main machine ---------------------------------------------------------------
  S('off', 'START — Not set up', 'no conversation yet', -900, -80, { parent: 'agent', tone: 'start', shape: 'terminal' }),
  S('armed', 'Armed', 'loop armed · waiting for the interval', -900, 200, { parent: 'agent', tone: 'ok' }),
  S('stopped', 'Stopped', 'you pressed ■ Stop · no tick re-arms it', -1300, 200, { parent: 'agent' }),
  S('paused', 'Disarmed', 'operator gate closed / kill switch off', -1300, 480, { parent: 'agent', tone: 'warn' }),
  S('wait', 'Waiting for you', 'the pass ended with NEEDS_HUMAN:', -900, 560, { parent: 'agent', tone: 'warn' }),
  S('rollover', 'Rolling over', 'context ≥ cap · session cut · handover parked', -80, 860, { parent: 'agent' }),
  S('errored', 'Errored', 'the turn crashed · cooldown', -1300, 860, { parent: 'agent', tone: 'bad' }),

  // ---- tab 2: the sub-machine (inside "pass") — the prompt's steps, in plain words; the tool below --
  S('s1', '1 · Read the harness’s verdict', 'board_integrity: honest · dishonest · stuck', -540, 0, { parent: 'pass', kind: 'step', shape: 'io' }),
  S('s2', '2 · Read every card', 'list_tasks: column, assignee, marks', -170, 0, { parent: 'pass', kind: 'step', shape: 'io' }),
  S('s3', '3 · Read what the assignee said', 'read_transcript: its last four messages', 200, 0, { parent: 'pass', kind: 'step', shape: 'io' }),
  S('s4', '4 · Judge the card', 'which card state is it in?', 620, 0, { parent: 'pass', kind: 'step', tone: 'ok', shape: 'decision', who: 'model' }),
  S('s5', '5 · Find each repo’s PRs', 'list_pull_requests: traced to cards', 620, 250, { parent: 'pass', kind: 'step', shape: 'io' }),
  S('s6', '6 · Move a card to its PR', 'sync_card: the harness moves it by the facts', 200, 250, { parent: 'pass', kind: 'step', tone: 'ok', shape: 'process', who: 'mixed' }),
  S('s7', '7 · Flag, or clear a flag', 'flag_needs_human · clear_needs_human', -170, 250, { parent: 'pass', kind: 'step', tone: 'bad', shape: 'process', who: 'mixed' }),
  S('s8', '8 · Report the verdict', 'counts · moves · observations · flags', -540, 250, { parent: 'pass', kind: 'step', shape: 'terminal', who: 'model' }),

  // ---- tab 3: each card (inside "cards") -------------------------------------------------
  S('c-unassigned', '📥 Unassigned', 'To do, nobody on it → nothing', -120, 560, { parent: 'cards', kind: 'card' }),
  S('c-waiting', '⏳ Waiting for the arch', 'assigned, not pinged → nothing', 220, 560, { parent: 'cards', kind: 'card' }),
  S('c-working', 'Working', 'agent active, column = facts → observe Working', 560, 560, { parent: 'cards', kind: 'card', tone: 'ok', who: 'model' }),
  S('c-ahead', '⚠️ Ahead of the facts', 'column > verified → report; never demote', 1000, 560, { parent: 'cards', kind: 'card', tone: 'warn' }),
  S('c-behind', '⏩ Behind the facts', 'PR / merge found → sync_card', 220, 840, { parent: 'cards', kind: 'card', tone: 'ok' }),
  S('c-stuck', '🛑 Stuck', 'asked · blocked · errored · silent → observe, flag', 560, 840, { parent: 'cards', kind: 'card', tone: 'bad', who: 'mixed' }),
  S('c-skip', '🚫 Not mine', 'manual or delivered → leave alone', 1000, 840, { parent: 'cards', kind: 'card', shape: 'terminal' }),
  S('c-flagged', '🆘 Flagged', 'human request on it → clear if mine & resolved', -120, 1120, { parent: 'cards', kind: 'card', tone: 'bad' }),
  S('c-review', '👀 Waiting for review', 'PR open, agent done → observe; report if stale', 560, 1120, { parent: 'cards', kind: 'card', who: 'mixed' }),
];

const E = (source, target, label, kind = 'lifecycle', who = kind === 'flow' || kind === 'link' ? 'model' : 'code') => ({ id: `${source}->${target}`, source, target, label, kind, who });

export const EDGES = [
  // ---- tab 0: the parts — how they hand over to each other ----------------------------------
  E('x-arch', 'p-lifecycle', 'hosts it: runs each turn, keeps the session', 'part'),
  E('p-identity', 'p-lifecycle', 'names the one conversation', 'part'),
  E('p-lifecycle', 'p-prompt', 'every interval (or 👁 Check now): hands the prompt to the model', 'part'),
  E('p-prompt', 'p-lifecycle', 'the turn ends: a reply · NEEDS_HUMAN · the context cap', 'part', 'model'),
  E('p-prompt', 'p-fences', 'calls a tool', 'part', 'model'),
  E('p-fences', 'p-tools', 'on the list → it runs', 'part'),
  { ...E('p-fences', 'p-prompt', 'not on the list → refused', 'part'), curve: 'arc' },
  E('p-tools', 'x-agents', 'reads their last messages', 'part'),
  E('p-tools', 'x-board', 'reads · observes · moves · flags — every write stamped', 'part'),

  // ---- tab 4: two checkers today, and the one loop ---------------------------------------------
  E('t-check', 't-card', 'verified state · Board check section · 🆘 as board-check', 'merge'),
  E('t-police', 't-card', 'Agent section · 🆘 as policeman', 'merge', 'model'),
  { ...E('t-police', 't-check', 'sync a card: asks for one Board check pass', 'merge', 'mixed'), curve: 'arc' },
  E('m-timer', 'm-facts', 'for each in-flight card', 'merge'),
  E('m-facts', 'm-move', '', 'merge'),
  E('m-move', 'm-new', '', 'merge'),
  E('m-new', 'm-ask', 'yes', 'merge'),
  E('m-ask', 'm-write', 'its answer', 'merge', 'model'),
  E('m-write', 'm-stuck', '', 'merge'),
  E('m-new', 'm-stuck', 'no', 'merge'),
  E('m-stuck', 'm-flag', 'yes', 'merge'),
  E('m-stuck', 'm-next', 'no', 'merge'),
  E('m-flag', 'm-next', '', 'merge'),
  { ...E('m-next', 'm-facts', 'next card', 'merge'), curve: 'arc' },

  // ---- tab 1: the main machine ---------------------------------------------------------------
  E('off', 'armed', '▶ Start', 'lifecycle', 'human'),
  E('armed', 'pass', 'interval elapsed · 👁 Check now'),
  E('pass', 'armed', 'turn ended · context < cap'),
  E('pass', 'wait', 'reply ends with NEEDS_HUMAN:', 'lifecycle', 'model'),
  E('wait', 'armed', 'you answer in the conversation', 'lifecycle', 'human'),
  E('pass', 'rollover', 'context ≥ cap (or the turn limit)'),
  E('rollover', 'armed', 'next pass: fresh session + handover'),
  E('pass', 'errored', 'turn crashed'),
  E('errored', 'armed', 'cooldown passed → tick re-arms'),
  E('armed', 'armed', 'loop cap reached → tick re-arms'),
  E('armed', 'stopped', '■ Stop', 'lifecycle', 'human'),
  E('wait', 'stopped', '■ Stop', 'lifecycle', 'human'),
  E('stopped', 'armed', '▶ Start', 'lifecycle', 'human'),
  E('armed', 'paused', 'gate closed / kill switch off', 'lifecycle', 'human'),
  E('paused', 'armed', 'gate open · switch on', 'lifecycle', 'human'),
  E('armed', 'off', '🗑 conversation removed', 'lifecycle', 'human'),

  // ---- tab 2: the sub-machine ------------------------------------------------------------
  E('s1', 's2', '', 'flow'),
  E('s2', 's3', 'each in-flight card', 'flow'),
  E('s3', 's4', 'judge from its own words', 'flow'),
  E('s4', 's3', 'act, then next card', 'flow'),
  E('s4', 's5', 'all cards read', 'flow'),
  E('s5', 's6', 'a card is behind its PR', 'flow'),
  E('s6', 's5', 'next PR / repo', 'flow'),
  { ...E('s5', 's7', 'all repos checked', 'flow'), curve: 'arc' },
  E('s7', 's8', '', 'flow'),
  E('s4', 'cards', 'lands in exactly one of', 'link'),

  // ---- tab 3: each card ------------------------------------------------------------------
  E('c-unassigned', 'c-waiting', 'arch or you assign', 'card', 'human'),
  E('c-waiting', 'c-working', 'arch pings', 'card', 'human'),
  E('c-working', 'c-ahead', 'someone moved it past the facts', 'card', 'human'),
  E('c-ahead', 'c-working', 'facts catch up', 'card'),
  E('c-working', 'c-behind', 'PR traced to the card', 'card'),
  E('c-working', 'c-stuck', 'asks · blocks · errors · silent > window', 'card', 'mixed'),
  E('c-working', 'c-skip', 'delivered · go manual', 'card'),
  E('c-ahead', 'c-stuck', 'keeps lying, nobody fixes it', 'card', 'model'),
  E('c-behind', 'c-review', 'sync_card → PR open', 'card'),
  E('c-behind', 'c-skip', 'sync_card → merged / done', 'card'),
  E('c-review', 'c-skip', 'merged', 'card'),
  E('c-review', 'c-ahead', 'PR closed unmerged', 'card'),
  E('c-stuck', 'c-flagged', 'flag_needs_human (with reason)', 'card', 'mixed'),
  E('c-flagged', 'c-working', 'you Resolve · agent back on track', 'card', 'human'),
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

/** The entry state of each level, and the terminal ones (the pass ends at the verdict; a card the
 * policeman leaves alone has nowhere further to go; on the parts tab the arch and identity are
 * where it begins and the agents and the board are where its actions land). */
export const ENTRIES = new Set(['off', 's1', 'c-unassigned', 'x-arch', 'p-identity', 't-check', 't-police', 'm-timer']);
export const TERMINALS = new Set(['s8', 'c-skip', 'x-agents', 'x-board', 't-card']);

/** The four tabs, one picture each. A machine's nested level appears as ONE stand-in node (kind
 * 'ref') that links to its own tab, so no picture is crowded. Each tab says which part owns it. */
export const LEVELS = {
  parts: { title: 'The parts', blurb: 'what the policeman is made of and how the parts hand over: a main machine the harness runs, which on every pass hands control to a sub-machine the model runs, which can only act through the fences, by tools the harness executes', ref: null },
  agent: { title: 'The main machine — the lifecycle', blurb: 'the states the policeman conversation itself is in and what moves it; the harness runs all of it, deterministically — the model acts only inside PASS RUNNING', ref: { id: 'pass', label: 'PASS RUNNING', sub: 'the sub-machine: the model runs the prompt → see its tab', x: -420, y: 300, to: 'pass' } },
  pass: { title: 'The sub-machine — the pass', blurb: 'the steps of one pass in the order the prompt gives them, with its two inner loops; the model drives this, and every step that acts is a tool the harness executes', ref: { id: 'cards', label: 'EACH CARD', sub: 'one state per card, one action → see its tab', x: 1040, y: 520, to: 'cards' } },
  cards: { title: 'Each card — what the tools see and do', blurb: 'the nine states a card can be in as the policeman sees it, what a pass finds to move it, and the one action it takes there', ref: null },
  merge: { title: 'Two checkers → one', blurb: 'today the Board check (harness code, every minute) and the policeman (a model turn, every five minutes) both write on one card and share one responsibility; merged, the Board check’s loop does the whole sweep and the model is asked one question per card that has new messages — one loop, one 🧠 box, one name on the card', ref: null },
};

export function levelElements(level) {
  const L = LEVELS[level];
  if (!L) throw new Error('unknown level ' + level);
  // A tab shows the nodes directly under it, plus one inline group (a box drawn inside the tab) and its nodes.
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

/** Every endpoint and parent exists; every state (not a group) is reachable and, except the
 * terminal ones, has a way out; the card machine never moves a card backwards. */
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
  return { ok: problems.length === 0, problems, nodes: NODES.length, edges: EDGES.length };
}
