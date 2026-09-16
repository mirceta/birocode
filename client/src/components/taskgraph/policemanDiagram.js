// The policeman EXPLAINED as data (openspec policeman-observes-agents): the two state
// machines a card lives in, the pass the policeman runs, what it can and cannot do, and
// where its provenance lives — rendered to SVG / read by the explainer tab and the
// understanding app alike. Pure, framework-free (node --test).
//
// Two machines, on purpose kept apart:
//   BOARD_CHECK — one state per card judged from FACTS (git, GitHub, the deploy log);
//   LIFECYCLE   — the column, and WHO may move it (a claim vs an observation).
// The Agent observation (OBSERVATIONS in cardSections.js) is a READING of the agent's
// conversation, not a state machine: it is whatever the policeman last read.

export const BOARD_CHECK = {
  id: 'board-check',
  title: 'Board check — one state per card, from the facts',
  width: 860, height: 430,
  states: [
    { id: 'honest', x: 40, y: 180, w: 190, h: 58, label: '✅ Honest', sub: 'column ≤ what is verified', tone: 'ok' },
    { id: 'unverified', x: 340, y: 30, w: 210, h: 58, label: '⚠️ Not verified yet', sub: 'column ahead of the facts', tone: 'warn' },
    { id: 'needs-human', x: 340, y: 340, w: 210, h: 58, label: '🆘 Needs human', sub: 'someone raised it', tone: 'bad' },
    { id: 'manual', x: 660, y: 180, w: 170, h: 58, label: '🔧 Manual', sub: 'not policed at all', tone: 'plain' },
    { id: 'external', x: 660, y: 340, w: 170, h: 58, label: '👤 External owner', sub: 'another human’s — not ours', tone: 'plain' },
  ],
  edges: [
    { from: 'honest', to: 'unverified', label: 'a CLAIM moves the card ahead (agent · arch · you)', bend: -30 },
    { from: 'unverified', to: 'honest', label: 'the facts catch up (verifier, every minute)', bend: -30 },
    { from: 'honest', to: 'needs-human', label: 'policeman flags · agent asks · you raise', bend: 40 },
    { from: 'needs-human', to: 'honest', label: 'you Resolve (policeman clears only its own)', bend: 40 },
    { from: 'unverified', to: 'needs-human', label: 'keeps lying, nobody fixes it → policeman flags', bend: 0 },
    { from: 'unverified', to: 'manual', label: 'you: go manual', bend: -20 },
    { from: 'needs-human', to: 'manual', label: 'you: go manual', bend: 20 },
    { from: 'manual', to: 'honest', label: 'you: back to auto', bend: -150 },
    { from: 'honest', to: 'external', label: 'you: name an external owner', bend: 90 },
    { from: 'external', to: 'honest', label: 'you: ours again', bend: 90 },
  ],
};

export const LIFECYCLE = {
  id: 'lifecycle',
  title: 'Progress — the column, and who may move it',
  width: 900, height: 200,
  states: [
    { id: 'todo', x: 20, y: 70, w: 110, h: 54, label: 'To do', sub: 'assigned, not pinged', tone: 'plain' },
    { id: 'doing', x: 170, y: 70, w: 110, h: 54, label: 'Doing', sub: 'pinged / picked up', tone: 'plain' },
    { id: 'committed', x: 320, y: 70, w: 120, h: 54, label: 'Committed', sub: 'commits on a branch', tone: 'plain' },
    { id: 'pr-opened', x: 480, y: 70, w: 120, h: 54, label: 'PR open', sub: 'the PR is on GitHub', tone: 'plain' },
    { id: 'pr-merged', x: 640, y: 70, w: 110, h: 54, label: 'Merged', sub: 'GitHub says merged', tone: 'plain' },
    { id: 'done', x: 790, y: 70, w: 90, h: 54, label: 'Done', sub: 'merge is live', tone: 'ok' },
  ],
  edges: [
    { from: 'todo', to: 'doing', label: 'arch pings', bend: -34 },
    { from: 'doing', to: 'committed', label: 'agent relays · verifier sees commits', bend: -34 },
    { from: 'committed', to: 'pr-opened', label: 'verifier sees the PR · policeman sync_card', bend: -34 },
    { from: 'pr-opened', to: 'pr-merged', label: 'verifier: merged', bend: -34 },
    { from: 'pr-merged', to: 'done', label: 'verifier: live', bend: -34 },
    { from: 'doing', to: 'pr-opened', label: 'policeman: PR traced to the card → sync_card', bend: 70 },
  ],
  note: 'Forward moves by OBSERVATION (the verifier, the policeman’s sync_card) need facts. A CLAIM (agent, arch, you dragging) moves a card anywhere — and the Board check then says whether the facts agree. Nothing ever moves a card backwards by observation.',
};


