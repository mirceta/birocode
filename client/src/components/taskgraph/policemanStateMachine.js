// The policeman's FULL workings as ONE state diagram (openspec policeman-observes-agents):
// a directed graph with three nested levels, rendered by cytoscape in the understanding app.
//
//   level 1  THE AGENT      — the states the policeman conversation itself is in
//                             (not set up · armed · pass running · waiting for you · rolling
//                             over · errored · stopped · disarmed) and what moves it between them
//   level 2  THE PASS       — inside "pass running": the steps of one pass, in order, with the
//                             two inner loops (each in-flight card; each repo's PRs)
//   level 3  EACH CARD      — inside the read step: the nine states a card can be in as the
//                             policeman sees it and what a pass finds to move it, with the one
//                             action it takes in each
//
// Pure data + validation (node --test); positions are preset so the picture is stable and
// readable — a layout engine would redraw it differently every time.

// Flowchart shapes (the legend follows these): terminal = start / end pill · state = rounded box
// (a state the agent or a card rests in) · io = parallelogram (a step that READS) · process =
// rectangle (a step that ACTS) · decision = diamond (a branch).
export const SHAPES = {
  terminal: 'start / end',
  state: 'a state it rests in',
  io: 'a step that reads',
  process: 'a step that acts',
  decision: 'a decision',
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

export const NODES = [
  // ---- groups (compound parents) ---------------------------------------------------------------
  { id: 'agent', label: 'THE AGENT — the policeman conversation', kind: 'group' },
  { id: 'pass', label: 'PASS RUNNING — one pass, in order', kind: 'group', parent: 'agent' },
  { id: 'cards', label: 'EACH CARD — one state per card per pass, one action per state', kind: 'group', parent: 'pass' },

  // ---- level 1: the agent ------------------------------------------------------------------
  S('off', 'START — Not set up', 'no conversation yet', -900, -80, { parent: 'agent', tone: 'start', shape: 'terminal' }),
  S('armed', 'Armed', 'loop armed · waiting for the interval', -900, 200, { parent: 'agent', tone: 'ok' }),
  S('stopped', 'Stopped', 'you pressed ■ Stop · no tick re-arms it', -1300, 200, { parent: 'agent' }),
  S('paused', 'Disarmed', 'operator gate closed / kill switch off', -1300, 480, { parent: 'agent', tone: 'warn' }),
  S('wait', 'Waiting for you', 'the pass ended with NEEDS_HUMAN:', -900, 560, { parent: 'agent', tone: 'warn' }),
  S('rollover', 'Rolling over', 'context ≥ cap · session cut · handover parked', -80, 860, { parent: 'agent' }),
  S('errored', 'Errored', 'the turn crashed · cooldown', -1300, 860, { parent: 'agent', tone: 'bad' }),

  // ---- level 2: the pass (inside "pass") ---------------------------------------------------
  S('s1', '1 · board_integrity', 'read the harness’s verdict', -440, 0, { parent: 'pass', kind: 'step', shape: 'io' }),
  S('s2', '2 · list_tasks', 'read every card and its marks', -120, 0, { parent: 'pass', kind: 'step', shape: 'io' }),
  S('s3', '3 · read_transcript', 'read the assignee’s last 4 messages', 200, 0, { parent: 'pass', kind: 'step', shape: 'io' }),
  S('s4', '4 · classify', 'which state is this card in?', 560, 0, { parent: 'pass', kind: 'step', tone: 'ok', shape: 'decision', who: 'model' }),
  S('s5', '5 · list_pull_requests', 'read each repo’s PRs, traced to cards', 560, 200, { parent: 'pass', kind: 'step', shape: 'io' }),
  S('s6', '6 · sync_card', 'link the PR · the harness moves the card', 200, 200, { parent: 'pass', kind: 'step', tone: 'ok', shape: 'process', who: 'mixed' }),
  S('s7', '7 · flag / clear', 'flag_needs_human · clear_needs_human', -120, 200, { parent: 'pass', kind: 'step', tone: 'bad', shape: 'process', who: 'mixed' }),
  S('s8', '8 · verdict', 'counts · moves · observations · flags', -440, 200, { parent: 'pass', kind: 'step', shape: 'terminal', who: 'model' }),

  // ---- level 3: each card (inside "cards") -------------------------------------------------
  S('c-unassigned', '📥 Unassigned', 'To do, nobody on it → nothing', -120, 560, { parent: 'cards', kind: 'card' }),
  S('c-waiting', '⏳ Waiting for the arch', 'assigned, not pinged → nothing', 220, 560, { parent: 'cards', kind: 'card' }),
  S('c-working', 'Working', 'agent active, column = facts → observe Working', 560, 560, { parent: 'cards', kind: 'card', tone: 'ok', who: 'model' }),
  S('c-ahead', '⚠️ Ahead of the facts', 'column > verified → report; never demote', 1000, 560, { parent: 'cards', kind: 'card', tone: 'warn' }),
  S('c-behind', '⏩ Behind the facts', 'PR / merge found → sync_card', 220, 840, { parent: 'cards', kind: 'card', tone: 'ok' }),
  S('c-stuck', '🛑 Stuck', 'asked · blocked · errored · silent → observe, flag', 560, 840, { parent: 'cards', kind: 'card', tone: 'bad', who: 'mixed' }),
  S('c-skip', '🚫 Not mine', 'manual · external owner · delivered → leave alone', 1000, 840, { parent: 'cards', kind: 'card', shape: 'terminal' }),
  S('c-flagged', '🆘 Flagged', 'human request on it → clear if mine & resolved', -120, 1120, { parent: 'cards', kind: 'card', tone: 'bad' }),
  S('c-review', '👀 Waiting for review', 'PR open, agent done → observe; report if stale', 560, 1120, { parent: 'cards', kind: 'card', who: 'mixed' }),
];

const E = (source, target, label, kind = 'lifecycle', who = kind === 'flow' || kind === 'link' ? 'model' : 'code') => ({ id: `${source}->${target}`, source, target, label, kind, who });

export const EDGES = [
  // ---- level 1: the agent ------------------------------------------------------------------
  E('off', 'armed', '▶ Start', 'lifecycle', 'human'),
  E('armed', 'pass', 'interval elapsed · 👁 Check now'),
  E('pass', 'armed', 'turn ended · context < cap'),
  E('pass', 'wait', 'reply ends with NEEDS_HUMAN:', 'lifecycle', 'model'),
  E('wait', 'armed', 'you answer in the conversation', 'lifecycle', 'human'),
  E('pass', 'rollover', 'context ≥ cap (or 400 turns)'),
  E('rollover', 'armed', 'next pass: fresh session + handover'),
  E('pass', 'errored', 'turn crashed'),
  E('errored', 'armed', 'cooldown passed → tick re-arms'),
  E('armed', 'armed', 'pass 100 (recipe cap) → tick re-arms'),
  E('armed', 'stopped', '■ Stop', 'lifecycle', 'human'),
  E('wait', 'stopped', '■ Stop', 'lifecycle', 'human'),
  E('stopped', 'armed', '▶ Start', 'lifecycle', 'human'),
  E('armed', 'paused', 'gate closed / kill switch off', 'lifecycle', 'human'),
  E('paused', 'armed', 'gate open · switch on', 'lifecycle', 'human'),
  E('armed', 'off', '🗑 conversation removed', 'lifecycle', 'human'),

  // ---- level 2: the pass -------------------------------------------------------------------
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

  // ---- level 3: each card ------------------------------------------------------------------
  E('c-unassigned', 'c-waiting', 'arch or you assign', 'card', 'human'),
  E('c-waiting', 'c-working', 'arch pings', 'card', 'human'),
  E('c-working', 'c-ahead', 'someone moved it past the facts', 'card', 'human'),
  E('c-ahead', 'c-working', 'facts catch up', 'card'),
  E('c-working', 'c-behind', 'PR traced to the card', 'card'),
  E('c-working', 'c-stuck', 'asks · blocks · errors · silent > window', 'card', 'mixed'),
  E('c-working', 'c-skip', 'delivered · go manual · external owner', 'card'),
  E('c-ahead', 'c-stuck', 'keeps lying, nobody fixes it', 'card', 'model'),
  E('c-behind', 'c-review', 'sync_card → PR open', 'card'),
  E('c-behind', 'c-skip', 'sync_card → merged / done', 'card'),
  E('c-review', 'c-skip', 'merged', 'card'),
  E('c-review', 'c-ahead', 'PR closed unmerged', 'card'),
  E('c-stuck', 'c-flagged', 'flag_needs_human (with reason)', 'card', 'mixed'),
  E('c-flagged', 'c-working', 'you Resolve · agent back on track', 'card', 'human'),
];

/** Cytoscape elements: nodes carry their preset position; groups none (they size to children). */
export function toElements() {
  return [
    ...NODES.map((n) => ({
      data: { id: n.id, label: n.label, sub: n.sub || '', kind: n.kind, tone: n.tone || 'plain', shape: n.shape || (n.kind === 'group' ? 'group' : 'state'), who: n.who || 'code', parent: n.parent || undefined },
      position: n.kind === 'group' ? undefined : { x: n.x, y: n.y },
      classes: `${n.kind} tone-${n.tone || 'plain'} shape-${n.shape || (n.kind === 'group' ? 'group' : 'state')} who-${n.who || 'code'}`,
    })),
    ...EDGES.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, label: e.label, kind: e.kind, who: e.who || 'code', curve: e.curve || 'bezier' }, classes: `${e.kind} who-${e.who || 'code'}` })),
  ];
}

