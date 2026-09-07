// Pure helpers for the Fleet Status per-machine tabs (openspec fleet-status-panels,
// completed by openspec fleet-overview-honest). Kept framework-free so they unit-test
// under `node --test` (no jsdom): the tab selection (URL param ?fleetTab wins, else
// this browser's last choice, else agents) and the Overview field mapping — ONE
// mapping that both the Fleet Status Overview tab and the header strip's "Machine"
// tile render, from ONE record (the machine's overview, produced by the same provider
// that feeds its describe). A field the machine cannot report is said to be UNKNOWN
// with its reason — never a blank, never an error.

export const FLEET_TABS = ['agents', 'overview', 'scoreboard'];
export const FLEET_TAB_KEY = 'manageapp.fleetTab';
export const NA = 'n/a';

// The reasons a value is unknown; each renders as an explicit "unknown — …" cell.
export const UNKNOWN = {
  unreachable: 'unknown — machine not reachable',
  oldBuild: "unknown — this machine's build reports no overview",
  predates: "unknown — this machine's build predates this field",
  cold: 'unknown — not probed yet',
  noSession: 'no session — sign in to see usage',
};

// The active tab: ?fleetTab= in the URL wins (so the living-room screen can be pinned
// to one), else the per-browser saved choice, else 'agents'. `search` is a query string
// like "?fleetTab=overview"; `get` reads persisted state (key -> string|null).
export function readFleetTab(search, get) {
  try {
    const q = new URLSearchParams(search || '').get('fleetTab');
    if (FLEET_TABS.includes(q)) return q;
    const saved = get ? get(FLEET_TAB_KEY) : null;
    return FLEET_TABS.includes(saved) ? saved : 'agents';
  } catch {
    return 'agents';
  }
}

// Short commit from an informational version string "1.0.0+<sha>" → "<7 hex>".
export function shortVersion(v) {
  const m = /\+([0-9a-f]{7})/.exec(v || '');
  return m ? m[1] : v || NA;
}

