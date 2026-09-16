// Pure badge descriptors for the Status tab (fleet task a25ee2de). The per-machine
// header line ("build 791292b · behind the hub · accepts sends · no upgrades · gate
// closed"), its agent-count meta, the agent detail rows and the Overview values were
// bare "a · b · c" text. Each function here returns badge descriptors —
//   { key, label, tone, mono?, title?, data? }   tone ∈ ok | warn | bad | muted | unknown | accent | plain
// — and the components render them through ONE <StatusBadge>, so every state reads
// with the same shape and colour across the whole tab (and the header strip's Machine
// tile, which shares the Overview rows). Presentation only: every value is the fleet
// feed's own, nothing is dropped, and an unknown stays an honest "unknown — why".
// Framework-free so it unit-tests under `node --test`.
import { shortVersion, NA } from './fleetStatusTabs.js';

/** The machine header's posture badges: build, hub sync, sends/upgrades opt-ins, gate,
 * and (peers only) whether THIS hub may send there. An unreachable machine shows its
 * status and the detail instead. */
export function machineBadges(m) {
  if (!m) return [];
  if (!m.reachable) {
    const out = [{ key: 'status', label: m.status || 'unreachable', tone: 'bad', title: 'The hub could not reach this machine' }];
    if (m.detail) out.push({ key: 'detail', label: m.detail, tone: 'muted', title: 'Why the hub could not reach it' });
    return out;
  }
  const v = shortVersion(m.version);
  const out = [
    { key: 'build', label: `build ${v}`, tone: v === NA ? 'unknown' : 'muted', mono: true, title: m.version ? `harness build ${m.version}` : 'harness build unknown' },
  ];
  // `behind` = the peer's build differs from the hub's (ArchAgentService); the hub itself
  // is trivially in step, so the sync badge is a peer thing.
  if (!m.self) {
    out.push(m.behind
      ? { key: 'sync', label: 'behind the hub', tone: 'warn', title: 'This machine runs a different build than the hub' }
      : { key: 'sync', label: 'same build as hub', tone: 'ok', title: 'This machine runs the same build as the hub' });
  }
  out.push(
    { key: 'sends', label: m.acceptsSends ? 'accepts sends' : 'no sends', tone: m.acceptsSends ? 'ok' : 'muted', title: 'Whether this machine accepts tasks sent by the fleet' },
    { key: 'upgrades', label: m.acceptsUpgrades ? 'accepts upgrades' : 'no upgrades', tone: m.acceptsUpgrades ? 'ok' : 'muted', title: 'Whether this machine accepts hub-driven build upgrades' },
    { key: 'gate', label: m.gateOpen ? 'gate open' : 'gate closed', tone: m.gateOpen ? 'ok' : 'warn', title: 'The operator gate on that machine (closed = its agents stay idle)' },
  );
  if (!m.self) {
    out.push({ key: 'allow', label: m.allowSends ? 'sends allowed' : 'sends not allowed', tone: m.allowSends ? 'ok' : 'muted', title: 'Whether this hub is allowed to send tasks to that machine' });
  }
  return out;
}

/** The machine header's counts: agents, managed, running, hidden by the filter. */
export function machineMeta(m, { running = 0, hidden = 0, narrowed = false } = {}) {
  const n = (m?.agents || []).length;
  const managed = typeof m?.managedCount === 'number' ? m.managedCount : null;
  const out = [
    { key: 'agents', label: `${n} agent${n === 1 ? '' : 's'}`, tone: 'muted', title: 'Repo agents on this machine' },
    managed === null
      ? { key: 'managed', label: `🏛 ${NA} managed`, tone: 'unknown', title: 'This build does not report the managed count' }
      : { key: 'managed', label: `🏛 ${managed} managed`, tone: managed > 0 ? 'accent' : 'muted', title: "In the arch agent's scope" },
  ];
  if (running > 0) out.push({ key: 'running', label: `▶ ${running} running`, tone: 'ok', title: 'Agents running a turn right now' });
  if (narrowed && hidden > 0) out.push({ key: 'hidden', label: `${hidden} hidden by filter`, tone: 'muted', title: 'Agents on this machine the current filter hides' });
  return out;
}

/** "unknown — machine not reachable" → { head: 'unknown', reason: 'machine not reachable' }:
 * the Overview rows spell an unknown/unavailable/no-session value as "<state> — <why>";
 * the state becomes the badge, the why stays beside it in full. */
export function splitReason(value) {
  const s = value == null ? '' : String(value);
  const i = s.indexOf(' — ');
  if (i <= 0) return { head: s, reason: null };
  return { head: s.slice(0, i), reason: s.slice(i + 3) };
}

export const CLAIMED_REASON = {
  'human-active': 'claimed: the Operator worked on this branch recently',
  pinned: 'claimed: pinned as the Operator\'s',
  'unassigned-branch': 'on a branch nobody assigned — the arch must name it in a send',
};

/** The agent detail's branch state. */
export function branchBadges(a) {
  const known = !!a.branch && a.branch !== 'unknown';
  const out = [];
  if (a.onDefault) out.push({ key: 'state', label: 'on its default branch — free to be given work', tone: 'ok' });
  else if (known) out.push({ key: 'state', label: 'claimed on a feature branch', tone: 'warn' });
  else out.push({ key: 'state', label: 'branch unknown', tone: 'unknown' });
  if (a.dirty) out.push({ key: 'dirty', label: 'uncommitted changes', tone: 'warn' });
  return out;
}

/** The agent detail's activity / availability / scope facts, one badge each. */
export function agentDetailBadges(a, { runningFor = '' } = {}) {
  const out = [];
  if (a.runningSince) out.push({ key: 'run', label: `▶ running${runningFor ? ` for ${runningFor}` : ''}`, tone: 'ok' });
  else out.push({ key: 'run', label: 'idle', tone: 'muted' });
  out.push({ key: 'actor', label: `last actor ${a.lastActor || 'none'}`, tone: 'muted' });
  const av = a.availability;
  out.push({
    key: 'availability',
    label: av || 'availability unknown',
    tone: av === 'available' ? 'ok' : av === 'claimed' || av === 'busy' ? 'warn' : av ? 'muted' : 'unknown',
    title: `availability: ${av || 'unknown'}`,
  });
  if (a.claimedReason) {
    out.push({ key: 'claimedReason', label: CLAIMED_REASON[a.claimedReason] || a.claimedReason, tone: av === 'claimed' ? 'warn' : 'muted', data: { claimedReason: a.claimedReason } });
  }
  if (a.adopted) out.push({ key: 'adopted', label: 'handed to the arch', tone: 'accent' });
  if (a.pinned) out.push({ key: 'pinned', label: '📌 pinned as the Operator\'s', tone: 'accent' });
  out.push(a.managed
    ? { key: 'managed', label: '🏛 in the arch scope', tone: 'accent' }
    : { key: 'managed', label: 'not in the arch scope', tone: 'muted' });
  if (a.docked) out.push({ key: 'docked', label: 'has a dock', tone: 'muted' });
  if (a.goal) out.push({ key: 'goal', label: `driven by arch goal ${a.goal.id}${a.goal.name ? ` (${a.goal.name})` : ''}`, tone: 'ok', data: { drivenByGoal: a.goal.id } });
  return out;
}