/** The entry state of each level, and the terminal ones (the pass ends at the verdict; a card the
 * policeman leaves alone has nowhere further to go). */
export const ENTRIES = new Set(['off', 's1', 'c-unassigned']);
export const TERMINALS = new Set(['s8', 'c-skip']);

/** The three levels as three separate pictures (one tab each): the nested level appears as ONE
 * stand-in node (kind 'ref') that links to its own tab, so no picture is crowded. */
export const LEVELS = {
  agent: { title: 'The agent', blurb: 'the states the policeman conversation itself is in, and what moves it', ref: { id: 'pass', label: 'PASS RUNNING', sub: 'one pass, in order → see its tab', x: -420, y: 300, to: 'pass' } },
  pass: { title: 'The pass', blurb: 'the steps of one pass, in order, with its two inner loops', ref: { id: 'cards', label: 'EACH CARD', sub: 'one state per card, one action → see its tab', x: 960, y: 440, to: 'cards' } },
  cards: { title: 'Each card', blurb: 'the nine states a card can be in as the policeman sees it, what a pass finds to move it, and the one action it takes there', ref: null },
};

export function levelElements(level) {
  const L = LEVELS[level];
  if (!L) throw new Error('unknown level ' + level);
  const own = NODES.filter((n) => n.kind !== 'group' && n.parent === level);
  const ids = new Set(own.map((n) => n.id));
  const nodes = own.map((n) => ({
    data: { id: n.id, label: n.label, sub: n.sub || '', kind: n.kind, tone: n.tone || 'plain', shape: n.shape || 'state', who: n.who || 'code' },
    position: { x: n.x, y: n.y },
    classes: `${n.kind} tone-${n.tone || 'plain'} shape-${n.shape || 'state'} who-${n.who || 'code'}`,
  }));
  if (L.ref) {
    ids.add(L.ref.id);
    nodes.push({ data: { id: L.ref.id, label: L.ref.label, sub: L.ref.sub, kind: 'ref', tone: 'plain', shape: 'ref', who: 'mixed', to: L.ref.to }, position: { x: L.ref.x, y: L.ref.y }, classes: 'ref shape-ref who-mixed' });
  }
  const edges = EDGES.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({
    data: { id: e.id, source: e.source, target: e.target, label: e.label, kind: e.kind, who: e.who || 'code', curve: e.curve || 'bezier' }, classes: `${e.kind} who-${e.who || 'code'}`,
  }));
  return [...nodes, ...edges];
}

/** Every endpoint and parent exists; every state (not a group) is reachable and, except the
 * terminal "Not mine", has a way out; the card machine never moves a card backwards. */
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
