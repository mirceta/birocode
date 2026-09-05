import { useEffect, useState } from 'react';
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
// URL-addressable tabs: ?tab=arch|ideas|events wins, else the device's last
// choice, else arch. The harness API root is derived from our own path, the same
// trick the events page uses, so the app works wherever the proxy mounts it.
const TABS = ['arch', 'ideas', 'events'];
const TAB_KEY = 'manageapp.tab';

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

export default function ManageApp() {
  const { t } = useT();
  const [tab, setTabState] = useState(readTab);
  const [label, setLabel] = useState('');
  const [authed, setAuthed] = useState(null);

  const setTab = (next) => {
    setTabState(next);
    try {
      localStorage.setItem(TAB_KEY, next);
      const u = new URL(window.location.href);
      u.searchParams.set('tab', next);
      window.history.replaceState(null, '', u);
    } catch {
      /* private mode / opaque origin */
    }
  };

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

  const root = harnessRoot();
  const openHarness = () => { window.top.location.href = `${root}/studio`; };

  return (
    <div className="mg">
      <header className="mg__head">
        <span className="mg__brand">🏛 {t('manage.title')}{label ? <span className="mg__label"> · {label}</span> : null}</span>
        <nav className="mg__tabs" role="tablist" aria-label={t('manage.tabs')}>
          {TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`mg__tab${tab === k ? ' mg__tab--on' : ''}`}
              onClick={() => setTab(k)}
            >
              {k === 'arch' ? t('nav.arch') : k === 'ideas' ? t('nav.ideas') : t('manage.events')}
            </button>
          ))}
        </nav>
        <a className="mg__open" href={`${root}/studio`} target="_top" title={t('manage.openHarness')}>
          {t('manage.openHarness')} ↗
        </a>
      </header>

      {authed === false && (
        <div className="mg__banner">{t('manage.notLoggedIn')} <a href={`${root}/studio`} target="_top">{t('manage.openHarness')}</a></div>
      )}

      <main className="mg__body">
        {tab === 'arch' && (
          <section className="mg__pane mg__pane--arch" aria-label={t('nav.arch')}>
            <Arch popup onOpenDock={openHarness} />
          </section>
        )}
        {tab === 'ideas' && (
          <section className="mg__pane mg__pane--ideas" aria-label={t('nav.ideas')}>
            <IdeasPanel />
          </section>
        )}
        {tab === 'events' && (
          <section className="mg__pane mg__pane--events" aria-label={t('manage.events')}>
            <iframe className="mg__events" title={t('manage.events')} src="../index.html" />
          </section>
        )}
      </main>
    </div>
  );
}
