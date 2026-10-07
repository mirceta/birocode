import { useId, useMemo, useSyncExternalStore } from 'react';
import { UNASSIGNED, FLAGS, chipsOf, emptyFilter, facets, isNarrowed, toggleValue } from './taskFilters';
import { COLLAPSED, EXPANDED, readFold, summaryChips, withoutChip, writeFold } from './taskFilterSummary';
import { COLUMNS, columnLabel } from './kanbanColumns';
import './taskfilters.css';

// The filter bar pinned above the Kanban and the Task graph (openspec task-filters),
// modelled on the fleet Status tab's bar: a text search, then one chip group per
// dimension — Machines, Agents (machine/handle), State (the Kanban columns, read from
// kanbanColumns so new columns appear by themselves) and Flags (blocked, stale — only
// when some card carries them). Chips multi-select within a group and AND across
// groups; each carries the count it would show given the other groups. A × clears
// everything; "N of M tasks" appears when narrowed. The state itself is the shared
// task filter (taskFilterStore), so the bar in one pane drives the other pane too.
//
// The bar FOLDS (openspec kanban-collapsible-filters): a chevron + "Filters" toggle with
// a count badge heads it; collapsed — the default — the controls give way to one line of
// summary chips ("machine: spacex", each with its own ×), "clear all", the shown count
// and `extra`, so the board gains the height. Expanded shows the controls exactly as
// before. The fold is remembered per browser and shared by every mounted bar (the
// Management App shows the Kanban and the graph side by side); the filter itself is
// untouched by folding.
//
// `views` are taskView() records for every task on the board; `extra` is rendered at
// the end of the bar (the Task graph puts its "hide filtered" toggle there).

// ---- the fold, one per browser --------------------------------------------------------
let fold = null;
const foldListeners = new Set();
const storage = () => (typeof localStorage === 'undefined' ? null : localStorage);
function getFold() { if (fold === null) fold = readFold(storage()); return fold; }
function setFold(next) {
  const v = next === EXPANDED ? EXPANDED : COLLAPSED;
  if (v === getFold()) return;
  fold = v;
  writeFold(storage(), v);
  for (const l of foldListeners) l();
}
function subscribeFold(l) { foldListeners.add(l); return () => foldListeners.delete(l); }
/** Test seam: forget the in-memory fold so the next read re-initialises. */
export function resetTaskFilterFoldForTests() { fold = null; }

function Chip({ chip, label, title, onClick, attr, dim }) {
  return (
    <button
      type="button"
      className={`tf__chip${chip.on ? ' tf__chip--on' : ''}${dim ? ' tf__chip--dim' : ''}`}
      aria-pressed={chip.on}
      title={title}
      onClick={onClick}
      {...attr}
    >
      {label} <span className="tf__count">{chip.count}</span>
    </button>
  );
}

