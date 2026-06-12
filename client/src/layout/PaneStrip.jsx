import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useFeature } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';
import Chat from '../pages/Chat';
import Files from '../pages/Files';
import History from '../pages/History';
import AppRun from '../pages/AppRun';
import Agents from '../pages/Agents';
import Git from '../pages/Git';
import Plan from '../pages/Plan';
import Screen from '../pages/Screen';
import Projects from '../pages/Projects';
import Guests from '../pages/Guests';

// Multi-pane desktop layout (plans/multi-pane.md): a sliding window over the
// nav's tab list, centered on the active route. No pane management UI — the
// tab order decides which neighbors appear.

const MIN_PANE_WIDTH = 420;
const MAX_PANES = 4;

const paneCountNow = () =>
  Math.max(1, Math.min(MAX_PANES, Math.floor(window.innerWidth / MIN_PANE_WIDTH)));

// Same tabs, same order, same feature gates as BottomNav.
function useVisibleTabs() {
  const showAppTab = useFeature('appTab');
  const showAgents = useFeature('agentDock');
  const showGit = useFeature('gitTab');
  const showPlan = useFeature('planTab');
  const showScreen = useFeature('screenTab');
  const showProjects = useFeature('projectsTab');
  const showGuests = useFeature('guestsTab');
  // Order must match BottomNav.jsx — it decides pane neighbours.
  return [
    { key: 'chat', path: '/studio', label: 'nav.chat', element: <Chat /> },
    { key: 'files', path: '/studio/files', label: 'nav.files', element: <Files /> },
    ...(showPlan ? [{ key: 'plan', path: '/studio/plan', label: 'nav.plan', element: <Plan /> }] : []),
    ...(showGit ? [{ key: 'git', path: '/studio/git', label: 'nav.git', element: <Git /> }] : []),
    { key: 'history', path: '/studio/history', label: 'nav.history', element: <History /> },
    ...(showAgents ? [{ key: 'agents', path: '/studio/agents', label: 'nav.agents', element: <Agents /> }] : []),
    ...(showScreen ? [{ key: 'screen', path: '/studio/screen', label: 'nav.screen', element: <Screen /> }] : []),
    ...(showProjects ? [{ key: 'projects', path: '/studio/projects', label: 'nav.projects', element: <Projects /> }] : []),
    ...(showGuests ? [{ key: 'guests', path: '/studio/guests', label: 'nav.guests', element: <Guests /> }] : []),
    ...(showAppTab ? [{ key: 'app', path: '/studio/app', label: 'nav.app', element: <AppRun /> }] : []),
  ];
}

export function useMultiPane() {
  const tabs = useVisibleTabs();
  const enabled = useFeature('multiPane');
  const { pathname } = useLocation();
  const [paneCount, setPaneCount] = useState(paneCountNow);

  useEffect(() => {
    const onResize = () => setPaneCount(paneCountNow());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const path = pathname.replace(/\/+$/, '') || '/studio';
  const active = tabs.findIndex((tab) => tab.path === path);
  if (!enabled || paneCount < 2 || active === -1) {
    return { multi: false, panes: [], activeKey: null };
  }
  const n = Math.min(paneCount, tabs.length);
  const start = Math.max(0, Math.min(active - Math.floor((n - 1) / 2), tabs.length - n));
  return { multi: true, panes: tabs.slice(start, start + n), activeKey: tabs[active].key };
}

export default function PaneStrip({ panes, activeKey }) {
  const { t } = useT();
  return (
    <main className="pane-strip">
      {panes.map((pane) => (
        <section
          key={pane.key}
          className={`pane${pane.key === activeKey ? ' pane--active' : ''}`}
        >
          <Link to={pane.path} className="pane__bar">{t(pane.label)}</Link>
          <div className="app-content">{pane.element}</div>
        </section>
      ))}
    </main>
  );
}
