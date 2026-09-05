import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '../api/client';
import { useT } from '../i18n/LanguageContext';
import Arch from '../pages/Arch';
import IdeasPanel from '../components/ideas/IdeasPanel';
import './manage.css';

// The Management App (openspec management-app): the fleet-scoped, direction-
// setting surface — Arch agent, Ideas, and the events feed — as ONE static page
// that speaks REST to its home harness only. The Arch and Ideas components are
// the harness's own, lifted unchanged (phase 1 made their mounts movable). The
// events feed is the sibling vanilla page (../index.html) embedded as-is.
//
// Two layouts (openspec management-app-panes): "tabs" shows one view at a time;
// "panes" renders the views side by side like the harness's own multi-pane strip,
// with draggable dividers and a hide button per pane. Both persist per device.
//
// URL-addressable tabs: ?tab=arch|ideas|events wins, else the device's last
// choice, else arch. The harness API root is derived from our own path, the same
// trick the events page uses, so the app works wherever the proxy mounts it.
const TABS = ['arch', 'ideas', 'events'];
const TAB_KEY = 'manageapp.tab';
const LAYOUT_KEY = 'manageapp.layout';
const HIDDEN_KEY = 'manageapp.hidden';
const WEIGHTS_KEY = 'manageapp.paneWeights';
// Below this width side-by-side panes are unreadable: the choice is kept, tabs
// are rendered until the window is wide enough again.
const MIN_PANES_WIDTH = 720;
const MIN_PANE_PX = 220;
const DEFAULT_WEIGHTS = { arch: 2, ideas: 1, events: 1 };

function harnessRoot() {
  const m = window.location.pathname.match(/^(.*?)\/api\/localview\//);
  return m ? m[1] : '';
}

function readTab() {
  try {
    const q = new URLSearchParams(window.location.search).get('tab');
    if (TABS.includes(q)) return q;
    const saved = localStorage.getItem(TAB_KEY);
    return TABS.includes(saved) ? saved : 'arch';
  } catch {
    return 'arch';
  }
}

function readJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key));
    return v === null || v === undefined ? fallback : v;
  } catch {
    return fallback;
  }
}

function readLayout() {
  try {
    const q = new URLSearchParams(window.location.search).get('layout');
    if (q === 'tabs' || q === 'panes') return q;
    const saved = localStorage.getItem(LAYOUT_KEY);
    return saved === 'panes' ? 'panes' : 'tabs';
  } catch {
    return 'tabs';
  }
}

function readHidden() {
  const v = readJson(HIDDEN_KEY, []);
  return Array.isArray(v) ? v.filter((k) => TABS.includes(k)) : [];
}

function readWeights() {
  const v = readJson(WEIGHTS_KEY, {});
  const out = { ...DEFAULT_WEIGHTS };
  for (const k of TABS) if (typeof v?.[k] === 'number' && v[k] > 0) out[k] = v[k];
  return out;
}

function save(key, value) {
  try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch { /* private mode */ }
}

