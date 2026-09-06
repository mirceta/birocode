// Pure helpers for the Fleet Status per-machine tabs (openspec fleet-status-panels).
// Kept framework-free so they unit-test under `node --test` (no jsdom): the tab
// selection (URL param ?fleetTab wins, else this browser's last choice, else agents)
// and the Overview field mapping (an older peer with no overview degrades every field
// to "n/a", never an error).

export const FLEET_TABS = ['agents', 'overview', 'scoreboard'];
export const FLEET_TAB_KEY = 'manageapp.fleetTab';
export const NA = 'n/a';

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

function offsetLabel(min) {
  if (typeof min !== 'number') return NA;
  const sign = min < 0 ? '-' : '+';
  const a = Math.abs(min);
  const h = Math.floor(a / 60);
  const m = a % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}

function accountLine(a) {
  if (!a) return NA;
  if (!a.installed) return 'not installed';
  if (!a.authenticated) return 'not signed in';
  return a.account || 'signed in';
}

// The Overview rows for one machine, grouped for rendering. `overview` is
// machine.overview (null on an old peer → every value NA); `machine` carries the
// version + name + operator gate that already ride the fleet object.
export function overviewGroups(overview, machine) {
  const o = overview || {};
  const claude = o.claude || null;
  const github = o.github || null;
  const host = o.host || null;
  const admin = o.admin || null;
  return [
    {
      key: 'harness',
      title: 'Harness',
      rows: [
        { label: 'Version', value: shortVersion(machine?.version) },
        { label: 'Build', value: machine?.version || NA },
      ],
    },
    {
      key: 'host',
      title: 'Host',
      rows: [
        { label: 'Machine', value: machine?.machine || NA },
        { label: 'Timezone', value: host ? `${host.timeZoneId || NA} · ${offsetLabel(host.utcOffsetMinutes)}` : NA },
        // "Host active" = the operator gate that already rides the fleet object.
        { label: 'Host active', value: machine ? (machine.gateOpen ? 'yes' : 'no') : NA },
        { label: 'Admin active', value: admin ? (admin.supported ? (admin.state || NA) : 'unsupported') : NA },
      ],
    },
    {
      key: 'accounts',
      title: 'Accounts',
      rows: [
        { label: 'GitHub', value: accountLine(github) },
        { label: 'GitHub host', value: github && github.authenticated ? (github.host || NA) : NA },
        { label: 'Claude', value: accountLine(claude) },
        { label: 'Claude plan', value: claude && claude.authenticated ? (claude.plan || NA) : NA },
      ],
    },
  ];
}