// ---- How the policeman DRIVES a card ------------------------------------------------------
//
// The policeman's own state machine: every pass it classifies EVERY card into exactly one of
// these states (from the column, the facts, what it read in the agent's conversation, and
// the marks already on the card) and does the one thing that state calls for. The edges
// are what a pass finds; the action on each state is the whole of its responsibility there.
export const DRIVE = {
  id: 'drive',
  title: 'How the policeman drives a card — one state per card per pass, one action per state',
  width: 1240, height: 680,
  states: [
    { id: 'unassigned', x: 20, y: 60, w: 200, h: 84, label: '📥 Unassigned', sub: 'To do, nobody on it', action: '→ nothing; mention it if the goal needs it', tone: 'plain' },
    { id: 'waiting-arch', x: 300, y: 60, w: 220, h: 84, label: '⏳ Waiting for the arch', sub: 'assigned, not yet pinged', action: '→ nothing; the arch pings', tone: 'plain' },
    { id: 'working', x: 600, y: 60, w: 220, h: 84, label: '⚙️ Working', sub: 'in flight, agent active, column = facts', action: '→ observe Working; nothing else', tone: 'ok' },
    { id: 'ahead', x: 1000, y: 60, w: 220, h: 84, label: '⚠️ Ahead of the facts', sub: 'column claims more than verified', action: '→ report dishonest; never demote', tone: 'warn' },
    { id: 'behind', x: 300, y: 300, w: 220, h: 84, label: '⏩ Behind the facts', sub: 'PR / merge found, column lags', action: '→ sync_card: the harness moves it', tone: 'ok' },
    { id: 'stuck', x: 600, y: 300, w: 220, h: 84, label: '🛑 Stuck', sub: 'asked · blocked · errored · silent past the window', action: '→ observe; flag_needs_human', tone: 'bad' },
    { id: 'skip', x: 1000, y: 300, w: 220, h: 84, label: '🚫 Not mine', sub: 'manual, external owner, or delivered', action: '→ leave alone; clear my own marks', tone: 'plain' },
    { id: 'flagged', x: 20, y: 540, w: 220, h: 84, label: '🆘 Flagged', sub: 'carries a human request', action: '→ clear if mine and resolved; else leave, report', tone: 'bad' },
    { id: 'review', x: 600, y: 540, w: 220, h: 84, label: '👀 Waiting for review', sub: 'PR open, agent done', action: '→ observe; report if stale', tone: 'plain' },
  ],
  edges: [
    { from: 'unassigned', to: 'waiting-arch', label: 'arch or you assign', bend: -100 },
    { from: 'waiting-arch', to: 'working', label: 'arch pings', bend: -100 },
    { from: 'working', to: 'ahead', label: 'someone moved it past the facts', bend: -100 },
    { from: 'ahead', to: 'working', label: 'facts catch up', bend: -100 },
    { from: 'working', to: 'behind', label: 'PR traced to the card', bend: 30 },
    { from: 'working', to: 'stuck', label: 'asks · blocks · errors · silent > window', bend: 0 },
    { from: 'working', to: 'skip', label: 'delivered · go manual · external owner', bend: 80 },
    { from: 'ahead', to: 'stuck', label: 'keeps lying, nobody fixes it', bend: 30 },
    { from: 'behind', to: 'review', label: 'sync_card → PR open', bend: -50 },
    { from: 'behind', to: 'skip', label: 'sync_card → merged / done', bend: 120 },
    { from: 'review', to: 'skip', label: 'merged', bend: 0 },
    { from: 'review', to: 'ahead', label: 'PR closed unmerged', bend: 60 },
    { from: 'stuck', to: 'flagged', label: 'flag (with reason)', bend: 40 },
    { from: 'flagged', to: 'working', label: 'you Resolve · agent back on track', bend: -150 },
  ],
  note: 'Classification is mechanical first (board_integrity: external · manual · dishonest · stuck · honest), then read (the agent’s last messages), then GitHub (PRs traced to cards). One state wins per card; the action is the whole responsibility in that state. Nothing here dispatches, and nothing moves a card backwards.',
};

