// Pure descriptors for the Status tab (fleet task a25ee2de; the machine header became a
// facts grid in openspec fleet-status-compact-layout). The agent detail rows and the
// Overview values were bare "a · b · c" text. The badge functions return descriptors —
//   { key, label, tone, mono?, title?, data? }   tone ∈ ok | warn | bad | muted | unknown | accent | plain
// — and the components render them through ONE <StatusBadge>, so every state reads
// with the same shape and colour across the whole tab (and the header strip's Machine
// tile, which shares the Overview rows). Presentation only: every value is the fleet
// feed's own, nothing is dropped, and an unknown stays an honest "unknown — why".
// Framework-free so it unit-tests under `node --test`.
import { shortVersion, NA } from './fleetStatusTabs.js';

/** The machine header's facts (openspec fleet-status-compact-layout): ONE fixed column set
 * for every machine — status · build · hub sync · sends · upgrades · gate · may send · agents ·
 * managed · running (· hidden, when a filter narrows the list) — so the same field sits in
 * the same place down the whole list. A fact that does not apply (hub sync / may send on the
 * hub itself) is "—"; one an unreachable machine cannot report is "?"; nothing is omitted.
 * Values are the shortest honest word; the sentence the old pill carried is the `title`. */
export function machineFacts(m, { running = 0, hidden = 0, narrowed = false } = {}) {
  const r = m?.reachable !== false;
  const self = !!m?.self;
  const v = shortVersion(m?.version);
  const n = (m?.agents || []).length;
  const managed = typeof m?.managedCount === 'number' ? m.managedCount : null;
  const dash = (title) => ({ value: '—', tone: 'muted', title });
  const ask = (title) => ({ value: '?', tone: 'unknown', title: `${title} — unknown, the machine is not answering` });
  const yesNo = (b, title) => ({ value: b ? 'yes' : 'no', tone: b ? 'ok' : 'muted', title });
  const out = [
    { key: 'status', label: 'status', ...(r
      ? { value: 'ok', tone: 'ok', title: 'The hub reaches this machine' }
      : { value: m?.status || 'unreachable', tone: 'bad', title: `The hub could not reach this machine${m?.detail ? ` — ${m.detail}` : ''}` }) },
    { key: 'build', label: 'build', value: v, tone: v === NA ? 'unknown' : 'muted', mono: true, title: m?.version ? `harness build ${m.version}` : 'harness build unknown' },
    { key: 'sync', label: 'hub sync', ...(self ? dash('The hub itself — trivially in step') : !r ? ask('Hub sync') : m.behind
      ? { value: 'behind', tone: 'warn', title: 'This machine runs a different build than the hub' }
      : { value: 'same', tone: 'ok', title: 'This machine runs the same build as the hub' }) },
    { key: 'sends', label: 'sends', ...(r ? yesNo(!!m.acceptsSends, 'Whether this machine accepts tasks sent by the fleet') : ask('Accepts sends')) },
    { key: 'upgrades', label: 'upgrades', ...(r ? yesNo(!!m.acceptsUpgrades, 'Whether this machine accepts hub-driven build upgrades') : ask('Accepts upgrades')) },
    { key: 'gate', label: 'gate', ...(r
      ? { value: m.gateOpen ? 'open' : 'closed', tone: m.gateOpen ? 'ok' : 'warn', title: 'The operator gate on that machine (closed = its agents stay idle)' }
      : ask('Operator gate')) },
    { key: 'allow', label: 'may send', ...(self ? dash('Sends from here to here — not a thing') : r ? yesNo(!!m.allowSends, 'Whether this hub is allowed to send tasks to that machine') : ask('Sends allowed')) },
    { key: 'agents', label: 'agents', value: String(n), tone: 'muted', title: 'Repo agents on this machine' },
    managed === null
      ? { key: 'managed', label: 'managed', value: NA, tone: 'unknown', title: 'This build does not report the managed count' }
      : { key: 'managed', label: 'managed', value: String(managed), tone: managed > 0 ? 'accent' : 'muted', title: "In the arch agent's scope" },
    { key: 'running', label: 'running', value: String(running), tone: running > 0 ? 'ok' : 'muted', title: 'Agents running a turn right now' },
  ];
  if (narrowed) out.push({ key: 'hidden', label: 'hidden', value: String(hidden), tone: hidden > 0 ? 'warn' : 'muted', title: 'Agents on this machine the current filter hides' });
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
  // Branch facts only — occupancy is the Operator's call (openspec manual-agent-occupancy).
  if (a.onDefault) out.push({ key: 'state', label: 'on its default branch', tone: 'ok' });
  else if (known) out.push({ key: 'state', label: 'on a feature branch', tone: 'warn' });
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
    out.push({ key: 'claimedReason', label: CLAIMED_REASON[a.claimedReason] || (a.claimedReason === 'operator-occupied' ? 'marked occupied by the Operator' : a.claimedReason), tone: av === 'claimed' ? 'warn' : 'muted', data: { claimedReason: a.claimedReason } });
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
