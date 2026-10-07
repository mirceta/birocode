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
import { machineFacts, branchBadges, agentDetailBadges } from './statusBadges';
import { occupancyOf, splitByOccupancy, OCCUPANCY_FILTERS, normalizeFilter, matchesFilter, occupancyBadge, occupancyBody } from './occupancy';
import { matchesAgentQuery } from './agentQuery';
import { LAYOUTS, readLayout, LAYOUT_KEY, isFinishedUnchecked, mergedList, occupancyMarker, orderAgents, checkedBody, reconcileAcked, withAck } from './agentsView';

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
//
// Two scan aids (openspec status-agents-attention, fleet task 4a1fb7ee): a split / merged
// switch beside the filters (two sections per machine, or one list with the occupancy
// marked on every row — remembered per browser), and the "!" on an agent that FINISHED a
// turn nobody checked yet — the dock's server-owned unseenResult latch, relayed on every
// fleet agent, so a reload and every browser see the same mark. It stays in the running
// view and wherever the agent is listed until the dedicated ✓ "mark as checked"; expanding
// the agent never clears it.

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

// As-you-type text filter (fleet task 9be69c00): matching moved to agentQuery.js so the
// haystack includes the agent's VISIBLE name — the chip label and the handle — not just
// the repo name; typing what a chip shows now always keeps that chip.
const matchesQuery = matchesAgentQuery;

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

// ONE derivation for everything on this tab that opens an agent's harness (tasks b06d56c4,
// 15e00e7d, 6f86332c): the Kanban badge's tab key (sourceId|repoId, '' for this machine) and
// the machine's studio deep link. The details' big button and the chip's double-click both
// hand this to focusAgentTab — never a second implementation.
function harnessTargetOf(machine, a) {
  return {
    key: `${machine?.self ? '' : (machine?.sourceId || '')}|${a.repoId}`,
    url: machine ? agentWorkerHref(machine, harnessRootFromLocation(), a.repoId) : null,
  };
}

