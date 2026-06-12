import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useFeature } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';
import { useOrderedTabs } from './tabRegistry';

// Multi-pane desktop layout (plans/multi-pane.md): a sliding window over the
// nav's tab list, centered on the active route. No pane management UI — the
// tab order decides which neighbors appear, and since plans/settings-tab.md
// that order is the user's own (layout/tabRegistry.jsx is the single source).

const MIN_PANE_WIDTH = 420;
const MAX_PANES = 5;

const paneCountNow = () =>
  Math.max(1, Math.min(MAX_PANES, Math.floor(window.innerWidth / MIN_PANE_WIDTH)));

export function useMultiPane() {
  const tabs = useOrderedTabs();
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
          <Link to={pane.path} className="pane__bar">{t(pane.labelKey)}</Link>
          <div className="app-content">{pane.element}</div>
        </section>
      ))}
    </main>
  );
}
