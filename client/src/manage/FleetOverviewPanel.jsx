import { overviewGroups } from './fleetStatusTabs';

// The Overview tab body for one machine (openspec fleet-status-panels): the same
// facts the harness's own Status strip shows — harness version + build, host info,
// host active (the operator gate) + admin active, and the GitHub / Claude accounts
// in use — grouped so nothing is crammed. Every value falls back to "n/a" (an older
// peer sends no overview), so it degrades, never errors.
export default function FleetOverviewPanel({ machine }) {
  const groups = overviewGroups(machine?.overview, machine);
  return (
    <div className="fs__overview" data-fleet-overview={machine?.sourceId}>
      {groups.map((g) => (
        <div key={g.key} className="fs__ov-group" data-ov-group={g.key}>
          <div className="fs__ov-title">{g.title}</div>
          <dl className="fs__ov-rows">
            {g.rows.map((r) => (
              <div key={r.label} className="fs__ov-row">
                <dt className="fs__ov-k">{r.label}</dt>
                <dd className={`fs__ov-v${r.value === 'n/a' ? ' fs__ov-v--na' : ''}`}>{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
