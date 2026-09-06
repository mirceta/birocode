import { hueOf } from './graphColors';

// The two colour legends pinned above the task graph canvas (openspec
// taskgraph-colours): "Machines" (border colours) and "Repositories" (background
// colours). They sit outside the React Flow viewport, so panning or zooming the
// graph never moves them. Clicking an entry focuses it (dims every task that does
// not match); clicking again clears.
export default function GraphLegend({ kind, title, entries, focus, onFocus }) {
  const active = focus?.kind === kind ? focus.key : null;
  return (
    <div className={`tg-legend tg-legend--${kind}`} role="group" aria-label={title} data-legend={kind}>
      <span className="tg-legend__title">{title}</span>
      {entries.length === 0 && <span className="tg-legend__empty">none yet</span>}
      {entries.map((e) => (
        <button
          key={e.key}
          type="button"
          className={`tg-legend__item${active === e.key ? ' is-active' : ''}${active && active !== e.key ? ' is-muted' : ''}`}
          style={{ '--tg-h': String(hueOf(e.slot)) }}
          title={e.title || e.label}
          aria-pressed={active === e.key}
          data-key={e.key}
          onClick={() => onFocus(active === e.key ? null : { kind, key: e.key })}
        >
          <span className={`tg-legend__swatch tg-legend__swatch--${kind}`} aria-hidden="true" />
          <span className="tg-legend__label">{e.label}</span>
          {e.count > 0 && <span className="tg-legend__count">{e.count}</span>}
        </button>
      ))}
      <button
        type="button"
        className={`tg-legend__item tg-legend__item--neutral${active === '' ? ' is-active' : ''}${active && active !== '' ? ' is-muted' : ''}`}
        title={kind === 'machine' ? 'Tasks with no agent assigned' : 'Tasks with no repository'}
        aria-pressed={active === ''}
        data-key=""
        onClick={() => onFocus(active === '' ? null : { kind, key: '' })}
      >
        <span className={`tg-legend__swatch tg-legend__swatch--${kind} tg-legend__swatch--neutral`} aria-hidden="true" />
        <span className="tg-legend__label">unassigned</span>
      </button>
    </div>
  );
}
