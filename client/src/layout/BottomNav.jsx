import { NavLink } from 'react-router-dom';
import { useDock } from '../context/DockContext';
import { useFeature } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';

export default function BottomNav() {
  const { t } = useT();
  const { tabs: agentTabs } = useDock();
  const showAppTab = useFeature('appTab');
  const showAgents = useFeature('agentDock');
  const showGit = useFeature('gitTab');
  const showScreen = useFeature('screenTab');

  // Badge reflects the most urgent agent status: running > error > done.
  const agentBadge =
    agentTabs.some((a) => a.status === 'running') ? 'running'
    : agentTabs.some((a) => a.status === 'error') ? 'error'
    : agentTabs.some((a) => a.status === 'done') ? 'done'
    : null;

  const tabs = [
    { to: '/studio', label: t('nav.chat'), icon: 'C', end: true },
    { to: '/studio/files', label: t('nav.files'), icon: 'F' },
    { to: '/studio/history', label: t('nav.history'), icon: 'H' },
    ...(showAgents ? [{ to: '/studio/agents', label: t('nav.agents'), icon: 'A', badge: agentBadge }] : []),
    ...(showGit ? [{ to: '/studio/git', label: t('nav.git'), icon: '⎇' }] : []),
    ...(showScreen ? [{ to: '/studio/screen', label: t('nav.screen'), icon: 'S' }] : []),
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
            `bottom-nav__item${isActive ? ' is-active' : ''}`
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
