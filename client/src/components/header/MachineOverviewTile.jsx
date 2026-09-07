import { useEffect, useRef, useState } from 'react';
import { apiGet } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';
import { overviewGroups, overviewSummary } from '../../manage/fleetStatusTabs';
import { OverviewGroups } from '../../manage/FleetOverviewPanel';
import './machineOverviewTile.css';

// The "Machine" tile of the header status strip (openspec fleet-overview-honest): this
// machine as the FLEET sees it — the same overview record the harness puts in its
// describe (GET /api/arch/overview), rendered by the same rows the Fleet Status Overview
// tab uses. So the strip and the fleet can never disagree: what a peer's hub shows
// about this box is exactly what this tile shows. Collapsed = a one-line summary;
// expanded = the grouped rows. Polls only while the strip is expanded (the strip
// unmounts it otherwise).
const POLL_MS = 30_000;
const COLLAPSE_KEY = 'claudeweb_machine_overview_collapsed';

function readCollapsed() {
  try { return localStorage.getItem(COLLAPSE_KEY) !== '0'; } catch { return true; }
}

export default function MachineOverviewTile() {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const pull = async () => {
      try {
        const d = await apiGet('/arch/overview');
        if (alive.current) { setData(d); setError(''); }
      } catch (e) {
        if (alive.current) setError(e?.message || String(e));
      }
    };
    pull();
    const id = setInterval(() => { if (!document.hidden) pull(); }, POLL_MS);
    return () => { alive.current = false; clearInterval(id); };
  }, []);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* private mode */ }
      return next;
    });
  };

  const groups = data ? overviewGroups(data.overview, data) : null;
  const summary = groups ? overviewSummary(groups) : (error ? t('machineOverview.error') : t('machineOverview.loading'));

  return (
    <div className={`mo${collapsed ? ' mo--collapsed' : ''}`} data-machine-overview>
      <button type="button" className="mo__hd" onClick={toggle} aria-expanded={!collapsed} title={t('machineOverview.title')}>
        <span className="mo__kind">{t('machineOverview.kind')}</span>
        <span className="mo__name">{data?.machine || '…'}</span>
        <span className="mo__summary" data-machine-summary>{summary}</span>
        <span className="mo__chevron" aria-hidden="true">⌄</span>
      </button>
      {!collapsed && (
        <div className="mo__body">
          <div className="mo__note">{t('machineOverview.note')}</div>
          {groups ? <OverviewGroups groups={groups} compact /> : <div className="mo__note">{error || t('machineOverview.loading')}</div>}
        </div>
      )}
    </div>
  );
}
