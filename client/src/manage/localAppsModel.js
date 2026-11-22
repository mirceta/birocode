// The Management dashboard's Local apps tab (fleet task f88f97fe, openspec local-apps-autostart-sentry): pure
// helpers over GET /api/local-apps/autostart/fleet — one row per registered local app per machine, its autostart
// entry and the sentry's state. Node-tested.

/** Every app of every machine, flat, with its machine on the row. Harness-served apps (Understanding, Goal, …) are
 * always on and cannot be flagged, so they are left out unless asked for. */
export function flatRows(machines, { includeHarness = false } = {}) {
  const out = [];
  for (const m of machines || []) {
    for (const r of m?.overview?.rows || []) {
      if (!includeHarness && r.kind === 'harness') continue;
      out.push({ ...r, machine: m.machine, self: !!m.self, reachable: !!m.reachable });
    }
  }
  return out;
}

/** How many harness-served (always-on) apps a machine has — named in one line instead of a row each. */
export function harnessCount(machine) {
  return (machine?.overview?.rows || []).filter((r) => r.kind === 'harness').length;
}

export const flagged = (r) => !!r?.flag?.autostart;

/** The badge tone of a state: up/running = ok, starting/unknown = wait, down = warn, failing = bad. */
export function tone(state) {
  if (state === 'up' || state === 'running' || state === 'always-on') return 'ok';
  if (state === 'failing') return 'bad';
  if (state === 'down') return 'warn';
  if (state === 'starting' || state === 'unknown') return 'wait';
  return 'off';
}

/** Flagged apps the Operator should look at (the tab's red badge): down or failing. */
export function attention(machines) {
  return flatRows(machines).filter((r) => flagged(r) && (r.state === 'down' || r.state === 'failing')).length;
}

export function summary(machines) {
  const rows = flatRows(machines).filter(flagged);
  const n = (s) => rows.filter((r) => r.state === s).length;
  return { flagged: rows.length, up: n('up'), starting: n('starting'), down: n('down'), failing: n('failing'), unknown: n('unknown') };
}

/** Only flagged / a free-text match on machine, agent, app, port or command. */
export function filterRows(rows, { flaggedOnly = false, q = '' } = {}) {
  const needle = String(q || '').trim().toLowerCase();
  return rows.filter((r) => (!flaggedOnly || flagged(r))
    && (!needle || [r.machine, r.repo, r.appId, r.name, String(r.port || ''), r.startCommand || ''].some((s) => String(s).toLowerCase().includes(needle))));
}

/** Can this app be flagged? Harness-served apps are always on; a repo app needs a start command (its own or discovered). */
export function canAutostart(r, draftCommand) {
  if (r?.kind === 'harness') return { ok: false, why: 'served by the harness itself — always on' };
  if (!(r?.startCommand || String(draftCommand || '').trim())) return { ok: false, why: 'no start command — type one in the Start command field (or run Discover on the repo)' };
  return { ok: true, why: '' };
}

/** The PUT /flag body: the row's current entry with a change applied. */
export function flagBody(row, patch = {}) {
  const f = row?.flag || {};
  const pick = (k, d) => (patch[k] !== undefined ? patch[k] : f[k] !== undefined && f[k] !== null ? f[k] : d);
  const num = (v, d) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? d : Number(v));
  return {
    machine: row.self ? 'self' : row.machine,
    repoId: row.repoId,
    appId: row.appId,
    autostart: !!pick('autostart', false),
    healthUrl: pick('healthUrl', null) || null,
    expectStatus: num(pick('expectStatus', null), null),
    order: num(pick('order', 0), 0),
    delaySec: num(pick('delaySec', 0), 0),
    // The entry's own start command only: the discovered one stays where it is.
    startCommand: (row.startSource === 'entry' || patch.startCommand !== undefined) ? (pick('startCommand', null) || null) : null,
    folder: pick('folder', null) || null,
  };
}

/** "3 min ago" / "just now" / "—". */
export function ago(ms, now = Date.now()) {
  if (!ms) return '—';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s} s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}
