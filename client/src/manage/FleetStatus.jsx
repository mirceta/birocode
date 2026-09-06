import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api/client';

// The Status tab (openspec fleet-status-tab): every repo agent on the whole
// fleet, machine by machine, in the language of the dashboard's dock strip —
// a chip per agent with the running dot, the name and the branch — plus the
// fleet posture the Arch tab's Fleet card knows (build, opt-ins, scope). The
// answer is one hub endpoint (GET /api/arch/fleet/status); the hub relays the
// peers' cached describes, so the page never talks to another machine.
//
// Filters (openspec fleet-status-filters): with dozens of agents the page needs
// a way to narrow the wall. A filter bar under the head holds a search box
// (name, branch, remote URL, machine), one chip per machine (multi-select), and
// the state chips (all · on main · not on main · running · managed). Counts
// follow the current machine + search selection; a machine with nothing left
// collapses to its header line; the whole selection persists per device.

const POLL_MS = 5000;
const FILTERS = [
  ['all', 'All', 'Every agent'],
  ['main', 'on main', 'On its default branch — free to be given work'],
  ['feature', 'not on main', 'On a feature branch — claimed by someone'],
  ['running', 'running', 'A turn is running right now'],
  ['managed', '🏛 managed', 'In the arch agent\'s scope'],
];
const PERSIST_KEY = 'manageapp.fleetFilters';