export function offsetLabel(min) {
  if (typeof min !== 'number') return NA;
  const sign = min < 0 ? '-' : '+';
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

/** The host's wall clock ("14:07") and date ("Sun 7 Sep 2026") for a unix-ms instant
 * in a zone given by its UTC offset — no Intl zone lookup, so a peer's clock renders
 * the same on every browser. */
export function hostClock(unixMs, offsetMinutes) {
  if (typeof unixMs !== 'number' || !Number.isFinite(unixMs)) return null;
  const d = new Date(unixMs + (offsetMinutes || 0) * 60_000);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return { time: `${hh}:${mm}`, date: `${days[d.getUTCDay()]} ${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
}

/** "resets 15:50" (same day) / "resets Tue 15:50", or null when the timestamp is unusable. */
export function resetLabel(resetsAt, now = Date.now()) {
  if (!resetsAt) return null;
  const d = new Date(resetsAt);
  if (Number.isNaN(d.getTime())) return null;
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay = now + 24 * 60 * 60 * 1000 > d.getTime();
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return sameDay ? `resets ${time}` : `resets ${days[d.getDay()]} ${time}`;
}

/** "12 s ago" / "3 min ago" / "2 h ago" for a unix-ms stamp; null without one. */
export function agoLabel(unixMs, now = Date.now()) {
  if (typeof unixMs !== 'number' || !Number.isFinite(unixMs)) return null;
  const s = Math.max(0, Math.round((now - unixMs) / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

function accountLine(a) {
  if (!a.installed) return 'not installed';
  if (!a.authenticated) return 'not signed in';
  return a.account || 'signed in';
}

const unknown = (reason) => ({ value: reason, tone: 'unknown' });
const yesNo = (b) => (b ? { value: 'yes', tone: 'ok' } : { value: 'no', tone: 'muted' });

/** One usage window → a meter row: percent, reset time, severity tone. */
function usageMeterRow(label, entry) {
  if (!entry || typeof entry.percent !== 'number') return { label, ...unknown(UNKNOWN.predates) };
  const reset = resetLabel(entry.resetsAt);
  const pct = Math.round(entry.percent);
  const tone = entry.severity && entry.severity !== 'normal' ? 'warn' : pct >= 90 ? 'bad' : 'ok';
  return { label, kind: 'meter', percent: Math.max(0, Math.min(100, entry.percent)), value: `${pct}%${reset ? ` · ${reset}` : ''}`, tone };
}

// The Overview rows for one machine, grouped for rendering. `overview` is
// machine.overview (null on an old or unreachable peer → every overview field says why
// it is unknown); `machine` carries the version, name, reachability, operator gate and
// fleet posture that ride the fleet object. Each row: { label, value, tone?, kind?,
// percent? } — tone ∈ ok | warn | bad | muted | unknown; kind 'meter' draws a bar.
export function overviewGroups(overview, machine, now = Date.now()) {
  const m = machine || {};
  const reachable = m.self ? true : m.reachable !== false;
  const o = overview || null;
  // Why the overview-only fields are unknown, when they are.
  const missing = !o ? (reachable ? UNKNOWN.oldBuild : `${UNKNOWN.unreachable}${m.status ? ` (${m.status}${m.detail ? `: ${m.detail}` : ''})` : ''}`) : null;
  const sub = (x) => (x ? null : (missing || UNKNOWN.cold));
  const claude = o?.claude || null;
  const github = o?.github || null;
  const host = o?.host || null;
  const admin = o?.admin || null;
  const hasCapture = typeof o?.capturedAt === 'number';

  const harness = [
    { label: 'Version', value: shortVersion(m.version) },
    { label: 'Build', value: m.version || NA },
    { label: 'Reachable', value: m.self ? 'this machine' : reachable ? 'yes' : `no — ${m.status || 'unknown'}${m.detail ? `: ${m.detail}` : ''}`, tone: m.self || reachable ? 'ok' : 'bad' },
    { label: 'Overview as of', value: hasCapture ? (agoLabel(o.capturedAt, now) || NA) : o ? UNKNOWN.predates : (missing || NA), tone: hasCapture ? 'muted' : 'unknown' },
  ];

  const clock = host ? hostClock(host.nowUnixMs, host.utcOffsetMinutes) : null;
  const hostRows = [
    { label: 'Machine', value: m.machine || NA },
    { label: 'Host time', ...(clock ? { value: `${clock.time} ${offsetLabel(host.utcOffsetMinutes)}` } : host ? unknown(UNKNOWN.predates) : unknown(sub(host))) },
    { label: 'Date', ...(clock ? { value: clock.date } : host ? unknown(UNKNOWN.predates) : unknown(sub(host))) },
    { label: 'Timezone', ...(host ? { value: `${host.timeZoneId || NA} · ${offsetLabel(host.utcOffsetMinutes)}` } : unknown(sub(host))) },
    // "Host active" = the operator gate that already rides the fleet object.
    { label: 'Host active', ...(machine ? yesNo(!!m.gateOpen) : unknown(UNKNOWN.oldBuild)) },
    { label: 'Admin active', ...(admin ? (admin.supported ? { value: admin.state || NA, tone: admin.state === 'active' ? 'ok' : admin.state === 'reboot_pending' ? 'warn' : 'muted' } : { value: 'unsupported', tone: 'muted' }) : unknown(sub(admin))) },
    { label: 'UAC policy set', ...(admin ? (typeof admin.registrySet === 'boolean' ? yesNo(admin.registrySet) : unknown(UNKNOWN.predates)) : unknown(sub(admin))) },
    { label: 'Harness elevated', ...(admin ? (typeof admin.elevated === 'boolean' ? yesNo(admin.elevated) : unknown(UNKNOWN.predates)) : unknown(sub(admin))) },
  ];

  const accounts = [
    { label: 'GitHub', ...(github ? { value: accountLine(github), tone: github.authenticated ? 'ok' : 'warn' } : unknown(sub(github))) },
    { label: 'GitHub host', ...(github ? { value: github.authenticated ? (github.host || NA) : '—', tone: 'muted' } : unknown(sub(github))) },
    { label: 'Claude', ...(claude ? { value: accountLine(claude), tone: claude.authenticated ? 'ok' : 'warn' } : unknown(sub(claude))) },
    { label: 'Claude plan', ...(claude ? { value: claude.authenticated ? (claude.plan || NA) : '—', tone: 'muted' } : unknown(sub(claude))) },
  ];

  // Claude plan usage — the strip's 5-hour / weekly / per-model meters, per machine.
  let usage;
  if (!claude) usage = [{ label: '5-hour window', ...unknown(sub(claude)) }, { label: 'Weekly quota', ...unknown(sub(claude)) }];
  else if (!claude.authenticated) usage = [{ label: '5-hour window', value: UNKNOWN.noSession, tone: 'muted' }, { label: 'Weekly quota', value: UNKNOWN.noSession, tone: 'muted' }];
  else if (!claude.usage) {
    const why = hasCapture ? UNKNOWN.cold : UNKNOWN.predates;
    usage = [{ label: '5-hour window', ...unknown(why) }, { label: 'Weekly quota', ...unknown(why) }];
  } else if (!claude.usage.available) {
    const why = `unavailable — ${claude.usage.error || 'usage probe failed'}`;
    usage = [{ label: '5-hour window', value: why, tone: 'bad' }, { label: 'Weekly quota', value: why, tone: 'bad' }];
  } else {
    const u = claude.usage;
    usage = [
      usageMeterRow('5-hour window', u.session),
      usageMeterRow('Weekly quota', u.weekly),
      ...(u.scopedWeekly || []).map((s) => usageMeterRow(`Weekly · ${s.label || 'model'}`, s)),
      { label: 'Usage freshness', value: u.stale ? 'may be outdated (last fetch failed)' : u.fetchedAt ? `fetched ${agoLabel(Date.parse(u.fetchedAt), now) || 'recently'}` : 'fresh', tone: u.stale ? 'warn' : 'muted' },
    ];
  }

  const fleet = [
    { label: 'Agents', value: typeof m.agentCount === 'number' ? String(m.agentCount) : Array.isArray(m.agents) ? String(m.agents.length) : NA, tone: 'muted' },
    { label: 'Managed by the arch', value: typeof m.managedCount === 'number' ? String(m.managedCount) : NA, tone: 'muted' },
    { label: 'Accepts fleet sends', ...(machine ? yesNo(!!m.acceptsSends) : unknown(UNKNOWN.oldBuild)) },
    { label: 'Accepts fleet upgrades', ...(machine ? yesNo(!!m.acceptsUpgrades) : unknown(UNKNOWN.oldBuild)) },
    { label: 'Sends allowed from here', ...(m.self ? { value: '—', tone: 'muted' } : machine ? yesNo(!!m.allowSends) : unknown(UNKNOWN.oldBuild)) },
    { label: 'Stale tasks', value: typeof m.staleTasks === 'number' ? String(m.staleTasks) : m.staleTasks == null ? '0' : String(m.staleTasks), tone: m.staleTasks ? 'warn' : 'muted' },
  ];

  return [
    { key: 'harness', title: 'Harness', rows: harness },
    { key: 'host', title: 'Host', rows: hostRows },
    { key: 'accounts', title: 'Accounts', rows: accounts },
    { key: 'usage', title: 'Claude plan usage', rows: usage },
    { key: 'fleet', title: 'Fleet posture', rows: fleet },
  ];
}

/** Every label the groups can produce (for the parity test and the tile's summary). */
export function overviewLabels(groups) {
  return groups.flatMap((g) => g.rows.map((r) => r.label));
}

// The audit made executable (openspec fleet-overview-honest): every fact the header
// status strip shows, and the Overview row that carries it. The Scoreboard section is
// the one deliberate exception — it is the Fleet Status Scoreboard tab, fetched on
// demand, never on the fleet poll.
export const STRIP_FIELDS = [
  ['GitHub chip · installed / authenticated / account', 'GitHub'],
  ['GitHub chip · host', 'GitHub host'],
  ['Claude chip · installed / logged in / account', 'Claude'],
  ['Claude chip · plan', 'Claude plan'],
  ['Claude chip · 5h usage meter', '5-hour window'],
  ['Claude chip · weekly usage meter', 'Weekly quota'],
  ['Claude chip · usage stale / unavailable line', 'Usage freshness'],
  ['Host clock · time + offset', 'Host time'],
  ['Host clock · date', 'Date'],
  ['Host clock · timezone', 'Timezone'],
  ['Admin tile · state', 'Admin active'],
  ['Admin tile · UAC policy set (behind the state)', 'UAC policy set'],
  ['Admin tile · harness elevated (behind the state)', 'Harness elevated'],
  ['Strip summary · harness build', 'Build'],
];
export const STRIP_EXCEPTIONS = [['Scoreboard (prompts, peak, longest, work, cost, activity, agents)', 'Fleet Status → Scoreboard tab (on demand)']];

/** A one-line summary for the collapsed strip tile: "Max · 5h 23% · week 61% · UTC+2". */
export function overviewSummary(groups) {
  const flat = Object.fromEntries(groups.flatMap((g) => g.rows).map((r) => [r.label, r]));
  const parts = [];
  if (flat['Claude plan']?.value && flat['Claude plan'].value !== '—') parts.push(flat['Claude plan'].value);
  const five = flat['5-hour window'];
  const week = flat['Weekly quota'];
  if (five?.kind === 'meter') parts.push(`5h ${Math.round(five.percent)}%`);
  else if (five?.tone === 'unknown' || five?.tone === 'bad') parts.push('usage ?');
  if (week?.kind === 'meter') parts.push(`week ${Math.round(week.percent)}%`);
  if (flat['Host time']?.value && !/unknown/.test(flat['Host time'].value)) parts.push(flat['Host time'].value);
  if (flat['Admin active']?.value) parts.push(`admin ${flat['Admin active'].value}`);
  return parts.join(' · ');
}