export default function TaskFilterBar({ views, filter, setFilter, extra = null, view = 'kanban' }) {
  const fx = useMemo(() => facets(views, filter, COLUMNS), [views, filter]);
  const machines = useMemo(() => chipsOf(fx.machines, filter.machines, { unassigned: true }), [fx, filter.machines]);
  const agents = useMemo(() => chipsOf(fx.agents, filter.agents, { unassigned: true }), [fx, filter.agents]);
  // Every column gets a chip even when empty (the columns ARE the states); flag chips
  // only for flags some card carries (or that are selected).
  const states = useMemo(() => chipsOf(fx.states, filter.states, { order: fx.stateKeys, always: fx.stateKeys }), [fx, filter.states]);
  const flags = useMemo(() => chipsOf(fx.flags, filter.flags, { order: fx.flagKeys, always: fx.flagKeys }).filter((c) => fx.flagKeys.includes(c.key)), [fx, filter.flags]);
  const narrowed = isNarrowed(filter);
  const toggle = (group, key) => setFilter((f) => ({ ...f, [group]: toggleValue(f[group], key) }));
  const flagTitle = (k) => FLAGS.find(([fk]) => fk === k)?.[2] || k;
  const flagLabel = (k) => (k === 'blocked' ? '⛔ blocked' : k);
  const clearAll = () => setFilter((f) => ({ ...emptyFilter(), hide: f.hide }));

  const foldState = useSyncExternalStore(subscribeFold, getFold, getFold);
  const collapsed = foldState === COLLAPSED;
  const summary = useMemo(() => summaryChips(filter, { states: columnLabel, flags: flagLabel }), [filter]);
  const barId = useId();
  const shown = <span className="tf__shown" data-shown={fx.shown} data-total={fx.total}>{narrowed ? `${fx.shown} of ${fx.total} tasks` : `${fx.total} tasks`}</span>;

  return (
    <div className={`tf-fold tf-fold--${view}${collapsed ? ' tf-fold--collapsed' : ''}`} data-task-filter-fold={view} data-fold={foldState}>
      <div className="tf-fold__line">
        <button
          type="button"
          className="tf-fold__toggle"
          aria-expanded={!collapsed}
          aria-controls={barId}
          title={collapsed ? 'Show the filter controls' : 'Fold the filter controls to one line'}
          onClick={() => setFold(collapsed ? EXPANDED : COLLAPSED)}
          data-filters-toggle
        >
          <span className="tf-fold__chev" aria-hidden="true">{collapsed ? '▸' : '▾'}</span>
          Filters
          {summary.length > 0 && <span className="tf-fold__count" data-filters-count={summary.length}>{summary.length}</span>}
        </button>
        {collapsed && (
          <>
            {summary.length === 0 && <span className="tf-fold__none" data-filters-none>no filters</span>}
            {summary.map((c) => (
              <span key={`${c.group}:${c.value}`} className="tf-sum__chip" data-summary-chip={`${c.group}:${c.value}`} title={`${c.kind}: ${c.text}`}>
                <span className="tf-sum__kind">{c.kind}:</span> {c.text}
                <button
                  type="button"
                  className="tf-sum__x"
                  aria-label={`Clear ${c.kind} ${c.text}`}
                  title={`Clear ${c.kind} ${c.text}`}
                  onClick={() => setFilter((f) => withoutChip(f, c))}
                  data-summary-clear={`${c.group}:${c.value}`}
                >×</button>
              </span>
            ))}
            {narrowed && <button type="button" className="tf__clear" onClick={clearAll} title="Show every task again" data-clear-task-filters>× clear all</button>}
            <span className="tf__spacer" />
            {shown}
            {extra}
          </>
        )}
      </div>
      {!collapsed && (
        <div id={barId} className={`tf tf--${view}`} role="search" aria-label="Filter tasks" data-task-filter-bar={view}>
          <input
            className="tf__search"
            type="search"
            placeholder="Search title, note, machine, agent…"
            value={filter.q}
            onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
            aria-label="Search tasks"
            data-task-search
          />
          <div className="tf__group" role="group" aria-label="Machines" data-filter-group="machine">
            <span className="tf__label">machine</span>
            {machines.map((c) => (
              <Chip
                key={c.key}
                chip={c}
                label={c.key === UNASSIGNED ? 'Unassigned' : c.key}
                title={c.key === UNASSIGNED ? 'Tasks with no agent assigned' : `Tasks whose agent runs on ${c.key}`}
                onClick={() => toggle('machines', c.key)}
                attr={{ 'data-machine-chip': c.key }}
                dim={c.count === 0 && !c.on}
              />
            ))}
          </div>
          <div className="tf__group" role="group" aria-label="Repo agents" data-filter-group="agent">
            <span className="tf__label">agent</span>
            {agents.map((c) => (
              <Chip
                key={c.key}
                chip={c}
                label={c.key === UNASSIGNED ? 'Unassigned' : c.key}
                title={c.key === UNASSIGNED ? 'Tasks with no agent assigned' : `Tasks assigned to ${c.key}`}
                onClick={() => toggle('agents', c.key)}
                attr={{ 'data-agent-chip': c.key }}
                dim={c.count === 0 && !c.on}
              />
            ))}
          </div>
          <div className="tf__group" role="group" aria-label="State" data-filter-group="state">
            <span className="tf__label">state</span>
            {states.map((c) => (
              <Chip
                key={c.key}
                chip={c}
                label={columnLabel(c.key)}
                title={COLUMNS.find(([k]) => k === c.key)?.[2] || `Tasks in ${c.key}`}
                onClick={() => toggle('states', c.key)}
                attr={{ 'data-state-chip': c.key }}
                dim={c.count === 0 && !c.on}
              />
            ))}
          </div>
          {flags.length > 0 && (
            <div className="tf__group" role="group" aria-label="Flags" data-filter-group="flag">
              <span className="tf__label">flag</span>
              {flags.map((c) => (
                <Chip
                  key={c.key}
                  chip={c}
                  label={flagLabel(c.key)}
                  title={flagTitle(c.key)}
                  onClick={() => toggle('flags', c.key)}
                  attr={{ 'data-flag-chip': c.key }}
                  dim={c.count === 0 && !c.on}
                />
              ))}
            </div>
          )}
          <span className="tf__spacer" />
          {shown}
          {narrowed && (
            <button type="button" className="tf__clear" onClick={clearAll} title="Show every task again" data-clear-task-filters>× clear</button>
          )}
          {extra}
        </div>
      )}
    </div>
  );
}
