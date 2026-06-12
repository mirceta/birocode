import { NavLink } from 'react-router-dom';
import { useDock } from '../context/DockContext';
import { useT } from '../i18n/LanguageContext';
import { useOrderedTabs } from './tabRegistry';

// The nav renders THE canonical tab list (layout/tabRegistry.jsx) in the
// user's saved order (plans/settings-tab.md). Tab definitions and ordering
// live there — this component only draws.
export default function BottomNav() {
  const { t } = useT();
  const { tabs: agentTabs } = useDock();
  const tabs = useOrderedTabs();

  // Badge reflects the most urgent agent status: running > error > done.
  const agentBadge =
    agentTabs.some((a) => a.status === 'running') ? 'running'
    : agentTabs.some((a) => a.status === 'error') ? 'error'
    : agentTabs.some((a) => a.status === 'done') ? 'done'
    : null;

  return (
    <nav className="bottom-nav" aria-label={t('nav.aria')}>
      {tabs.map((tab) => {
        const badge = tab.key === 'agents' ? agentBadge : null;
        return (
          <NavLink
            key={tab.key}
            to={tab.path}
            end={tab.end}
            className={({ isActive }) =>
              `bottom-nav__item${(tab.forceActive ?? isActive) ? ' is-active' : ''}`
            }
          >
            <span className="bottom-nav__icon" aria-hidden="true">
              {tab.icon}
              {badge && <span className={`bottom-nav__badge bottom-nav__badge--${badge}`} />}
            </span>
            <span>{t(tab.labelKey)}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
