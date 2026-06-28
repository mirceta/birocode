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
  if (lo === hi) {
    // A tab widened to span the whole visible budget consumes every slot, so no
    // neighbours fit. Don't fall back to the classic single-column view -- that
    // view is capped at --max-width and centered, which is exactly the
    // "wide tab is centered with gutters" bug. Render it as a lone pane in the
    // uncapped strip (.app-frame--multi) so it fills the full width. A tab that
    // is alone only because it has no neighbours (weight 1) keeps the classic
    // single view.
    if (weight(active) > 1) {
      return {
        multi: true,
        panes: [{ ...tabs[active], width: weight(active) }],
        activeKey: tabs[active].key,
      };
    }
    return { multi: false, panes: [], activeKey: null };
  }

  const panes = tabs.slice(lo, hi + 1).map((tab, i) => ({ ...tab, width: weight(lo + i) }));
  return { multi: true, panes, activeKey: tabs[active].key };
}

export default function PaneStrip({ panes, activeKey }) {
  const { t } = useT();
  const { tabWidths, saveTabWidths } = useUiSettings();
  const orderKeys = useOrderedTabs({ includeHidden: true }).map((tab) => tab.key);
  // Span steppers stay a multi-pane affordance: only with two or more visible
  // panes (a lone full-span pane shows none; shrink it from the Settings tab).
  const showSpan = useFeature('paneSpanButtons') && panes.length > 1;

  // The pane bar's -/+ buttons are a second front-end onto the one per-tab
  // span the Settings tab configures — same map, same store. Mirror Settings'
  // setWidth (Settings.jsx): keep the map sparse (1 = absent) and clamp 1-4.
  // saveTabWidths' PUT replaces tabOrder, so send the FULL current order
  // (include hidden, like Settings does) — sending only the visible panes
  // would truncate the saved order.
  const setSpan = (key, v) => {
    const clamped = Math.max(1, Math.min(4, v));
    const next = { ...tabWidths };
    if (clamped <= 1) delete next[key];
    else next[key] = clamped;
    saveTabWidths(orderKeys, next);
  };

  return (
    <main className="pane-strip">
      {panes.map((pane) => (
        <section
          key={pane.key}
          className={`pane${pane.key === activeKey ? ' pane--active' : ''}`}
          style={pane.width > 1 ? { flexGrow: pane.width } : undefined}
        >
          <div className="pane__bar">
            <Link to={pane.path} className="pane__bar-label">{t(pane.labelKey)}</Link>
            {showSpan && (
              <span className="pane__span">
                <button
                  type="button"
                  className="pane__span-btn"
                  aria-label={t('pane.spanDec')}
                  disabled={pane.width <= 1}
                  onClick={() => setSpan(pane.key, pane.width - 1)}
                >
                  −
                </button>
                <button
                  type="button"
                  className="pane__span-btn"
                  aria-label={t('pane.spanInc')}
                  disabled={pane.width >= 4}
                  onClick={() => setSpan(pane.key, pane.width + 1)}
                >
                  +
                </button>
              </span>
            )}
          </div>
          <div className="app-content">{pane.element}</div>
        </section>
      ))}
    </main>
  );
}
