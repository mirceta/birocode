import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../api/client';
import HandToArch from '../components/dashboard/HandToArch';
import FleetOverviewPanel from './FleetOverviewPanel';
import FleetAccountsPanel from './FleetAccountsPanel';
import FleetScoreboardTab from './FleetScoreboardTab';
import { harnessHref, agentWorkerHref, harnessRootFromLocation } from './harnessLink';
import { focusAgentTab } from '../components/shared/workerWindow';
import { FLEET_TABS, FLEET_TAB_KEY, readFleetTab } from './fleetStatusTabs';
import { useTaskColors, repoKey } from '../components/taskgraph/useTaskColors';
import AgentMark from '../components/taskgraph/AgentMark';
import AgentStatusDot, { agentDotState, workingBadgeClass } from '../components/shared/AgentStatusDot';
import { repoAgentLabel } from './agentLabel';
import StatusBadge, { StatusBadges } from './StatusBadge';
import { machineBadges, machineMeta, branchBadges, agentDetailBadges } from './statusBadges';
import { occupancyOf, splitByOccupancy, OCCUPANCY_FILTERS, normalizeFilter, matchesFilter, occupancyBadge, occupancyBody } from './occupancy';

// The per-machine view tabs (openspec fleet-status-panels): one selection shared by
// every machine card so a whole view (Agents / Overview / Scoreboard) is shown at once
// and nothing is crammed. Remembered per browser and mirrored to ?fleetTab= in the URL
// (same idiom as ManageApp's ?tab=), so a specific tab can be pinned on a wall screen.
const TAB_LABELS = { agents: 'Agents', overview: 'Overview', accounts: 'By plan / accounts', scoreboard: 'Scoreboard' };

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
// The state chips are occupancy-based (openspec manual-agent-occupancy): free / occupied is
// the Operator's setting when there is one, else the branch rule.
const FILTERS = OCCUPANCY_FILTERS;
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

const matches = matchesFilter;

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
      filter: normalizeFilter(v.filter),   // the old `on main` / `not on main` choice maps onto free / occupied
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

function AgentChip({ a, self, root, open, onToggle, color, mark, machine }) {
  // ONE activity rule (task 3546287b + dfee16ea): the state that drives the
  // blinking dot also decides the working emphasis — no parallel check.
  const state = agentDotState(a);
  const running = state === 'running';
  const working = workingBadgeClass(state);
  const known = a.branch && a.branch !== 'unknown';
  const cls = ['fs__chip'];
  if (running) cls.push('fs__chip--running');
  if (working) cls.push(working, 'fs__chip--working');
  // Free vs occupied at a glance (openspec manual-agent-occupancy): the Operator's setting, else the branch rule.
  const occ = occupancyOf(a);
  cls.push(occ.occupied ? 'fs__chip--occupied' : 'fs__chip--free');
  if (occ.source === 'operator') cls.push('fs__chip--manual');
  if (open) cls.push('fs__chip--open');
  // Shared machine/repo colour (fleet-status task 327aa5ae): same hue this machine +
  // repo agent gets on the Kanban cards and the Task graph. Border = machine hue,
  // background tint = repo hue; the state (free/claimed/running) still reads via the dot.
  if (color?.cls) cls.push(...color.cls.trim().split(/\s+/));
  // The visible label is the repo agent alone (task 1dc2812c): the machine is the
  // section header above the strip, so "<machine>/" in every chip was redundant and,
  // on a long machine name, truncated the very part that tells agents apart. The
  // FULL handle stays on data-handle and in the title; nothing else reads the label.
  const label = repoAgentLabel(a.handle, a.name, machine);
  const title = [
    a.handle && a.handle !== a.name ? `${a.handle} (${a.name})` : a.name,
    occ.title,
    known ? `on ${a.branch}` : 'branch unknown',
    running ? `running ${ago(Date.now() - a.runningSince)}` : `idle · last actor ${a.lastActor || 'none'}`,
    a.managed ? 'in the arch scope' : null,
    a.goal ? `driven by arch goal ${a.goal.id}` : null,
  ].filter(Boolean).join(' · ');
  return (
    <button type="button" className={cls.join(' ')} style={color?.style} title={`${mark ? `${mark.glyph} ${mark.monogram} · ` : ''}${title}`} onClick={onToggle} data-agent={a.key} data-on-default={a.onDefault} data-occupied={occ.occupied} data-occupancy-source={occ.source} data-running={running} data-goal={a.goal?.id || undefined}>
      <AgentStatusDot state={state} />
      <span className="fs__chip-text">
        {/* The colour-independent identity (fleet task 4ddcfce3): the same glyph + monogram
            this agent's chip carries on the Kanban cards, from the shared colour module. */}
        <span className="fs__chip-name" data-handle={a.handle || ''} data-label={label}>{mark && <AgentMark mark={mark} compact />}{occ.source === 'operator' ? <span className="fs__chip-hand" title="occupancy set by the Operator" aria-label="set by the Operator">✋ </span> : null}{a.managed ? '🏛 ' : ''}{label}</span>
        <span className="fs__chip-branch"><span aria-hidden="true">⎇</span> {known ? a.branch : '?'}{a.dirty ? ' ·' : ''}{running ? ` · ${ago(Date.now() - a.runningSince)}` : ''}</span>
      </span>
    </button>
  );
}