function ago(ms) {
  if (!ms || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

function shortVersion(v) {
  const m = /\+([0-9a-f]{7})/.exec(v || '');
  return m ? m[1] : v || '?';
}

function matches(a, filter) {
  if (filter === 'running') return !!a.runningSince;
  if (filter === 'main') return a.onDefault;
  if (filter === 'feature') return !a.onDefault && a.branch && a.branch !== 'unknown';
  if (filter === 'managed') return !!a.managed;
  return true;
}

function matchesQuery(a, machineLabel, q) {
  if (!q) return true;
  const hay = `${a.name || ''} ${a.branch || ''} ${a.remoteUrl || ''} ${machineLabel || ''}`.toLowerCase();
  return q.split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
}

function readPersisted() {
  try {
    const v = JSON.parse(localStorage.getItem(PERSIST_KEY) || 'null');
    if (!v || typeof v !== 'object') return { filter: 'all', machines: [], q: '' };
    return {
      filter: FILTERS.some(([k]) => k === v.filter) ? v.filter : 'all',
      machines: Array.isArray(v.machines) ? v.machines.filter((x) => typeof x === 'string') : [],
      q: typeof v.q === 'string' ? v.q : '',
    };
  } catch {
    return { filter: 'all', machines: [], q: '' };
  }
}

function persist(state) {
  try { localStorage.setItem(PERSIST_KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

function AgentChip({ a, self, root, open, onToggle }) {
  const running = !!a.runningSince;
  const known = a.branch && a.branch !== 'unknown';
  const cls = ['fs__chip'];
  if (running) cls.push('fs__chip--running');
  if (a.onDefault) cls.push('fs__chip--free');
  else if (known) cls.push('fs__chip--claimed');
  if (open) cls.push('fs__chip--open');
  const title = [
    a.name,
    known ? `on ${a.branch}${a.onDefault ? ' (default — free)' : ' (claimed)'}` : 'branch unknown',
    running ? `running ${ago(Date.now() - a.runningSince)}` : `idle · last actor ${a.lastActor || 'none'}`,
    a.managed ? 'in the arch scope' : null,
  ].filter(Boolean).join(' · ');
  return (
    <button type="button" className={cls.join(' ')} title={title} onClick={onToggle} data-agent={a.key} data-on-default={a.onDefault} data-running={running}>
      <span className={`fs__dot${running ? ' fs__dot--running' : a.onDefault ? ' fs__dot--free' : known ? ' fs__dot--claimed' : ''}`} aria-hidden="true" />
      <span className="fs__chip-text">
        <span className="fs__chip-name" data-handle={a.handle || ''}>{a.managed ? '🏛 ' : ''}{a.handle || a.name}</span>
        <span className="fs__chip-branch"><span aria-hidden="true">⎇</span> {known ? a.branch : '?'}{a.dirty ? ' ·' : ''}{running ? ` · ${ago(Date.now() - a.runningSince)}` : ''}</span>
      </span>
    </button>
  );
}

function AgentDetail({ a, self, root }) {
  const running = !!a.runningSince;
  const openDock = () => {
    try { localStorage.setItem('claudeweb_dock_active', a.tabId); } catch { /* ignore */ }
    window.top.location.href = `${root}/studio`;
  };
  return (
    <div className="fs__detail" data-detail={a.key}>
      <div className="fs__detail-row"><b>{a.handle || a.name}</b>{a.handle && a.handle.split('/').pop() !== a.name ? <span className="fs__dim"> · {a.name}</span> : null}{a.remoteUrl ? <span className="fs__mono fs__dim"> · {a.remoteUrl}</span> : null}</div>
      <div className="fs__detail-row">
        branch <code>{a.branch || '?'}</code> (default <code>{a.defaultBranch || '?'}</code>) ·{' '}
        {a.onDefault ? <span className="fs__ok">on its default branch — free to be given work</span> : a.branch && a.branch !== 'unknown' ? <span className="fs__warn">claimed on a feature branch</span> : <span className="fs__dim">branch unknown</span>}
        {a.dirty ? ' · uncommitted changes' : ''}
      </div>
      <div className="fs__detail-row">
        {running ? <span className="fs__ok">▶ running for {ago(Date.now() - a.runningSince)}</span> : 'idle'} · last actor {a.lastActor || 'none'}
        {' · '}availability <code>{a.availability}</code>
        {a.managed ? ' · 🏛 in the arch scope' : ' · not in the arch scope'}
        {a.docked ? ' · has a dock' : ''}
      </div>
      {self && a.tabId && (
        <div className="fs__detail-row"><button type="button" className="fs__btn" onClick={openDock}>open dock ↗</button></div>
      )}
    </div>
  );
}

export default function FleetStatus({ root = '' }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [persisted] = useState(readPersisted);
  const [filter, setFilterState] = useState(persisted.filter);
  const [machineSel, setMachineSel] = useState(persisted.machines); // sourceIds; [] = every machine
  const [q, setQ] = useState(persisted.q);
  const [open, setOpen] = useState(null);
  const [, setTick] = useState(0);

  useEffect(() => { persist({ filter, machines: machineSel, q }); }, [filter, machineSel, q]);

  const load = useCallback(async () => {
    try {
      const d = await apiGet('/arch/fleet/status');
      setData(d);
      setError('');
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    const tick = setInterval(() => setTick((n) => n + 1), 1000);
    return () => { clearInterval(t); clearInterval(tick); };
  }, [load]);

  const machines = data?.machines || [];
  const query = q.trim().toLowerCase();
  const machineOn = useCallback((m) => machineSel.length === 0 || machineSel.includes(m.sourceId), [machineSel]);
  const toggleMachine = (sourceId) => {
    setMachineSel((prev) => (prev.includes(sourceId) ? prev.filter((x) => x !== sourceId) : [...prev, sourceId]));
  };
  const narrowed = filter !== 'all' || machineSel.length > 0 || query.length > 0;
  const clearAll = () => { setFilterState('all'); setMachineSel([]); setQ(''); };

  // Agents that survive the machine selection + the search; the state chips count over these.
  const scoped = useMemo(() => machines.map((m) => ({
    m,
    agents: machineOn(m) ? (m.agents || []).filter((a) => matchesQuery(a, m.machine, query)) : [],
  })), [machines, machineOn, query]);
  const totals = scoped.reduce((acc, { agents }) => {
    for (const a of agents) {
      acc.all += 1;
      if (a.runningSince) acc.running += 1;
      if (a.onDefault) acc.main += 1;
      else if (a.branch && a.branch !== 'unknown') acc.feature += 1;
      if (a.managed) acc.managed += 1;
    }
    return acc;
  }, { all: 0, running: 0, main: 0, feature: 0, managed: 0 });
  const shown = scoped.reduce((n, { agents }) => n + agents.filter((a) => matches(a, filter)).length, 0);
  const total = machines.reduce((n, m) => n + (m.agents || []).length, 0);

  return (
    <div className="fs" data-fleet-status>
      <div className="fs__head">
        <span className="fs__title">Fleet status</span>
        <span className="fs__dim">every repo agent on every machine · hub build {shortVersion(data?.hubVersion)}</span>
        <span className="fs__dim fs__shown" data-shown={shown} data-total={total}>{narrowed ? `${shown} of ${total} agents` : `${total} agents`}</span>
      </div>

      <div className="fs__bar" role="search" aria-label="Filter agents" data-filter-bar>
        <input
          className="fs__search"
          type="search"
          placeholder="Search name, branch, URL, machine…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search agents"
          data-search
        />
        <div className="fs__filters" role="group" aria-label="Machines">
          <button type="button" className={`fs__filter${machineSel.length === 0 ? ' fs__filter--on' : ''}`} aria-pressed={machineSel.length === 0} title="Every machine" data-machine-filter="all" onClick={() => setMachineSel([])}>
            all machines <span className="fs__count">{machines.length}</span>
          </button>
          {machines.map((m) => (
            <button
              key={m.sourceId}
              type="button"
              className={`fs__filter${machineSel.includes(m.sourceId) ? ' fs__filter--on' : ''}${m.reachable ? '' : ' fs__filter--dark'}`}
              aria-pressed={machineSel.includes(m.sourceId)}
              title={`${m.machine}${m.self ? ' (this machine)' : ''}${m.reachable ? '' : ' — not answering'} · click to toggle`}
              data-machine-filter={m.sourceId}
              onClick={() => toggleMachine(m.sourceId)}
            >
              {m.self ? '⌂ ' : ''}{m.machine} <span className="fs__count">{(m.agents || []).length}</span>
            </button>
          ))}
        </div>
        <div className="fs__filters" role="group" aria-label="Show">
          {FILTERS.map(([k, label, title]) => (
            <button key={k} type="button" className={`fs__filter${filter === k ? ' fs__filter--on' : ''}`} title={title} aria-pressed={filter === k} data-filter={k} onClick={() => setFilterState(k)}>
              {label} <span className="fs__count">{totals[k]}</span>
            </button>
          ))}
        </div>
        {narrowed && (
          <button type="button" className="fs__clear" onClick={clearAll} title="Show every agent again" data-clear-filters>× clear</button>
        )}
      </div>

      {!data && !error && <div className="fs__note" data-loading>Loading the fleet status…</div>}
      {error && <div className="fs__note fs__note--err">{error}</div>}
      {data && total > 0 && shown === 0 && <div className="fs__note" data-no-match>Nothing matches — clear a filter or the search.</div>}
      {scoped.map(({ m, agents: inScope }) => {
        if (!machineOn(m)) return null;
        const agents = inScope.filter((a) => matches(a, filter));
        const running = (m.agents || []).filter((a) => a.runningSince).length;
        const hidden = (m.agents || []).length - agents.length;
        const collapsed = narrowed && agents.length === 0 && (m.agents || []).length > 0;
        return (
          <section key={m.sourceId} className={`fs__machine${m.self ? ' fs__machine--self' : ''}${m.reachable ? '' : ' fs__machine--dark'}${collapsed ? ' fs__machine--collapsed' : ''}`} data-machine={m.machine} data-collapsed={collapsed || undefined}>
            <div className="fs__mh">
              <span className={`fs__mdot${m.reachable ? ' fs__mdot--ok' : ''}`} aria-hidden="true" />
              <span className="fs__mlabel">{m.machine}</span>
              {m.self && <span className="fs__tag">self</span>}
              {!m.self && m.address && <span className="fs__mono fs__dim">{m.address}</span>}
              <span className="fs__dim">
                {m.reachable ? `build ${shortVersion(m.version)}${m.behind ? ' · behind the hub' : ''}` : `${m.status}${m.detail ? ` · ${m.detail}` : ''}`}
                {m.reachable ? ` · ${m.acceptsSends ? 'accepts sends' : 'no sends'} · ${m.acceptsUpgrades ? 'accepts upgrades' : 'no upgrades'}${m.gateOpen ? '' : ' · gate closed'}` : ''}
                {!m.self && m.reachable ? ` · ${m.allowSends ? 'sends allowed' : 'sends not allowed'}` : ''}
              </span>
              <span className="fs__mmeta">
                {(m.agents || []).length} agent{(m.agents || []).length === 1 ? '' : 's'} · 🏛 {m.managedCount} managed{running ? ` · ▶ ${running} running` : ''}
                {narrowed && hidden > 0 ? ` · ${hidden} hidden by filter` : ''}
              </span>
            </div>
            {(m.staleTasks || []).length > 0 && (
              <div className="fs__stale" data-stale-tasks>
                {(m.staleTasks || []).map((t) => (
                  <div key={t.id} className="fs__stale-row" title={t.title}>
                    ⏱ stale: {t.reason === 'unpushed branch' ? `unpushed branch on ${m.machine}` : 'PR open'}
                    {t.branch ? <span className="fs__mono"> ⎇ {t.branch}</span> : null}
                    {' — '}{t.title}
                  </div>
                ))}
              </div>
            )}
            {collapsed ? null : agents.length === 0
              ? <div className="fs__none">{(m.agents || []).length === 0 ? (m.reachable ? 'no repo agents (no docks, nothing in the arch scope)' : 'nothing known — the machine has not answered') : 'nothing matches this filter'}</div>
              : (
                <div className="fs__strip">
                  {agents.map((a) => (
                    <AgentChip key={a.key} a={a} self={m.self} root={root} open={open === a.key} onToggle={() => setOpen(open === a.key ? null : a.key)} />
                  ))}
                </div>
              )}
            {agents.filter((a) => open === a.key).map((a) => <AgentDetail key={a.key} a={a} self={m.self} root={root} />)}
          </section>
        );
      })}
      <div className="fs__legend fs__dim">
        <span><span className="fs__dot fs__dot--free" aria-hidden="true" /> on its default branch — free</span>
        <span><span className="fs__dot fs__dot--claimed" aria-hidden="true" /> on a feature branch — claimed</span>
        <span><span className="fs__dot fs__dot--running" aria-hidden="true" /> running a turn</span>
        <span>🏛 in the arch agent's scope</span>
      </div>
    </div>
  );
}
