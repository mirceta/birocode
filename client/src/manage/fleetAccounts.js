// Fleet Status "By plan / accounts" (openspec fleet-accounts-subtab): the Overview's
// per-machine Claude usage re-aggregated BY ACCOUNT. Pure, framework-free, unit-tested
// under `node --test`. The inputs are exactly what the Overview already reads on the one
// fleet poll — `machines[].overview.claude` — plus the hub's `accountsLastSeen` list, so
// an account no machine uses any more still renders with the state it was last seen in.
// The usage rows come from the SAME builder the Overview uses (usageRows), so a meter here
// can never disagree with the meter on the machine's own card.
import { UNKNOWN, agoLabel, usageRows } from './fleetStatusTabs.js';

/** The account key: trimmed, case-folded — the hub keys its last-seen list the same way. */
export function accountKey(account) {
  return (account || '').trim().toLowerCase();
}

function stampOf(claude, overview) {
  const f = claude?.usage?.fetchedAt ? Date.parse(claude.usage.fetchedAt) : NaN;
  if (Number.isFinite(f)) return f;
  return typeof overview?.capturedAt === 'number' ? overview.capturedAt : 0;
}

/**
 * One entry per Claude account used anywhere in the fleet, live ones first, then the
 * accounts only the hub's last-seen memory knows (stale). Each entry:
 *   { key, account, plan, live, stale, machines: [{ machine, sourceId, self, reachable }],
 *     capturedAt, lastSeenAt, rows: [...the Overview's usage rows + as-of/last-seen] }
 * A live entry's usage is the freshest capture among its machines. `machines` is the
 * (already filtered) fleet list; `lastSeen` is `data.accountsLastSeen` from the same poll.
 */
export function accountsView(machines, lastSeen, now = Date.now()) {
  const live = new Map();
  for (const m of machines || []) {
    const c = m?.overview?.claude;
    if (!c || !c.authenticated || !c.account) continue;
    const key = accountKey(c.account);
    const stamp = stampOf(c, m.overview);
    const where = { machine: m.machine, sourceId: m.sourceId, self: !!m.self, reachable: !!m.reachable };
    const cur = live.get(key);
    if (!cur) {
      live.set(key, { key, account: c.account.trim(), plan: c.plan || null, claude: c, overview: m.overview, stamp, machines: [where] });
      continue;
    }
    cur.machines.push(where);
    if (stamp > cur.stamp) { cur.claude = c; cur.overview = m.overview; cur.stamp = stamp; cur.plan = c.plan || cur.plan; }
    else if (!cur.plan && c.plan) cur.plan = c.plan;
  }

  const entries = [];
  for (const e of live.values()) {
    const hasCapture = typeof e.overview?.capturedAt === 'number';
    const rows = [
      ...usageRows(e.claude, hasCapture, now),
      { label: 'Overview as of', value: hasCapture ? (agoLabel(e.overview.capturedAt, now) || 'just now') : UNKNOWN.predates, tone: hasCapture ? 'muted' : 'unknown' },
    ];
    entries.push({ key: e.key, account: e.account, plan: e.plan, live: true, stale: false, machines: e.machines, capturedAt: hasCapture ? e.overview.capturedAt : null, lastSeenAt: now, rows });
  }
  entries.sort((a, b) => a.account.localeCompare(b.account));

  const remembered = [];
  for (const s of lastSeen || []) {
    const key = s.key || accountKey(s.account);
    if (!key || live.has(key)) continue;
    // Render the last-known state through the same rows, then say plainly it is stale.
    const claude = { installed: true, authenticated: true, account: s.account, plan: s.plan, usage: s.usage || null };
    const rows = [
      ...usageRows(claude, typeof s.capturedAt === 'number', now),
      { label: 'Last seen', value: `${agoLabel(s.lastSeenAt, now) || 'just now'} — no fleet machine uses this account now${(s.machines || []).length ? ` (was on ${(s.machines || []).join(', ')})` : ''}`, tone: 'unknown' },
    ];
    remembered.push({ key, account: s.account, plan: s.plan || null, live: false, stale: true, machines: (s.machines || []).map((name) => ({ machine: name, sourceId: null, self: false, reachable: false })), capturedAt: s.capturedAt ?? null, lastSeenAt: s.lastSeenAt, rows });
  }
  remembered.sort((a, b) => (b.lastSeenAt || 0) - (a.lastSeenAt || 0));
  return [...entries, ...remembered];
}

/** The one-line summary above the list: "2 accounts in use · 1 remembered". */
export function accountsSummary(entries) {
  const live = entries.filter((e) => e.live).length;
  const stale = entries.length - live;
  const parts = [`${live} account${live === 1 ? '' : 's'} in use`];
  if (stale) parts.push(`${stale} remembered (no longer used)`);
  return parts.join(' · ');
}
