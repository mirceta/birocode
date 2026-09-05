import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api/client';

// The Status tab (openspec fleet-status-tab): every repo agent on the whole
// fleet, machine by machine, in the language of the dashboard's dock strip —
// a chip per agent with the running dot, the name and the branch — plus the
// fleet posture the Arch tab's Fleet card knows (build, opt-ins, scope). The
// answer is one hub endpoint (GET /api/arch/fleet/status); the hub relays the
// peers' cached describes, so the page never talks to another machine.

const POLL_MS = 5000;
const FILTERS = [
  ['all', 'All', 'Every agent'],
  ['main', 'on main', 'On its default branch — free to be given work'],
  ['feature', 'not on main', 'On a feature branch — claimed by someone'],
  ['running', 'running', 'A turn is running right now'],
];

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
  return true;
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
        <span className="fs__chip-name">{a.managed ? '🏛 ' : ''}{a.name}</span>
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
      <div className="fs__detail-row"><b>{a.name}</b>{a.remoteUrl ? <span className="fs__mono fs__dim"> · {a.remoteUrl}</span> : null}</div>
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
  const [filter, setFilter] = useState('all');
  const [open, setOpen] = useState(null);
  const [, setTick] = useState(0);

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
  const totals = machines.reduce((acc, m) => {
    for (const a of m.agents || []) {
      acc.all += 1;
      if (a.runningSince) acc.running += 1;
      if (a.onDefault) acc.main += 1;
      else if (a.branch && a.branch !== 'unknown') acc.feature += 1;
    }
    return acc;
  }, { all: 0, running: 0, main: 0, feature: 0 });

  return (
    <div className="fs" data-fleet-status>
      <div className="fs__head">
        <span className="fs__title">Fleet status</span>
        <span className="fs__dim">every repo agent on every machine · hub build {shortVersion(data?.hubVersion)}</span>
        <div className="fs__filters" role="group" aria-label="Show">
          {FILTERS.map(([k, label, title]) => (
            <button key={k} type="button" className={`fs__filter${filter === k ? ' fs__filter--on' : ''}`} title={title} aria-pressed={filter === k} data-filter={k} onClick={() => setFilter(k)}>
              {label} <span className="fs__count">{totals[k]}</span>
            </button>
          ))}
        </div>
      </div>
      {!data && !error && <div className="fs__note" data-loading>Loading the fleet status…</div>}
      {error && <div className="fs__note fs__note--err">{error}</div>}
      {machines.map((m) => {
        const agents = (m.agents || []).filter((a) => matches(a, filter));
        const running = (m.agents || []).filter((a) => a.runningSince).length;
        return (
          <section key={m.sourceId} className={`fs__machine${m.self ? ' fs__machine--self' : ''}${m.reachable ? '' : ' fs__machine--dark'}`} data-machine={m.machine}>
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
              <span className="fs__mmeta">{(m.agents || []).length} agent{(m.agents || []).length === 1 ? '' : 's'} · 🏛 {m.managedCount} managed{running ? ` · ▶ ${running} running` : ''}</span>
            </div>
            {agents.length === 0
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
