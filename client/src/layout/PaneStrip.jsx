import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useFeature } from '../context/UiModeContext';
import { useUiSettings } from '../context/UiSettingsContext';
import { useT } from '../i18n/LanguageContext';
import { useOrderedTabs } from './tabRegistry';

// Multi-pane desktop layout (plans/multi-pane.md): a sliding window over the
// nav's tab list, centered on the active route. No pane management UI — the
// tab order decides which neighbors appear, and since plans/settings-tab.md
// that order is the user's own (layout/tabRegistry.jsx is the single source).
// Per plans/pane-widths.md each tab spans a user-set 1-4 slot units; weights
// consume the slot budget, so a wide tab means fewer visible neighbours.

const MIN_PANE_WIDTH = 420;
const MAX_PANES = 5;

const paneCountNow = () =>
  Math.max(1, Math.min(MAX_PANES, Math.floor(window.innerWidth / MIN_PANE_WIDTH)));

export function useMultiPane() {
  const tabs = useOrderedTabs();
  const enabled = useFeature('multiPane');
  const { tabWidths } = useUiSettings();
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

  // Grow a contiguous window around the active tab, spending the slot
  // budget on each tab's weight. The active tab is always included, even
  // when its weight alone exceeds the budget.
  const weight = (i) => Math.max(1, Math.min(4, tabWidths[tabs[i].key] || 1));
  let lo = active;
  let hi = active;
  let budget = paneCount - weight(active);
  for (;;) {
    const left = lo > 0 && budget >= weight(lo - 1);
    const right = hi < tabs.length - 1 && budget >= weight(hi + 1);
    if (!left && !right) break;
    // Alternate sides like the old centered window: prefer the side that
    // keeps the window balanced around the active tab.
    if (right && (!left || hi - active <= active - lo)) {
      hi += 1;
      budget -= weight(hi);
    } else {
      lo -= 1;
      budget -= weight(lo);
    }
  }
  if (lo === hi) return { multi: false, panes: [], activeKey: null };

  const panes = tabs.slice(lo, hi + 1).map((tab, i) => ({ ...tab, width: weight(lo + i) }));
  return { multi: true, panes, activeKey: tabs[active].key };
}

export default function PaneStrip({ panes, activeKey }) {
  const { t } = useT();
  return (
    <main className="pane-strip">
      {panes.map((pane) => (
        <section
          key={pane.key}
          className={`pane${pane.key === activeKey ? ' pane--active' : ''}`}
          style={pane.width > 1 ? { flexGrow: pane.width } : undefined}
        >
          <Link to={pane.path} className="pane__bar">{t(pane.labelKey)}</Link>
          <div className="app-content">{pane.element}</div>
        </section>
      ))}
    </main>
  );
}