/** The same machine as a decision table: how it recognises the state, what it does, what it never does. */
export const DRIVE_TABLE = [
  ['📥 Unassigned', 'To do, no assignee', 'nothing — say so in the verdict if the board goal needs this card moving', 'assign (that is the arch’s / yours)'],
  ['⏳ Waiting for the arch', 'assigned, dispatchedAt empty', 'nothing — the arch pings on its next wake', 'ping'],
  ['⚙️ Working', 'Doing / Committed with an assignee; transcript shows work; column ≤ facts', 'observe_card working (re-observe only on change)', 'move, flag'],
  ['⏩ Behind the facts', 'a PR (open or merged) traces to the card and its column is below it', 'sync_card(id, pr, branch) → the harness moves it forward', 'move by claim; guess on a title-only trace without reading'],
  ['👀 Waiting for review', 'PR open on GitHub, agent says it is done', 'observe_card waiting-review; report if stale past the window', 'ping the reviewer, merge'],
  ['⚠️ Ahead of the facts', 'board_integrity says dishonest (column > verified)', 'report it with the plain reason; flag if it persists and nobody fixes it', 'demote the card'],
  ['🛑 Stuck', 'asked a question unanswered · says blocked · errored · silent past the window, no PR', 'observe_card (asked-question / blocked / errored / idle), then flag_needs_human with a reason that stands alone', 'answer for the human, re-ping'],
  ['🆘 Flagged', 'needsHuman on the card (by policeman / agent / operator)', 'if mine and the card is honest again → clear_needs_human; otherwise leave it and report', 'clear another raiser’s request'],
  ['🚫 Not mine', 'manual, externally owned, or Merged / Done', 'leave alone; on a delivered card withdraw my own observation', 'read, observe, move or flag a manual or externally owned card'],
];

/** The pass the policeman runs every interval, in order. */
export const PASS = [
  { n: 1, tool: 'board_integrity', what: 'the harness’s verdict from the facts: dishonest · stuck · manual · external · who raised what' },
  { n: 2, tool: 'list_tasks → read_transcript → observe_card', what: 'for EVERY in-flight card: read the agent’s last messages, record what it is doing in plain words (Agent section on the card)' },
  { n: 3, tool: 'list_pull_requests → sync_card', what: 'every PR traced back to its card; a card behind its PR is linked and re-verified → the harness moves it forward' },
  { n: 4, tool: 'flag_needs_human / clear_needs_human', what: 'stuck, asked-and-unanswered, blocked, errored past the window, or a card that keeps lying → 🆘 with a reason' },
  { n: 5, tool: '(provenance)', what: 'every observation, flag and move carries its name, the time and the session id' },
  { n: 6, tool: 'verdict', what: 'N honest · N dishonest · N need human · N manual · N external — then one line per move, per worrying observation, per flag; or “no change”' },
];

export const CAN = [
  ['Read', 'the board, every agent’s last messages (any machine), git state, loops, goals, ideas, its own memory'],
  ['Observe', 'record on a card what the agent is doing, from its own words: working · waiting for review · asked a question · blocked · says done · idle · errored'],
  ['Move forward by facts', 'link a PR / branch to a card and re-verify: the harness moves the card to what GitHub proves — Doing → PR open, → Merged'],
  ['Flag', 'stamp 🆘 Needs human with a reason; clear its own stamps'],
  ['Talk', 'answer you in its conversation; end a pass with NEEDS_HUMAN: when only you can decide'],
];

export const CANNOT = [
  ['Dispatch or ping', 'send_task and dispatch_task are withheld — it never talks to a repo agent'],
  ['Move by claim', 'update_task is withheld — a card moves only where the facts put it, never backwards'],
  ['Create, assign, delete', 'the board’s shape is the arch’s and yours'],
  ['Run loops or goals', 'start/stop loop and goal tools are withheld'],
  ['Touch a manual or externally owned card', 'not read, not observed, not moved, not flagged — an external owner’s card is out of our domain, not ours to judge'],
  ['Read a claimed repo', 'a repo you are working in refuses the read unless you hand it over or ask'],
];

