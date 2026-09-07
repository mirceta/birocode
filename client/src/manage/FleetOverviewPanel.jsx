import { overviewGroups } from './fleetStatusTabs';

// One row of a machine overview: a value with its tone, or a usage meter. Shared by the
// Fleet Status Overview tab and the header strip's Machine tile (openspec
// fleet-overview-honest) so both surfaces render the same record the same way. An
// unknown value is spelled out with its reason — dark, italic, never a pale blank.
export function OverviewRow({ row }) {
  const tone = row.tone || 'plain';
  return (
    <div className="fs__ov-row" data-ov-label={row.label} data-ov-tone={tone}>
      <dt className="fs__ov-k">{row.label}</dt>
      {row.kind === 'meter' ? (
        <dd className={`fs__ov-v fs__ov-v--meter fs__ov-v--${tone}`}>
          <span className="fs__ov-bar" aria-hidden="true"><span className="fs__ov-fill" style={{ width: `${row.percent}%` }} /></span>
          <span className="fs__ov-meter-txt">{row.value}</span>
        </dd>
      ) : (
        <dd className={`fs__ov-v fs__ov-v--${tone}`}>{row.value}</dd>
      )}
    </div>
  );
}

export function OverviewGroups({ groups, compact = false }) {
  return (
    <div className={`fs__overview${compact ? ' fs__overview--compact' : ''}`}>
      {groups.map((g) => (
        <section key={g.key} className="fs__ov-group" data-ov-group={g.key} aria-label={g.title}>
          <h4 className="fs__ov-title">{g.title}</h4>
          <dl className="fs__ov-rows">
            {g.rows.map((r) => <OverviewRow key={r.label} row={r} />)}
          </dl>
        </section>
      ))}
    </div>
  );
}

// The Overview tab body for one machine: every fact the machine's own status strip
// shows — harness build, host clock, accounts, Claude plan usage (5-hour + weekly +
// per-model), admin state and fleet posture — from the machine's overview record.
export default function FleetOverviewPanel({ machine }) {
  const groups = overviewGroups(machine?.overview, machine);
  return (
    <div data-fleet-overview={machine?.sourceId}>
      <OverviewGroups groups={groups} />
    </div>
  );
}