// The Operator's three-way occupancy control (openspec manual-agent-occupancy): occupied ·
// free · automatic, the one in effect pressed, who decided it. Posts and reloads the status.
function OccupancyControl({ a, sourceId, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const occ = occupancyOf(a);
  const current = occ.source === 'operator' ? (occ.occupied ? 'occupied' : 'free') : 'auto';
  const set = async (value) => {
    setBusy(true); setErr('');
    try { await apiPost('/arch/fleet/occupancy', occupancyBody(sourceId, a.repoId, value === 'auto' ? null : value === 'occupied')); onChanged?.(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  return (
    <div className="fs__detail-row fs__occ-ctl" data-occupancy-control={a.key} data-occupancy-current={current}>
      <span className="fs__detail-k">occupancy</span>
      <span className="fs__occ-btns" role="group" aria-label="Occupancy">
        <button type="button" className={`fs__occ-btn fs__occ-btn--occupied${current === 'occupied' ? ' fs__occ-btn--on' : ''}`} aria-pressed={current === 'occupied'} disabled={busy} onClick={() => set('occupied')} title="Mark this agent occupied — the arch sees it as claimed and sends nothing to it" data-occupancy-set="occupied">occupied</button>
        <button type="button" className={`fs__occ-btn fs__occ-btn--free${current === 'free' ? ' fs__occ-btn--on' : ''}`} aria-pressed={current === 'free'} disabled={busy} onClick={() => set('free')} title="Mark this agent free — the arch may give it work (a feature branch still has to be named in a send)" data-occupancy-set="free">free</button>
        <button type="button" className={`fs__occ-btn${current === 'auto' ? ' fs__occ-btn--on' : ''}`} aria-pressed={current === 'auto'} disabled={busy} onClick={() => set('auto')} title="Let the branch rule decide: free on the default branch, occupied otherwise" data-occupancy-set="auto">automatic</button>
      </span>
      <span className="fs__dim fs__occ-why" data-occupancy-why>{occ.source === 'operator' ? `${occ.label} — set by you${a.occupancy?.note ? ` (${a.occupancy.note})` : ''}; a running turn still shows as busy` : `${occ.label} — the branch rule (${a.onDefault ? 'on its default branch' : a.branch && a.branch !== 'unknown' ? 'on a feature branch' : 'branch unknown'}); set it by hand to override`}</span>
      {err && <span className="fs__note fs__note--err">{err}</span>}
    </div>
  );
}

function AgentDetail({ a, self, root, sourceId, machine, onChanged }) {
  const running = !!a.runningSince;
  const openDock = () => {
    try { localStorage.setItem('claudeweb_dock_active', a.tabId); } catch { /* ignore */ }
    window.top.location.href = `${root}/studio`;
  };
  // "open harness" (board task b06d56c4): the SAME call the Kanban badge makes — the agent's
  // tab key as the badge derives it (sourceId|repoId, '' for this machine), the machine's own
  // studio link, and focusAgentTab, which honours the Settings-chosen harness window, one tab
  // per agent, and focus-not-reload on a repeat click. Not reimplemented, just called.
  const agentTabKey = `${self ? '' : (sourceId || '')}|${a.repoId}`;
  const harnessUrl = machine ? agentWorkerHref(machine, harnessRootFromLocation(), a.repoId) : null;
  const openHarness = () => { if (harnessUrl) focusAgentTab(agentTabKey, harnessUrl); };
  return (
    <div className="fs__detail" data-detail={a.key}>
      <div className="fs__detail-row"><b>{a.handle || a.name}</b>{a.handle && a.handle.split('/').pop() !== a.name ? <span className="fs__dim"> · {a.name}</span> : null}{a.remoteUrl ? <span className="fs__mono fs__dim"> · {a.remoteUrl}</span> : null}</div>
      {/* The facts as badges (fleet task a25ee2de): the same branch / activity /
          availability / scope facts the "a · b · c" rows carried, one badge each, the
          data hooks (data-claimed-reason, data-driven-by-goal) on the badges. */}
      <div className="fs__detail-row fs__detail-row--badges">
        <span className="fs__detail-k">branch</span> <code>{a.branch || '?'}</code>
        <span className="fs__detail-k">default</span> <code>{a.defaultBranch || '?'}</code>
        <StatusBadges badges={branchBadges(a)} data-detail-branch={a.key} />
      </div>
      <div className="fs__detail-row fs__detail-row--badges">
        <StatusBadges badges={[occupancyBadge(a), ...agentDetailBadges(a, { runningFor: running ? ago(Date.now() - a.runningSince) : '' })]} data-detail-facts={a.key} />
      </div>
      <OccupancyControl a={a} sourceId={self ? null : sourceId} onChanged={onChanged} />
      <div className="fs__detail-row">
        <button type="button" className="fs__btn" onClick={openHarness} disabled={!harnessUrl} data-open-agent-harness={a.key} data-open-agent-tab={agentTabKey} data-open-agent-url={harnessUrl || ''} title={harnessUrl ? 'open this agent in its harness tab — the same tab / window a Kanban badge click uses (Settings · harness window); a second click focuses it without reloading' : "this machine's address is unknown to the fleet — nothing to open"}>open harness ↗</button>
        <span className="fs__dim">{harnessUrl ? 'same tab / window as the Kanban badge' : 'machine address unknown'}</span>
      </div>
      {/* Hand the branch to the arch / take it back (openspec arch-branch-handover):
          the arch's own machine records it; a peer gets adopt / revoke relayed. */}
      {a.managed && a.branch && a.branch !== 'unknown' && !a.onDefault && (
        <div className="fs__detail-row">
          <HandToArch
            repoId={a.repoId}
            sourceId={self ? null : sourceId}
            initial={self ? null : { managed: true, branch: a.branch, onDefault: a.onDefault, availability: a.availability, claimedReason: a.claimedReason, adopted: a.adopted, archBranch: a.adopted, pinned: a.pinned, claimWindowMinutes: 120 }}
            onChanged={onChanged}
          />
        </div>
      )}
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
  const [activeTab, setActiveTabState] = useState(() =>
    readFleetTab(typeof window !== 'undefined' ? window.location.search : '', (k) => localStorage.getItem(k)));

  const setActiveTab = (next) => {
    setActiveTabState(next);
    try { localStorage.setItem(FLEET_TAB_KEY, next); } catch { /* private mode */ }
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('fleetTab', next);
      window.history.replaceState(null, '', u);
    } catch { /* opaque origin */ }
  };

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
  // Shared machine/repo colours (fleet-status task 327aa5ae): one palette so a given
  // machine + repo agent has the SAME hue here and on the Kanban cards / Task graph.
  const mkOfMachine = (m) => (m.self ? 'self' : m.sourceId);
  const rkOfAgent = (a) => repoKey({ repoId: a.repoId }, () => a.remoteUrl);
  const colors = useTaskColors(
    machines.flatMap((m) => (m.agents || []).map(() => mkOfMachine(m))),
    machines.flatMap((m) => (m.agents || []).map((a) => rkOfAgent(a))),
  );
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
      if (occupancyOf(a).occupied) acc.occupied += 1; else acc.free += 1;
      if (a.managed) acc.managed += 1;
    }
    return acc;
  }, { all: 0, running: 0, free: 0, occupied: 0, managed: 0 });
  const shown = scoped.reduce((n, { agents }) => n + agents.filter((a) => matches(a, filter)).length, 0);
  const total = machines.reduce((n, m) => n + (m.agents || []).length, 0);

  return (
    <div className="fs" data-fleet-status>
      <div className="fs__head">
        <span className="fs__title">Fleet status</span>
        <span className="fs__dim">every repo agent on every machine</span>
        <StatusBadge badge={{ key: 'hub', label: `hub build ${shortVersion(data?.hubVersion)}`, tone: data?.hubVersion ? 'muted' : 'unknown', mono: true, title: data?.hubVersion ? `hub build ${data.hubVersion}` : 'hub build unknown' }} />
        <span className="fs__dim fs__shown" data-shown={shown} data-total={total}>{narrowed ? `${shown} of ${total} agents` : `${total} agents`}</span>
      </div>

      <div className="fs__tabs" role="tablist" aria-label="Fleet status view" data-fleet-tabs>
        {FLEET_TABS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={activeTab === k}
            className={`fs__tab${activeTab === k ? ' fs__tab--on' : ''}`}
            data-fleet-tab={k}
            onClick={() => setActiveTab(k)}
          >
            {TAB_LABELS[k]}
          </button>
        ))}
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
        {activeTab === 'agents' && (
          <div className="fs__filters" role="group" aria-label="Show">
            {FILTERS.map(([k, label, title]) => (
              <button key={k} type="button" className={`fs__filter${filter === k ? ' fs__filter--on' : ''}`} title={title} aria-pressed={filter === k} data-filter={k} onClick={() => setFilterState(k)}>
                {label} <span className="fs__count">{totals[k]}</span>
              </button>
            ))}
          </div>
        )}
        {narrowed && (
          <button type="button" className="fs__clear" onClick={clearAll} title="Show every agent again" data-clear-filters>× clear</button>
        )}
      </div>

      {!data && !error && <div className="fs__note" data-loading>Loading the fleet status…</div>}
      {error && <div className="fs__note fs__note--err">{error}</div>}
      {activeTab === 'agents' && data && total > 0 && shown === 0 && <div className="fs__note" data-no-match>Nothing matches — clear a filter or the search.</div>}
      {/* By plan / accounts (openspec fleet-accounts-subtab): the same poll's machines,
          re-keyed by Claude account, plus the hub's last-seen memory. The machine chips
          above still narrow which machines are aggregated; remembered accounts always show. */}
      {activeTab === 'accounts' && data && (
        <FleetAccountsPanel machines={machines.filter(machineOn)} lastSeen={data.accountsLastSeen} now={Date.now()} />
      )}
      {activeTab !== 'accounts' && scoped.map(({ m, agents: inScope }) => {
        if (!machineOn(m)) return null;
        const agents = inScope.filter((a) => matches(a, filter));
        const running = (m.agents || []).filter((a) => a.runningSince).length;
        const hidden = (m.agents || []).length - agents.length;
        // Occupied on top, free below (openspec manual-agent-occupancy).
        const split = splitByOccupancy(agents);
        // Collapse-to-header is an Agents-tab affordance only; the Overview and
        // Scoreboard tabs always render every selected machine's card.
        const collapsed = activeTab === 'agents' && narrowed && agents.length === 0 && (m.agents || []).length > 0;
        return (
          <section key={m.sourceId} className={`fs__machine${m.self ? ' fs__machine--self' : ''}${m.reachable ? '' : ' fs__machine--dark'}${collapsed ? ' fs__machine--collapsed' : ''}`} data-machine={m.machine} data-collapsed={collapsed || undefined}>
            <div className="fs__mh">
              <span className={`fs__mdot${m.reachable ? ' fs__mdot--ok' : ''}`} aria-hidden="true" />
              <span className="fs__mlabel">{m.machine}</span>
              {m.self && <span className="fs__tag">self</span>}
              {!m.self && m.address && <span className="fs__mono fs__dim">{m.address}</span>}
              {/* Jump to THAT machine's harness (task e5cddb1e): href from the
                  peer registry's address (self: this harness's root) — disabled,
                  never guessed, when the address isn't known. */}
              {harnessHref(m, root) ? (
                <a
                  className="fs__openlink"
                  href={harnessHref(m, root)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={m.self ? 'Open this harness in a new tab' : `Open the harness on ${m.machine} in a new tab (${m.address})`}
                  data-open-harness={m.sourceId}
                >
                  open harness ↗
                </a>
              ) : (
                <span
                  className="fs__openlink fs__openlink--off"
                  title="This machine's harness address is not known to the hub — set it on the fleet source to enable the link"
                  data-open-harness-disabled={m.sourceId}
                >
                  open harness
                </span>
              )}
              {/* Build / sync / opt-ins / gate and the counts as badges (fleet task
                  a25ee2de) — the same facts the "build x · behind the hub · …" text
                  carried, one pill each, from statusBadges.js. */}
              <StatusBadges className="fs__mstate" badges={machineBadges(m)} data-machine-state={m.sourceId} />
              <StatusBadges className="fs__mmeta" badges={machineMeta(m, { running, hidden, narrowed })} data-machine-meta={m.sourceId} />
            </div>
            {activeTab === 'overview' ? (
              <FleetOverviewPanel machine={m} />
            ) : activeTab === 'scoreboard' ? (
              <FleetScoreboardTab machine={m} />
            ) : (
              <>
                {/* Stale board work on this machine (openspec kanban-lifecycle-columns):
                    an unpushed task branch or a parked PR — agents-tab material. */}
                {(m.staleTasks || []).length > 0 && (
                  <div className="fs__stale" data-stale-tasks>
                    {(m.staleTasks || []).map((t) => (
                      <div key={t.id} className="fs__stale-row" title={t.title}>
                        <StatusBadge badge={{ key: 'stale', label: `⏱ stale · ${t.reason === 'unpushed branch' ? `unpushed branch on ${m.machine}` : 'PR open'}`, tone: 'warn' }} />
                        {t.branch ? <span className="fs__mono"> ⎇ {t.branch}</span> : null}
                        <span className="fs__stale-title"> — {t.title}</span>
                      </div>
                    ))}
                  </div>
                )}
                {collapsed ? null : agents.length === 0
                  ? <div className="fs__none">{(m.agents || []).length === 0 ? (m.reachable ? 'no repo agents (no docks, nothing in the arch scope)' : 'nothing known — the machine has not answered') : 'nothing matches this filter'}</div>
                  : (
                    <div className="fs__occ-wrap" data-occupancy-sections>
                      {[['occupied', split.occupied], ['free', split.free]].map(([kind, list]) => (
                        <div key={kind} className={`fs__occ fs__occ--${kind}`} data-occ-section={kind} data-occ-count={list.length}>
                          <div className="fs__occ-h"><span className={`fs__dot fs__dot--${kind}`} aria-hidden="true" />{kind === 'occupied' ? 'Occupied' : 'Free'}<span className="fs__occ-n">{list.length}</span></div>
                          {list.length === 0 ? <div className="fs__occ-none">none</div> : (
                            <div className="fs__strip">
                              {list.map((a) => (
                                <AgentChip key={a.key} a={a} self={m.self} root={root} machine={m.machine} color={colors.chip(mkOfMachine(m), rkOfAgent(a))} mark={colors.mark(mkOfMachine(m), rkOfAgent(a), m.machine, a.handle || a.name)} open={open === a.key} onToggle={() => setOpen(open === a.key ? null : a.key)} />
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                {agents.filter((a) => open === a.key).map((a) => <AgentDetail key={a.key} a={a} self={m.self} root={root} sourceId={m.sourceId} machine={m} onChanged={load} />)}
              </>
            )}
          </section>
        );
      })}
      {activeTab === 'agents' && <div className="fs__legend fs__dim">
        <span><span className="fs__dot fs__dot--free" aria-hidden="true" /> free — the Operator's setting, else on its default branch</span>
        <span><span className="fs__dot fs__dot--occupied" aria-hidden="true" /> occupied — the Operator's setting, else on a feature branch</span>
        <span>✋ occupancy set by the Operator (click an agent to change it)</span>
        <span><span className="fs__dot fs__dot--running" aria-hidden="true" /> running a turn</span>
        <span>🏛 in the arch agent's scope</span>
      </div>}
    </div>
  );
}