export const PROVENANCE = [
  ['On the card', 'Board check and Agent sections say WHO set the state (auto-verifier · policeman · agent · you), WHEN, and the policeman session id'],
  ['History lane', 'every tool call of every policeman session, with input and result — click a past session in the strip'],
  ['Sessions strip', 'each CLI session with its turns and context; a rollover at the cap starts a new one with a mechanical handover'],
  ['Audit log', 'every call is audited under actor arch, conversation @arch:policeman, tool name and outcome'],
  ['The agent’s conversation', 'what the policeman read is the repo agent’s own dock chat — open it to see the source'],
];

// ---- SVG renderer ------------------------------------------------------------------------

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const center = (s) => [s.x + s.w / 2, s.y + s.h / 2];

/** The point on s's border in the direction of (tx, ty). */
function anchor(s, tx, ty) {
  const [cx, cy] = center(s);
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const sx = dx === 0 ? Infinity : (s.w / 2) / Math.abs(dx);
  const sy = dy === 0 ? Infinity : (s.h / 2) / Math.abs(dy);
  const k = Math.min(sx, sy);
  return [cx + dx * k, cy + dy * k];
}

/** One edge as a quadratic curve with an arrowhead and a haloed label at its middle. */
function edgeSvg(d, e, i) {
  const a = d.states.find((s) => s.id === e.from);
  const b = d.states.find((s) => s.id === e.to);
  if (!a || !b) return '';
  const [acx, acy] = center(a);
  const [bcx, bcy] = center(b);
  // Control point: the midpoint pushed along the normal by `bend`.
  const mx = (acx + bcx) / 2;
  const my = (acy + bcy) / 2;
  const len = Math.hypot(bcx - acx, bcy - acy) || 1;
  const nx = -(bcy - acy) / len;
  const ny = (bcx - acx) / len;
  const bend = e.bend || 0;
  const cx = mx + nx * bend;
  const cy = my + ny * bend;
  const [ax, ay] = anchor(a, cx, cy);
  const [bx, by] = anchor(b, cx, cy);
  // Label at t = 0.5 of the curve.
  const lx = 0.25 * ax + 0.5 * cx + 0.25 * bx;
  const ly = 0.25 * ay + 0.5 * cy + 0.25 * by;
  return `<g class="pd__edge" data-edge="${esc(e.from)}-${esc(e.to)}"><path d="M ${ax.toFixed(1)} ${ay.toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}" marker-end="url(#pd-arrow-${d.id})"/><text x="${lx.toFixed(1)}" y="${(ly - 4).toFixed(1)}" text-anchor="middle" class="pd__elabel">${esc(e.label)}</text></g>`;
}

function stateSvg(s) {
  const [cx] = center(s);
  const action = s.action ? `<text x="${cx}" y="${s.y + 66}" text-anchor="middle" class="pd__action">${esc(s.action)}</text>` : '';
  return `<g class="pd__state pd__state--${esc(s.tone)}" data-state="${esc(s.id)}"><rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="12"/><text x="${cx}" y="${s.y + 24}" text-anchor="middle" class="pd__label">${esc(s.label)}</text><text x="${cx}" y="${s.y + 43}" text-anchor="middle" class="pd__sub">${esc(s.sub)}</text>${action}</g>`;
}

/** The diagram as an SVG string (viewBox-scaled, so it fits any width). */
export function toSvg(d) {
  const edges = d.edges.map((e, i) => edgeSvg(d, e, i)).join('');
  const states = d.states.map(stateSvg).join('');
  return `<svg class="pd" viewBox="0 0 ${d.width} ${d.height}" role="img" aria-label="${esc(d.title)}" data-diagram="${esc(d.id)}"><defs><marker id="pd-arrow-${esc(d.id)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" class="pd__arrowhead"/></marker></defs>${edges}${states}</svg>`;
}

/** Sanity for tests and the understanding app: every edge names two known states. */
export function validate(d) {
  const ids = new Set(d.states.map((s) => s.id));
  const bad = d.edges.filter((e) => !ids.has(e.from) || !ids.has(e.to));
  return { ok: bad.length === 0, bad, states: ids.size, edges: d.edges.length };
}
