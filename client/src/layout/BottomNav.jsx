import { NavLink } from 'react-router-dom';
import { useT } from '../i18n/LanguageContext';

export default function BottomNav() {
  const { t } = useT();
  const tabs = [
    { to: '/studio', label: t('nav.chat'), icon: 'C', end: true },
    { to: '/studio/files', label: t('nav.files'), icon: 'F' },
    { to: '/studio/history', label: t('nav.history'), icon: 'H' },
    { to: '/studio/app', label: t('nav.app'), icon: '▶' },
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
          </span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
