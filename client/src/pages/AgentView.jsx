import { useEffect, useState } from 'react';
import { useDock } from '../context/DockContext';
import { useT } from '../i18n/LanguageContext';
import Dashboard from './Dashboard';
import { nextKept, sameKept } from './agentKeepAlive';
import './agentView.css';

// The "Agent" tab of the tabbed (mobile) view (openspec tabbed-agent-tab, fleet task 15502893):
// the active repo agent exactly as it looks on the Agent Dashboard — its "phone" with the
// chat, the lanes (Builder / Ask / Files / Console / Tools), the git row, the loop control,
// flags, the local-app views — because it IS the Dashboard component, rendered in its `solo`
// mode for one dock tab. Nothing is copied: a change to the dashboard phone shows up here.
//
// This tab is always full-screen (Layout.jsx keeps it out of the pane strip) and is the landing
// tab when the harness is opened through "open harness" from the Management board (DockContext's
// ?agent= deep link navigates here). The strip above the phone switches the active agent — the
// same act as picking a dock tab anywhere else.
//
// Agent pages are kept alive like browser tabs (idea #33, openspec projector-agent-tabs): every dock
// this tab has shown stays mounted, hidden, so switching back (the strip, or the phone remote on the
// projector) shows it as it was — no transcript reload, no local-app iframe reload. The first visit
// mounts it; past MAX_KEPT the least recently shown one is unmounted.
export default function AgentView() {
  const { t } = useT();
  const { tabs, activeTabId, setActiveTab, loaded } = useDock();
  const active = tabs.find((x) => x.id === activeTabId) || tabs[0] || null;
  const [kept, setKept] = useState([]);
  const tabIds = tabs.map((x) => x.id).join('|');
  useEffect(() => {
    setKept((prev) => { const next = nextKept(prev, active?.id || null, tabIds ? tabIds.split('|') : []); return sameKept(prev, next) ? prev : next; });
  }, [active?.id, tabIds]);
  // Until the effect ran for this render the active dock is mounted anyway.
  const mounted = active && !kept.includes(active.id) ? [active.id, ...kept] : kept;
  if (!loaded) return <div className="agentview agentview--empty" data-agent-view="loading">{t('agentView.loading')}</div>;
  if (!active) return <div className="agentview agentview--empty" data-agent-view="empty">{t('agentView.empty')}</div>;
  return (
    <div className="agentview" data-agent-view={active.id} data-agent-repo={active.repoId}>
      {tabs.length > 1 && (
        <div className="agentview__strip" role="tablist" aria-label={t('agentView.switch')} data-agent-view-strip>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={tab.id === active.id}
              className={`agentview__chip${tab.id === active.id ? ' agentview__chip--on' : ''}`}
              style={tab.color ? { '--agent-color': tab.color } : undefined}
              onClick={() => setActiveTab(tab.id)}
              data-agent-view-pick={tab.id}
              title={tab.repoName}
            >
              <span className="agentview__dot" aria-hidden="true" />
              {tab.repoName}
            </button>
          ))}
        </div>
      )}
      <div className="agentview__phone">
        <Dashboard solo={active.id} keep={mounted} />
      </div>
    </div>
  );
}
