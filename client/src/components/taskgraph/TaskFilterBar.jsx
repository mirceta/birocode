import { useMemo } from 'react';
import { UNASSIGNED, FLAGS, chipsOf, emptyFilter, facets, isNarrowed, toggleValue } from './taskFilters';
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
// `views` are taskView() records for every task on the board; `extra` is rendered at
// the end of the bar (the Task graph puts its "hide filtered" toggle there).

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

  return (
    <div className={`tf tf--${view}`} role="search" aria-label="Filter tasks" data-task-filter-bar={view}>
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
              label={c.key === 'blocked' ? '⛔ blocked' : c.key}
              title={flagTitle(c.key)}
              onClick={() => toggle('flags', c.key)}
              attr={{ 'data-flag-chip': c.key }}
              dim={c.count === 0 && !c.on}
            />
          ))}
        </div>
      )}
      <span className="tf__spacer" />
      <span className="tf__shown" data-shown={fx.shown} data-total={fx.total}>{narrowed ? `${fx.shown} of ${fx.total} tasks` : `${fx.total} tasks`}</span>
      {narrowed && (
        <button type="button" className="tf__clear" onClick={() => setFilter((f) => ({ ...emptyFilter(), hide: f.hide }))} title="Show every task again" data-clear-task-filters>× clear</button>
      )}
      {extra}
    </div>
  );
}
