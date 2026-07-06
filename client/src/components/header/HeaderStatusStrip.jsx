import { useState } from 'react';
import { useFeature } from '../../context/UiModeContext';
import { useT } from '../../i18n/LanguageContext';
import Scoreboard from '../dashboard/Scoreboard';
import AccountChips from '../dashboard/AccountChips';
import HostClock from '../dashboard/HostClock';
import './headerStrip.css';

// Header status strip (openspec add-header-status-strip): the at-a-glance
// status surface — Scoreboard, GitHub/Claude account chips, host clock —
// promoted out of the Dashboard to a full-width collapsible bar directly under
// the app header, visible on every studio screen (including the open
// Dashboard overlay). Collapsed by default: the sections are UNMOUNTED while
// collapsed, so their pollers don't run and the default state adds zero API
// traffic. The sections keep their own inner collapse keys unchanged.
const COLLAPSE_KEY = 'claudeweb_header_strip_collapsed';

function readCollapsed() {
  try {
    // Absent key means collapsed — the strip must default closed on phones.
    return localStorage.getItem(COLLAPSE_KEY) !== '0';
  } catch {
    return true;
  }
}

export default function HeaderStatusStrip() {
  const { t } = useT();
  const stripOn = useFeature('headerStatusStrip');
  const accountChipsOn = useFeature('accountChips');
  const hostClockOn = useFeature('hostClock');
  const [collapsed, setCollapsed] = useState(readCollapsed);

  if (!stripOn) return null;

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* private mode — in-memory only */
      }
      return next;
    });
  }

  return (
    <div className={`header-strip${collapsed ? ' header-strip--collapsed' : ''}`}>
      <button
        type="button"
        className="header-strip__toggle"
        onClick={toggle}
        aria-expanded={!collapsed}
        title={collapsed ? t('headerStrip.expand') : t('headerStrip.collapse')}
      >
        <span className="header-strip__title">{t('headerStrip.title')}</span>
        {collapsed && (
          <span className="header-strip__summary">{t('headerStrip.summary')}</span>
        )}
        <span className="header-strip__chevron" aria-hidden="true">⌄</span>
      </button>
      {!collapsed && (
        <div className="header-strip__row">
          <Scoreboard />
          {accountChipsOn && <AccountChips />}
          {hostClockOn && <HostClock />}
        </div>
      )}
    </div>
  );
}
