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
const S = (id, label, sub, x, y, opts = {}) => ({ id, label, sub, x, y, kind: 'state', tone: 'plain', shape: 'state', ...opts });

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
  S('rollover', 'Rolling over', 'context ≥ cap · session cut · handover parked', -900, 860, { parent: 'agent' }),
  S('errored', 'Errored', 'the turn crashed · cooldown', -1300, 860, { parent: 'agent', tone: 'bad' }),

  // ---- level 2: the pass (inside "pass") ---------------------------------------------------
  S('s1', '1 · board_integrity', 'read the harness’s verdict', -440, 0, { parent: 'pass', kind: 'step', shape: 'io' }),
  S('s2', '2 · list_tasks', 'read every card and its marks', -120, 0, { parent: 'pass', kind: 'step', shape: 'io' }),
  S('s3', '3 · read_transcript', 'read the assignee’s last 4 messages', 200, 0, { parent: 'pass', kind: 'step', shape: 'io' }),
  S('s4', '4 · classify', 'which state is this card in?', 560, 0, { parent: 'pass', kind: 'step', tone: 'ok', shape: 'decision' }),
  S('s5', '5 · list_pull_requests', 'read each repo’s PRs, traced to cards', 560, 200, { parent: 'pass', kind: 'step', shape: 'io' }),
  S('s6', '6 · sync_card', 'link the PR · the harness moves the card', 200, 200, { parent: 'pass', kind: 'step', tone: 'ok', shape: 'process' }),
  S('s7', '7 · flag / clear', 'flag_needs_human · clear_needs_human', -120, 200, { parent: 'pass', kind: 'step', tone: 'bad', shape: 'process' }),
  S('s8', '8 · verdict', 'counts · moves · observations · flags', -440, 200, { parent: 'pass', kind: 'step', shape: 'terminal' }),

  // ---- level 3: each card (inside "cards") -------------------------------------------------
  S('c-unassigned', '📥 Unassigned', 'To do, nobody on it → nothing', -120, 560, { parent: 'cards', kind: 'card' }),
  S('c-waiting', '⏳ Waiting for the arch', 'assigned, not pinged → nothing', 220, 560, { parent: 'cards', kind: 'card' }),
  S('c-working', '⚙️ Working', 'agent active, column = facts → observe Working', 560, 560, { parent: 'cards', kind: 'card', tone: 'ok' }),
  S('c-ahead', '⚠️ Ahead of the facts', 'column > verified → report; never demote', 1000, 560, { parent: 'cards', kind: 'card', tone: 'warn' }),
  S('c-behind', '⏩ Behind the facts', 'PR / merge found → sync_card', 220, 840, { parent: 'cards', kind: 'card', tone: 'ok' }),
  S('c-stuck', '🛑 Stuck', 'asked · blocked · errored · silent → observe, flag', 560, 840, { parent: 'cards', kind: 'card', tone: 'bad' }),
  S('c-skip', '🚫 Not mine', 'manual or delivered → leave alone', 1000, 840, { parent: 'cards', kind: 'card', shape: 'terminal' }),
  S('c-flagged', '🆘 Flagged', 'human request on it → clear if mine & resolved', -120, 1120, { parent: 'cards', kind: 'card', tone: 'bad' }),
  S('c-review', '👀 Waiting for review', 'PR open, agent done → observe; report if stale', 560, 1120, { parent: 'cards', kind: 'card' }),
];

const E = (source, target, label, kind = 'lifecycle') => ({ id: `${source}->${target}`, source, target, label, kind });

export const EDGES = [
  // ---- level 1: the agent ------------------------------------------------------------------
  E('off', 'armed', '▶ Start'),
  E('armed', 'pass', 'interval elapsed · 👁 Check now'),
  E('pass', 'armed', 'turn ended · context < cap'),
  E('pass', 'wait', 'reply ends with NEEDS_HUMAN:'),
  E('wait', 'armed', 'you answer in the conversation'),
  E('pass', 'rollover', 'context ≥ cap (or 400 turns)'),
  E('rollover', 'armed', 'next pass: fresh session + handover'),
  E('pass', 'errored', 'turn crashed'),
  E('errored', 'armed', 'cooldown passed → tick re-arms'),
  E('armed', 'armed', 'pass 100 (recipe cap) → tick re-arms'),
  E('armed', 'stopped', '■ Stop'),
  E('wait', 'stopped', '■ Stop'),
  E('stopped', 'armed', '▶ Start'),
  E('armed', 'paused', 'gate closed / kill switch off'),
  E('paused', 'armed', 'gate open · switch on'),
  E('armed', 'off', '🗑 conversation removed'),

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
  E('c-unassigned', 'c-waiting', 'arch or you assign', 'card'),
  E('c-waiting', 'c-working', 'arch pings', 'card'),
  E('c-working', 'c-ahead', 'someone moved it past the facts', 'card'),
  E('c-ahead', 'c-working', 'facts catch up', 'card'),
  E('c-working', 'c-behind', 'PR traced to the card', 'card'),
  E('c-working', 'c-stuck', 'asks · blocks · errors · silent > window', 'card'),
  E('c-working', 'c-skip', 'delivered · go manual', 'card'),
  E('c-ahead', 'c-stuck', 'keeps lying, nobody fixes it', 'card'),
  E('c-behind', 'c-review', 'sync_card → PR open', 'card'),
  E('c-behind', 'c-skip', 'sync_card → merged / done', 'card'),
  E('c-review', 'c-skip', 'merged', 'card'),
  E('c-review', 'c-ahead', 'PR closed unmerged', 'card'),
  E('c-stuck', 'c-flagged', 'flag_needs_human (with reason)', 'card'),
  E('c-flagged', 'c-working', 'you Resolve · agent back on track', 'card'),
];

/** Cytoscape elements: nodes carry their preset position; groups none (they size to children). */
export function toElements() {
  return [
    ...NODES.map((n) => ({
      data: { id: n.id, label: n.label, sub: n.sub || '', kind: n.kind, tone: n.tone || 'plain', shape: n.shape || (n.kind === 'group' ? 'group' : 'state'), parent: n.parent || undefined },
      position: n.kind === 'group' ? undefined : { x: n.x, y: n.y },
      classes: `${n.kind} tone-${n.tone || 'plain'} shape-${n.shape || (n.kind === 'group' ? 'group' : 'state')}`,
    })),
    ...EDGES.map((e) => ({ data: { id: e.id, source: e.source, target: e.target, label: e.label, kind: e.kind, curve: e.curve || 'bezier' }, classes: e.kind })),
  ];
}

/** The entry state of each level, and the terminal ones (the pass ends at the verdict; a card the
 * policeman leaves alone has nowhere further to go). */
export const ENTRIES = new Set(['off', 's1', 'c-unassigned']);
export const TERMINALS = new Set(['s8', 'c-skip']);

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
