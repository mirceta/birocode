import { NavLink } from 'react-router-dom';

// Fixed bottom navigation. Every screen is one tap from every other screen.
// Labels are deliberately plain -- Chat / Files / History, no jargon.
const TABS = [
  { to: '/', label: 'Chat', icon: 'C', end: true },
  { to: '/files', label: 'Files', icon: 'F' },
  { to: '/history', label: 'History', icon: 'H' },
];

export default function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {TABS.map((tab) => (
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
