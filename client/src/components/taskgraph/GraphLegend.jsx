import { hueOf } from './graphColors';

// The two colour legends pinned above the task graph canvas (openspec
// taskgraph-colours): "Machines" (border colours) and "Repositories" (background
// colours). They sit outside the React Flow viewport, so panning or zooming the
// graph never moves them. Clicking an entry APPLIES THE SHARED TASK FILTER (openspec
// task-filters): a machine entry toggles that machine's chip, a repository entry the
// chips of its agents, the neutral entry the Unassigned chip — so the legend and the
// filter bar always agree. `active` is the set of entry keys the filter currently
// selects; `onToggle(key)` flips one ('' = unassigned).
export default function GraphLegend({ kind, title, entries, active, onToggle }) {
  const on = active || new Set();
  const any = on.size > 0;
  return (
    <div className={`tg-legend tg-legend--${kind}`} role="group" aria-label={title} data-legend={kind}>
      <span className="tg-legend__title">{title}</span>
      {entries.length === 0 && <span className="tg-legend__empty">none yet</span>}
      {entries.map((e) => (
        <button
          key={e.key}
          type="button"
          className={`tg-legend__item${on.has(e.key) ? ' is-active' : ''}${any && !on.has(e.key) ? ' is-muted' : ''}`}
          style={{ '--tg-h': String(hueOf(e.slot)) }}
          title={`${e.title || e.label} — click to filter by it`}
          aria-pressed={on.has(e.key)}
          data-key={e.key}
          onClick={() => onToggle(e.key)}
        >
          <span className={`tg-legend__swatch tg-legend__swatch--${kind}`} aria-hidden="true" />
          <span className="tg-legend__label">{e.label}</span>
          {e.count > 0 && <span className="tg-legend__count">{e.count}</span>}
        </button>
      ))}
      <button
        type="button"
        className={`tg-legend__item tg-legend__item--neutral${on.has('') ? ' is-active' : ''}${any && !on.has('') ? ' is-muted' : ''}`}
        title={kind === 'machine' ? 'Tasks with no agent assigned — click to filter' : 'Tasks with no repository — click to filter'}
        aria-pressed={on.has('')}
        data-key=""
        onClick={() => onToggle('')}
      >
        <span className={`tg-legend__swatch tg-legend__swatch--${kind} tg-legend__swatch--neutral`} aria-hidden="true" />
        <span className="tg-legend__label">unassigned</span>
      </button>
    </div>
  );
}
