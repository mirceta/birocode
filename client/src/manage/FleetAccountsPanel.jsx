import { OverviewRow } from './FleetOverviewPanel';
import StatusBadge from './StatusBadge';
import { accountsView, accountsSummary } from './fleetAccounts';

// Fleet Status "By plan / accounts" (openspec fleet-accounts-subtab): the Overview's
// data the other way round — one card per Claude account used anywhere in the fleet,
// its plan and the SAME usage meters the Overview shows (from the same rows), a
// freshness line, and the machines using it. An account no machine uses any more is
// still listed from the hub's last-seen memory, marked stale with when and where it was
// last seen. Kept live by the Fleet Status poll that already feeds the Overview.
export default function FleetAccountsPanel({ machines, lastSeen, now }) {
  const entries = accountsView(machines, lastSeen, now);
  return (
    <div className="fs__accounts" data-fleet-accounts={entries.length}>
      <div className="fs__note fs__dim" data-accounts-summary>{accountsSummary(entries)}</div>
      {entries.length === 0 && <div className="fs__none">No signed-in Claude account on any reachable machine, and nothing remembered yet.</div>}
      {entries.map((e) => (
        <section key={e.key} className={`fs__machine fs__account${e.stale ? ' fs__machine--dark fs__account--stale' : ''}`} data-account={e.key} data-account-live={e.live ? '1' : '0'}>
          <div className="fs__mh">
            <span className={`fs__mdot${e.live ? ' fs__mdot--ok' : ''}`} aria-hidden="true" />
            <span className="fs__mlabel">{e.account}</span>
            <StatusBadge badge={{ key: 'plan', label: e.plan ? `plan ${e.plan}` : 'plan unknown', tone: e.plan ? 'muted' : 'unknown' }} />
            <StatusBadge badge={{ key: 'state', label: e.live ? `in use on ${e.machines.length} machine${e.machines.length === 1 ? '' : 's'}` : 'not in use — last known state', tone: e.live ? 'ok' : 'unknown' }} />
          </div>
          <div className="fs__account-machines" data-account-machines={e.machines.length}>
            <span className="fs__dim">{e.live ? 'used by' : 'was used by'}</span>
            {e.machines.map((m) => (
              <span key={`${m.sourceId || ''}|${m.machine}`} className={`fs__filter fs__account-machine${m.reachable ? '' : ' fs__filter--dark'}`} title={m.self ? 'this machine' : m.reachable ? 'reachable' : e.live ? 'not answering right now' : 'as last seen'} data-account-machine={m.machine}>
              {m.self ? '⌂ ' : ''}{m.machine}
              </span>
            ))}
            {e.machines.length === 0 && <span className="fs__dim">no machine recorded</span>}
          </div>
          <div className="fs__overview">
            <section className="fs__ov-group" data-ov-group="usage" aria-label="Claude plan usage">
              <h4 className="fs__ov-title">Claude plan usage</h4>
              <dl className="fs__ov-rows">
                {e.rows.map((r) => <OverviewRow key={r.label} row={r} />)}
              </dl>
            </section>
          </div>
        </section>
      ))}
    </div>
  );
}
