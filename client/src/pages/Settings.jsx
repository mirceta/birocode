import { useLayoutEffect, useRef, useState } from 'react';
import { useUiSettings } from '../context/UiSettingsContext';
import { useT } from '../i18n/LanguageContext';
import { useOrderedTabs } from '../layout/tabRegistry';
import './settings.css';

// Settings tab (plans/settings-tab.md). Section 1: Tab order — drag a card
// (pointer-based, touch included) or tap ↑/↓; the REAL bottom nav reorders
// live as you move (the saved order is optimistic, backend-synced). FLIP
// animation: displaced cards slide instead of snapping.
// Each card also carries a 1-4 pane-width stepper (plans/pane-widths.md);
// widths only affect the desktop multi-pane strip. A show/hide toggle
// (plans/tab-visibility.md) drops a tab from the advanced nav — claude and
// settings are non-hideable. This list uses includeHidden so hidden tabs
// stay listed (dimmed) and can be re-enabled.
const NON_HIDEABLE = new Set(['claude', 'settings']);

export default function Settings() {
  const { t } = useT();
  const tabs = useOrderedTabs({ includeHidden: true });
  const { tabWidths, hiddenTabs, saveTabOrder, saveTabWidths, saveHiddenTabs } = useUiSettings();

  const [drag, setDrag] = useState(null); // { key, startPointerY, pointerY, startTop }
  const itemRefs = useRef(new Map());
  const prevTops = useRef(new Map());

  const keys = tabs.map((t2) => t2.key);

  // FLIP: when the order changes, slide each card from its previous slot to
  // the new one (except the one being dragged — it follows the pointer).
  useLayoutEffect(() => {
    const tops = new Map();
    for (const [key, el] of itemRefs.current) {
      if (!el) continue;
      tops.set(key, el.offsetTop);
      const prev = prevTops.current.get(key);
      if (prev !== undefined && prev !== el.offsetTop && key !== drag?.key) {
        el.style.transition = 'none';
        el.style.transform = `translateY(${prev - el.offsetTop}px)`;
        requestAnimationFrame(() => {
          el.style.transition = 'transform 160ms ease';
          el.style.transform = '';
        });
      }
    }
    prevTops.current = tops;
  });

  const reorder = (from, to) => {
    if (to < 0 || to >= keys.length || from === to) return;
    const next = [...keys];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    saveTabOrder(next); // optimistic: nav + this list obey instantly
  };

  const onPointerDown = (e, key) => {
    const el = itemRefs.current.get(key);
    if (!el) return;
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    setDrag({ key, startPointerY: e.clientY, pointerY: e.clientY, startTop: el.offsetTop });
  };

  const onPointerMove = (e) => {
    if (!drag) return;
    const el = itemRefs.current.get(drag.key);
    if (!el) return;
    setDrag({ ...drag, pointerY: e.clientY });

    // Did the dragged card's center cross a neighbour's midpoint?
    const from = keys.indexOf(drag.key);
    const centerY = el.getBoundingClientRect().top + el.offsetHeight / 2;
    for (let i = 0; i < keys.length; i++) {
      if (i === from) continue;
      const other = itemRefs.current.get(keys[i]);
      if (!other) continue;
      const r = other.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if ((i < from && centerY < mid) || (i > from && centerY > mid)) {
        reorder(from, i);
        break;
      }
    }
  };

  const endDrag = () => setDrag(null);

  // Pane width stepper: keep the map sparse (1 = absent). PUT requires
  // tabOrder, so we send the current order along — a harmless no-op save.
  const setWidth = (key, v) => {
    const next = { ...tabWidths };
    if (v <= 1) delete next[key];
    else next[key] = v;
    saveTabWidths(keys, next);
  };

  // Show/hide a tab in the advanced nav. Sparse list (absent = shown).
  const setHidden = (key, hide) => {
    const next = hide
      ? [...new Set([...hiddenTabs, key])]
      : hiddenTabs.filter((k) => k !== key);
    saveHiddenTabs(keys, next);
  };

  const dragStyle = (key) => {
    if (drag?.key !== key) return undefined;
    const el = itemRefs.current.get(key);
    const slotShift = el ? el.offsetTop - drag.startTop : 0;
    return {
      transform: `translateY(${drag.pointerY - drag.startPointerY - slotShift}px)`,
      zIndex: 5,
      transition: 'none',
    };
  };

  return (
    <div className="settings-page">
      <section className="settings-section">
        <h3 className="settings-section__title">{t('settings.tabOrder')}</h3>
        <p className="settings-section__hint">{t('settings.tabOrderHint')}</p>

        <ul className="taborder" onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
          {tabs.map((tab, i) => (
            <li
              key={tab.key}
              ref={(el) => itemRefs.current.set(tab.key, el)}
              className={`taborder__item${drag?.key === tab.key ? ' is-dragging' : ''}${tab.hidden ? ' is-hidden' : ''}`}
              style={dragStyle(tab.key)}
            >
              <span
                className="taborder__handle"
                aria-hidden="true"
                onPointerDown={(e) => onPointerDown(e, tab.key)}
              >
                ≡
              </span>
              <span className="taborder__icon" aria-hidden="true">{tab.icon}</span>
              <span className="taborder__name">
                {tab.key === 'claude' ? t('settings.claudeSlot') : t(tab.labelKey)}
              </span>
              {tab.advancedOnly && <span className="taborder__adv">{t('settings.advancedBadge')}</span>}
              {!NON_HIDEABLE.has(tab.key) && (
                <button
                  type="button"
                  className={`taborder__toggle${tab.hidden ? '' : ' is-on'}`}
                  role="switch"
                  aria-checked={!tab.hidden}
                  aria-label={tab.hidden ? t('settings.tabShow') : t('settings.tabHide')}
                  title={t('settings.tabHiddenHint')}
                  onClick={() => setHidden(tab.key, !tab.hidden)}
                >
                  <span className="taborder__toggle-knob" aria-hidden="true" />
                </button>
              )}
              <span className="taborder__width" title={t('settings.paneWidthHint')}>
                <button
                  type="button"
                  className="taborder__btn"
                  aria-label={t('settings.widthDec')}
                  disabled={(tabWidths[tab.key] || 1) <= 1}
                  onClick={() => setWidth(tab.key, (tabWidths[tab.key] || 1) - 1)}
                >
                  −
                </button>
                <span className="taborder__width-val">{tabWidths[tab.key] || 1}×</span>
                <button
                  type="button"
                  className="taborder__btn"
                  aria-label={t('settings.widthInc')}
                  disabled={(tabWidths[tab.key] || 1) >= 4}
                  onClick={() => setWidth(tab.key, (tabWidths[tab.key] || 1) + 1)}
                >
                  +
                </button>
              </span>
              <span className="taborder__btns">
                <button
                  type="button"
                  className="taborder__btn"
                  aria-label={t('settings.moveUp')}
                  disabled={i === 0}
                  onClick={() => reorder(i, i - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="taborder__btn"
                  aria-label={t('settings.moveDown')}
                  disabled={i === tabs.length - 1}
                  onClick={() => reorder(i, i + 1)}
                >
                  ↓
                </button>
              </span>
            </li>
          ))}
        </ul>

        <button type="button" className="settings-restore" onClick={() => saveTabOrder([])}>
          {t('settings.restoreDefault')}
        </button>
      </section>

      <section className="settings-section">
        <h3 className="settings-section__title">{t('switcher.title')}</h3>
        <p className="settings-section__hint">{t('settings.switcherHint')}</p>
        <a className="settings-restore" href="/switch">{t('settings.openSwitcher')}</a>
      </section>
    </div>
  );
}
