import { NavLink, useLocation } from 'react-router-dom';
import { getLastClaudeView } from '../components/shared/ClaudeViewToggle';
import { useDock } from '../context/DockContext';
import { useFeature } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';

export default function BottomNav() {
  const { t } = useT();
  const { tabs: agentTabs } = useDock();
  const { pathname } = useLocation();
  const showAppTab = useFeature('appTab');
  const showAgents = useFeature('agentDock');
  const showGit = useFeature('gitTab');
  const showPlan = useFeature('planTab');
  const showScreen = useFeature('screenTab');
  const showTerminal = useFeature('terminalTab');
  const showProjects = useFeature('projectsTab');

  // Chat and Term share the first nav slot (plans/terminal-sessions.md): the
  // slot opens the last-used view and is active on either route; the actual
  // switching lives in the in-page ClaudeViewToggle.
  const path = pathname.replace(/\/+$/, '') || '/studio';
  const termView = showTerminal
    && (path === '/studio/terminal' || (path !== '/studio' && getLastClaudeView() === 'term'));
  const claudeTab = {
    to: termView ? '/studio/terminal' : '/studio',
    label: termView ? t('nav.terminal') : t('nav.chat'),
    icon: termView ? '>_' : 'C',
    end: true,
    forceActive: path === '/studio' || path === '/studio/terminal',
  };

  // Badge reflects the most urgent agent status: running > error > done.
  const agentBadge =
    agentTabs.some((a) => a.status === 'running') ? 'running'
    : agentTabs.some((a) => a.status === 'error') ? 'error'
    : agentTabs.some((a) => a.status === 'done') ? 'done'
    : null;

  // Order matters: it decides which tabs become neighbours in the multi-pane
  // desktop view (plans/multi-pane.md). Keep this in sync with PaneStrip.jsx.
  const tabs = [
    claudeTab,
    { to: '/studio/files', label: t('nav.files'), icon: 'F' },
    ...(showPlan ? [{ to: '/studio/plan', label: t('nav.plan'), icon: '☰' }] : []),
    ...(showGit ? [{ to: '/studio/git', label: t('nav.git'), icon: '⎇' }] : []),
    { to: '/studio/history', label: t('nav.history'), icon: 'H' },
    ...(showAgents ? [{ to: '/studio/agents', label: t('nav.agents'), icon: 'A', badge: agentBadge }] : []),
    ...(showScreen ? [{ to: '/studio/screen', label: t('nav.screen'), icon: 'S' }] : []),
    ...(showProjects ? [{ to: '/studio/projects', label: t('nav.projects'), icon: 'P' }] : []),
    ...(showAppTab ? [{ to: '/studio/app', label: t('nav.app'), icon: '▶' }] : []),
  ];

  return (
    <nav className="bottom-nav" aria-label={t('nav.aria')}>
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            `bottom-nav__item${(tab.forceActive ?? isActive) ? ' is-active' : ''}`
          }
        >
          <span className="bottom-nav__icon" aria-hidden="true">
            {tab.icon}
            {tab.badge && <span className={`bottom-nav__badge bottom-nav__badge--${tab.badge}`} />}
          </span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