// The machine header's facts as ONE aligned grid (openspec fleet-status-compact-layout): the
// same columns in the same order on every machine (machineFacts never omits one), label over
// value, the state as the cell's colour. Replaces the build / sync / opt-ins / gate / counts
// pill run; the Overview and the agent details keep their badges.
function MachineFacts({ m, running, hidden, narrowed }) {
  return (
    <dl className="fs__facts" data-machine-facts={m.sourceId}>
      {machineFacts(m, { running, hidden, narrowed }).map((f) => (
        <div key={f.key} className={`fs__fact fs__fact--${f.tone}${f.mono ? ' fs__fact--mono' : ''}`} data-fact={f.key} data-tone={f.tone} title={f.title}>
          <dt className="fs__fact-k">{f.label}</dt>
          <dd className="fs__fact-v">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

// A chip that needs eyes — running, or finished and not yet checked — takes the wide cell of
// the chip grid (the "active is visibly bigger" rule of task 3546287b, kept on a grid).
const isWorking = (a) => !!a.runningSince || isFinishedUnchecked(a);
const chipwrapClass = (a) => `fs__chipwrap${isWorking(a) ? ' fs__chipwrap--working' : ''}`;

function AgentChip({ a, self, root, open, onToggle, color, mark, machine, machineInfo, merged }) {
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
  // Finished, not yet checked (openspec status-agents-attention): the dashboard's "!" language.
  const finished = isFinishedUnchecked(a);
  if (finished) cls.push('fs__chip--finished', 'fs__chip--working');
  // Shared machine/repo colour (fleet-status task 327aa5ae): same hue this machine +
  // repo agent gets on the Kanban cards and the Task graph. Border = machine hue,
  // background tint = repo hue; the state (free/claimed/running) still reads via the dot.
  if (color?.cls) cls.push(...color.cls.trim().split(/\s+/));
  // The visible label is the repo agent alone (task 1dc2812c): the machine is the
  // section header above the strip, so "<machine>/" in every chip was redundant and,
  // on a long machine name, truncated the very part that tells agents apart. The
  // FULL handle stays on data-handle and in the title; nothing else reads the label.
  const label = repoAgentLabel(a.handle, a.name, machine);
  // Double-click = open the harness directly (fleet task 6f86332c): the SAME target and
  // focusAgentTab call as the details' big button, just without the expand step. The two
  // clicks a double-click fires first toggle the details open and shut again (the Kanban
  // title's click-vs-dblclick idiom — no delay timer), so nothing is left toggled.
  const harness = harnessTargetOf(machineInfo, a);
  const openHarness = harness.url ? () => focusAgentTab(harness.key, harness.url) : undefined;
  const title = [
    a.handle && a.handle !== a.name ? `${a.handle} (${a.name})` : a.name,
    occ.title,
    known ? `on ${a.branch}` : 'branch unknown',
    running ? `running ${ago(Date.now() - a.runningSince)}` : finished ? 'finished — result not checked yet (✓ marks it checked)' : `idle · last actor ${a.lastActor || 'none'}`,
    a.managed ? 'in the arch scope' : null,
    a.goal ? `driven by arch goal ${a.goal.id}` : null,
    openHarness ? 'double-click: open harness' : null,
  ].filter(Boolean).join(' · ');
  return (
    <button type="button" className={cls.join(' ')} style={color?.style} title={`${mark ? `${mark.glyph} ${mark.monogram} · ` : ''}${title}`} onClick={onToggle} onDoubleClick={openHarness} data-agent={a.key} data-dblclick-harness={openHarness ? harness.key : undefined} data-on-default={a.onDefault} data-occupied={occ.occupied} data-occupancy-source={occ.source} data-running={running} data-finished-unchecked={finished || undefined} data-goal={a.goal?.id || undefined}>
      {finished ? <span className="fs__chip-bang" aria-label="finished, result not checked yet" title="finished — result not checked yet">!</span> : <AgentStatusDot state={state} />}
      <span className="fs__chip-text">
        {/* The colour-independent identity (fleet task 4ddcfce3): the same glyph + monogram
            this agent's chip carries on the Kanban cards, from the shared colour module. */}
        <span className="fs__chip-name" data-handle={a.handle || ''} data-label={label}>{mark && <AgentMark mark={mark} compact />}{occ.source === 'operator' ? <span className="fs__chip-hand" title="occupancy set by the Operator" aria-label="set by the Operator">✋ </span> : null}{a.managed ? '🏛 ' : ''}{label}</span>
        <span className="fs__chip-branch">{merged ? <span className={`fs__chip-occ fs__chip-occ--${occupancyMarker(a)}`} data-occ-marker={occupancyMarker(a)}>{occupancyMarker(a)}</span> : null}<span aria-hidden="true">⎇</span> {known ? a.branch : '?'}{a.dirty ? ' ·' : ''}{running ? ` · ${ago(Date.now() - a.runningSince)}` : finished ? ' · finished' : ''}</span>
      </span>
    </button>
  );
}

// The dedicated acknowledgement (openspec status-agents-attention): clears the "!" — the
// ONLY thing that does on this tab. Beside the chip (so the Operator never has to expand) and
// again in the details. Posts to the hub, which clears the dock latch here or relays it to the
// peer; the parent hides the mark at once and the next poll confirms it.
function MarkChecked({ a, sourceId, onChecked, compact }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const check = async (e) => {
    e.stopPropagation();
    setBusy(true); setErr('');
    try { await apiPost('/arch/fleet/checked', checkedBody(sourceId, a.repoId)); onChecked?.(a); }
    catch (x) { setErr(x?.message || String(x)); }
    finally { setBusy(false); }
  };
  return (
    <span className={`fs__check${compact ? ' fs__check--compact' : ''}`}>
      <button type="button" className="fs__btn fs__check-btn" disabled={busy} onClick={check} data-mark-checked={a.key} title="Mark this agent's finished result as checked — the ! goes away and it leaves the running view. Expanding the agent does not do this.">✓ {compact ? 'checked' : 'mark as checked'}</button>
      {err && <span className="fs__note fs__note--err" data-mark-checked-error={a.key}>{err}</span>}
    </span>
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

function AgentDetail({ a, self, root, sourceId, machine, onChanged, onChecked }) {
  const running = !!a.runningSince;
  const finished = isFinishedUnchecked(a);
  const openDock = () => {
    try { localStorage.setItem('claudeweb_dock_active', a.tabId); } catch { /* ignore */ }
    window.top.location.href = `${root}/studio`;
  };
  // "open harness" (board task b06d56c4): the SAME call the Kanban badge makes — the shared
  // harnessTargetOf derivation plus focusAgentTab, which honours the Settings-chosen harness
  // window, one tab per agent, and focus-not-reload on a repeat click. The chip's
  // double-click (task 6f86332c) goes through the identical pair.
  const { key: agentTabKey, url: harnessUrl } = harnessTargetOf(machine, a);
  const openHarness = () => { if (harnessUrl) focusAgentTab(agentTabKey, harnessUrl); };
  return (
    <div className="fs__detail" data-detail={a.key}>
      <div className="fs__detail-row"><b>{a.handle || a.name}</b>{a.handle && a.handle.split('/').pop() !== a.name ? <span className="fs__dim"> · {a.name}</span> : null}{a.remoteUrl ? <span className="fs__mono fs__dim"> · {a.remoteUrl}</span> : null}</div>
      {/* THE action of the details (fleet task 15e00e7d): opening this agent's harness is
          why the Operator clicked the chip, so it is the big primary button, always right
          under the identity line. Presentation only — the handler, the tab key, the URL
          and every data hook are task b06d56c4's, byte for byte. */}
      <div className="fs__detail-row fs__detail-primary">
        <button type="button" className="fs__btn fs__btn--primary" onClick={openHarness} disabled={!harnessUrl} data-open-agent-harness={a.key} data-open-agent-tab={agentTabKey} data-open-agent-url={harnessUrl || ''} title={harnessUrl ? 'open this agent in its harness tab — the same tab / window a Kanban badge click uses (Settings · harness window); a second click focuses it without reloading' : "this machine's address is unknown to the fleet — nothing to open"}><span aria-hidden="true">🖥</span> Open harness <span aria-hidden="true">↗</span></button>
        <span className="fs__dim">{harnessUrl ? 'same tab / window as the Kanban badge' : 'machine address unknown'}</span>
      </div>
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
      {finished && (
        <div className="fs__detail-row fs__detail-row--finished" data-detail-finished={a.key}>
          <span className="fs__chip-bang" aria-hidden="true">!</span>
          <span>finished a turn — result not checked yet. Looking here does not clear it:</span>
          <MarkChecked a={a} sourceId={self ? null : sourceId} onChecked={onChecked} />
        </div>
      )}
      <OccupancyControl a={a} sourceId={self ? null : sourceId} onChanged={onChanged} />
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
  // split / merged (openspec status-agents-attention), remembered per browser.
  const [layout, setLayoutState] = useState(() => readLayout((k) => localStorage.getItem(k)));
  const setLayout = (next) => { setLayoutState(next); try { localStorage.setItem(LAYOUT_KEY, next); } catch { /* private mode */ } };
  // Agents the Operator marked checked since the last poll confirmed it (optimistic; a new turn spends it).
  const [acked, setAcked] = useState(() => new Set());
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
      setAcked((prev) => reconcileAcked(prev, (d?.machines || []).flatMap((m) => m.agents || [])));
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

  // Every agent as the tab reads it: the server's facts, with the latch hidden where the Operator just checked it.
  const machines = useMemo(() => (data?.machines || []).map((m) => ({ ...m, agents: (m.agents || []).map((a) => withAck(a, acked)) })), [data, acked]);
  const onChecked = (a) => { setAcked((prev) => new Set(prev).add(a.key)); load(); };
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
      if (a.runningSince || isFinishedUnchecked(a)) acc.running += 1;   // running keeps the finished-unchecked (openspec status-agents-attention)
      if (occupancyOf(a).occupied) acc.occupied += 1; else acc.free += 1;
      if (a.managed) acc.managed += 1;
    }
    return acc;
  }, { all: 0, running: 0, free: 0, occupied: 0, managed: 0 });
  const shown = scoped.reduce((n, { agents }) => n + agents.filter((a) => matches(a, filter)).length, 0);
  const total = machines.reduce((n, m) => n + (m.agents || []).length, 0);

  return (
    <div className="fs" data-fleet-status>
      {/* The head and the filter bar are ONE pinned block (openspec fleet-status-compact-layout):
          sticky at the top of the scrolling pane, solid background, so the view tabs and every
          filter stay in reach while nine machines scroll under them. */}
      <div className="fs__sticky" data-fleet-head>
      <div className="fs__head">
        <span className="fs__title">Fleet status</span>
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
        <span className="fs__dim fs__head-sub">every repo agent on every machine</span>
        <StatusBadge badge={{ key: 'hub', label: `hub build ${shortVersion(data?.hubVersion)}`, tone: data?.hubVersion ? 'muted' : 'unknown', mono: true, title: data?.hubVersion ? `hub build ${data.hubVersion}` : 'hub build unknown' }} />
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
        {activeTab === 'agents' && (
          <div className="fs__filters fs__layout" role="group" aria-label="Layout" data-layout-switch data-layout={layout}>
            {LAYOUTS.map((k) => (
              <button key={k} type="button" className={`fs__filter${layout === k ? ' fs__filter--on' : ''}`} aria-pressed={layout === k} data-layout-set={k} onClick={() => setLayout(k)}
                title={k === 'split' ? 'Two sections per machine: Occupied above Free' : 'One list per machine, occupied and free marked on each row — compact'}>
                {k === 'split' ? '▤ split' : '☰ merged'}
              </button>
            ))}
          </div>
        )}
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
        // Running → finished → idle, alphabetical within (openspec fleet-status-compact-layout);
        // the split keeps the order inside each section, the merged list concatenates them.
        const agents = orderAgents(inScope.filter((a) => matches(a, filter)));
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
              {/* A machine the hub cannot reach says so here, with the collector's reason and
                  when it dials again (openspec hub-perf-arch-state-snapshot) — not only in the log. */}
              {!m.self && !m.reachable && (
                <span className="fs__dim" data-unreachable={m.sourceId}>
                  {' · '}{m.collector?.detail || m.detail || 'not answering'}
                  {m.collector?.failStreak > 1 ? ` · ${m.collector.failStreak} polls in a row` : ''}
                  {m.collector?.nextRetryAt > Date.now() ? ` · retry in ${Math.ceil((m.collector.nextRetryAt - Date.now()) / 1000)} s` : ''}
                </span>
              )}
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
              {/* Build / sync / opt-ins / gate and the counts — the same facts the badge row
                  (fleet task a25ee2de) carried, now one aligned grid per machine. */}
              <MachineFacts m={m} running={running} hidden={hidden} narrowed={narrowed} />
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
                  : layout === 'merged' ? (
                    <div className="fs__strip fs__strip--merged" data-occupancy-merged data-occ-count={agents.length}>
                      {mergedList(agents).map((a) => (
                        <span key={a.key} className={chipwrapClass(a)}>
                          <AgentChip a={a} self={m.self} root={root} machine={m.machine} machineInfo={m} merged color={colors.chip(mkOfMachine(m), rkOfAgent(a))} mark={colors.mark(mkOfMachine(m), rkOfAgent(a), m.machine, a.handle || a.name)} open={open === a.key} onToggle={() => setOpen(open === a.key ? null : a.key)} />
                          {isFinishedUnchecked(a) && <MarkChecked a={a} sourceId={m.self ? null : m.sourceId} onChecked={onChecked} compact />}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="fs__occ-wrap" data-occupancy-sections>
                      {[['occupied', split.occupied], ['free', split.free]].map(([kind, list]) => (
                        <div key={kind} className={`fs__occ fs__occ--${kind}`} data-occ-section={kind} data-occ-count={list.length}>
                          <div className="fs__occ-h"><span className={`fs__dot fs__dot--${kind}`} aria-hidden="true" />{kind === 'occupied' ? 'Occupied' : 'Free'}<span className="fs__occ-n">{list.length}</span></div>
                          {list.length === 0 ? <div className="fs__occ-none">none</div> : (
                            <div className="fs__strip">
                              {list.map((a) => (
                                <span key={a.key} className={chipwrapClass(a)}>
                                  <AgentChip a={a} self={m.self} root={root} machine={m.machine} machineInfo={m} color={colors.chip(mkOfMachine(m), rkOfAgent(a))} mark={colors.mark(mkOfMachine(m), rkOfAgent(a), m.machine, a.handle || a.name)} open={open === a.key} onToggle={() => setOpen(open === a.key ? null : a.key)} />
                                  {isFinishedUnchecked(a) && <MarkChecked a={a} sourceId={m.self ? null : m.sourceId} onChecked={onChecked} compact />}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                {agents.filter((a) => open === a.key).map((a) => <AgentDetail key={a.key} a={a} self={m.self} root={root} sourceId={m.sourceId} machine={m} onChanged={load} onChecked={onChecked} />)}
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
        <span><span className="fs__chip-bang fs__chip-bang--legend" aria-hidden="true">!</span> finished — result not checked yet; stays in the running view until ✓ mark as checked</span>
        <span>🏛 in the arch agent's scope</span>
      </div>}
    </div>
  );
}