export default function ManageApp() {
  const { t } = useT();
  const [tab, setTabState] = useState(readTab);
  const [layout, setLayoutState] = useState(readLayout);
  const [hidden, setHidden] = useState(readHidden);
  const [weights, setWeights] = useState(readWeights);
  const [wide, setWide] = useState(() => window.innerWidth >= MIN_PANES_WIDTH);
  const [dragging, setDragging] = useState(false);
  const [label, setLabel] = useState('');
  const [authed, setAuthed] = useState(null);
  const bodyRef = useRef(null);

  const setTab = (next) => {
    setTabState(next);
    save(TAB_KEY, next);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('tab', next);
      window.history.replaceState(null, '', u);
    } catch {
      /* private mode / opaque origin */
    }
  };

  const setLayout = (next) => {
    setLayoutState(next);
    save(LAYOUT_KEY, next);
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('layout', next);
      window.history.replaceState(null, '', u);
    } catch {
      /* ignore */
    }
  };

  // Hide/show a pane. The last visible pane cannot be hidden — an empty
  // management surface helps nobody; hide the others or switch to tabs instead.
  const toggleHidden = (key) => {
    setHidden((prev) => {
      const isHidden = prev.includes(key);
      const next = isHidden ? prev.filter((k) => k !== key) : [...prev, key];
      if (!isHidden && TABS.every((k) => next.includes(k))) return prev;
      save(HIDDEN_KEY, next);
      return next;
    });
  };

  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= MIN_PANES_WIDTH);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Who am I managing: the home harness's label (the arch state carries it),
  // and whether the session cookie is good (the only credential this app uses).
  useEffect(() => {
    let alive = true;
    apiGet('/auth/check')
      .then((r) => { if (alive) setAuthed(!!r?.authenticated); })
      .catch(() => { if (alive) setAuthed(false); });
    apiGet('/arch')
      .then((s) => { if (alive && s?.fleet?.selfLabel) setLabel(s.fleet.selfLabel); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Divider drag: the two panes either side of the gutter trade width; the
  // weights are re-derived from their pixel widths so the flex layout stays
  // proportional after a window resize. Pointer capture keeps the drag alive
  // over the iframes (which also get pointer-events:none while dragging).
  const startDrag = useCallback((e, leftKey, rightKey) => {
    const body = bodyRef.current;
    if (!body) return;
    const leftEl = body.querySelector(`[data-pane="${leftKey}"]`);
    const rightEl = body.querySelector(`[data-pane="${rightKey}"]`);
    if (!leftEl || !rightEl) return;
    e.preventDefault();
    const startX = e.clientX;
    const leftW = leftEl.getBoundingClientRect().width;
    const rightW = rightEl.getBoundingClientRect().width;
    const pair = leftW + rightW;
    const pairWeight = (weights[leftKey] || 1) + (weights[rightKey] || 1);
    const gutter = e.currentTarget;
    gutter.setPointerCapture?.(e.pointerId);
    setDragging(true);
    let latest = weights;
    const onMove = (ev) => {
      const dx = ev.clientX - startX;
      const newLeft = Math.max(MIN_PANE_PX, Math.min(pair - MIN_PANE_PX, leftW + dx));
      const share = newLeft / pair;
      latest = { ...weights, [leftKey]: pairWeight * share, [rightKey]: pairWeight * (1 - share) };
      setWeights(latest);
    };
    const onUp = () => {
      gutter.removeEventListener('pointermove', onMove);
      gutter.removeEventListener('pointerup', onUp);
      gutter.removeEventListener('pointercancel', onUp);
      setDragging(false);
      save(WEIGHTS_KEY, latest);
    };
    gutter.addEventListener('pointermove', onMove);
    gutter.addEventListener('pointerup', onUp);
    gutter.addEventListener('pointercancel', onUp);
  }, [weights]);

  const root = harnessRoot();
  const openHarness = () => { window.top.location.href = `${root}/studio`; };
  const labelOf = (k) => (k === 'arch' ? t('nav.arch') : k === 'ideas' ? t('nav.ideas') : t('manage.events'));
  const panes = layout === 'panes' && wide;
  const visible = panes ? TABS.filter((k) => !hidden.includes(k)) : [tab];

  const renderPane = (k) => (
    k === 'arch' ? <Arch popup onOpenDock={openHarness} />
      : k === 'ideas' ? <IdeasPanel />
        : <iframe className="mg__events" title={t('manage.events')} src="../index.html" />
  );

  return (
    <div className={`mg${panes ? ' mg--panes' : ''}${dragging ? ' mg--dragging' : ''}`}>
      <header className="mg__head">
        <span className="mg__brand">🏛 {t('manage.title')}{label ? <span className="mg__label"> · {label}</span> : null}</span>
        <nav className="mg__tabs" role={panes ? 'group' : 'tablist'} aria-label={t('manage.tabs')}>
          {TABS.map((k) => {
            const on = panes ? !hidden.includes(k) : tab === k;
            return (
              <button
                key={k}
                type="button"
                role={panes ? 'button' : 'tab'}
                aria-selected={panes ? undefined : on}
                aria-pressed={panes ? on : undefined}
                title={panes ? (on ? t('manage.hidePane') : t('manage.showPane')) : undefined}
                className={`mg__tab${on ? ' mg__tab--on' : ''}`}
                data-tab={k}
                onClick={() => (panes ? toggleHidden(k) : setTab(k))}
              >
                {labelOf(k)}
              </button>
            );
          })}
        </nav>
        <div className="mg__layout" role="group" aria-label={t('manage.layout')}>
          <button
            type="button"
            className={`mg__layout-btn${layout === 'tabs' ? ' mg__layout-btn--on' : ''}`}
            aria-pressed={layout === 'tabs'}
            data-layout="tabs"
            onClick={() => setLayout('tabs')}
          >
            ▭ {t('manage.layoutTabs')}
          </button>
          <button
            type="button"
            className={`mg__layout-btn${layout === 'panes' ? ' mg__layout-btn--on' : ''}`}
            aria-pressed={layout === 'panes'}
            data-layout="panes"
            title={wide ? undefined : t('manage.layoutTooNarrow')}
            onClick={() => setLayout('panes')}
          >
            ⊞ {t('manage.layoutPanes')}
          </button>
        </div>
        <a className="mg__open" href={`${root}/studio`} target="_top" title={t('manage.openHarness')}>
          {t('manage.openHarness')} ↗
        </a>
      </header>

      {authed === false && (
        <div className="mg__banner">{t('manage.notLoggedIn')} <a href={`${root}/studio`} target="_top">{t('manage.openHarness')}</a></div>
      )}
      {layout === 'panes' && !wide && (
        <div className="mg__note">{t('manage.layoutTooNarrow')}</div>
      )}

      <main className={`mg__body${panes ? ' mg__body--panes' : ''}`} ref={bodyRef}>
        {visible.map((k, i) => (
          <div key={k} className="mg__slot" style={panes ? { flex: `${weights[k] || 1} 1 0px` } : undefined} data-pane={k}>
            {i > 0 && panes && (
              <div
                className="mg__gutter"
                role="separator"
                aria-orientation="vertical"
                aria-label={t('manage.resize')}
                data-gutter={`${visible[i - 1]}|${k}`}
                onPointerDown={(e) => startDrag(e, visible[i - 1], k)}
              />
            )}
            <section className={`mg__pane mg__pane--${k}`} aria-label={labelOf(k)}>
              {panes && (
                <div className="mg__pane-bar">
                  <span className="mg__pane-label">{labelOf(k)}</span>
                  <button
                    type="button"
                    className="mg__pane-hide"
                    title={t('manage.hidePane')}
                    aria-label={`${t('manage.hidePane')}: ${labelOf(k)}`}
                    disabled={visible.length <= 1}
                    onClick={() => toggleHidden(k)}
                  >
                    ×
                  </button>
                </div>
              )}
              <div className="mg__pane-body">{renderPane(k)}</div>
            </section>
          </div>
        ))}
      </main>
    </div>
  );
}
