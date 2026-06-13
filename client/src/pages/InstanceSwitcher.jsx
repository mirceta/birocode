import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/LanguageContext';
import './instance-switcher.css';

// Instance switcher (plans/instance-switcher.md): a full-screen PWA shell that
// swipes between this Harness running on different computers. Each slide is an
// iframe to one instance's origin; the instance gates itself (we never read
// into a cross-origin frame). The instance list is DEVICE-LOCAL (localStorage,
// decision 1) — it is per-device/per-network and never backend-synced.
const STORAGE_KEY = 'claudeweb_instances';
const SWIPE_THRESHOLD = 50; // px a horizontal drag must travel to flip slides

function loadInstances() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((i) => i && i.url) : [];
  } catch {
    return [];
  }
}

function saveInstances(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* private mode / quota — the in-memory state still drives the UI */
  }
}

// Accept "deskpc:5099" as well as a full URL; default to http on the LAN.
function normalizeUrl(raw) {
  const v = raw.trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `http://${v}`;
}

export default function InstanceSwitcher() {
  const { t } = useT();
  const [instances, setInstances] = useState(loadInstances);
  const [active, setActive] = useState(0);
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const touchX = useRef(null);

  // Persist + keep active in range whenever the list changes.
  useEffect(() => {
    saveInstances(instances);
    setActive((a) => Math.max(0, Math.min(a, instances.length - 1)));
  }, [instances]);

  // Empty config opens straight into the edit panel so there is no blank slate.
  useEffect(() => {
    if (instances.length === 0) setEditing(true);
  }, [instances.length]);

  const go = useCallback((next) => {
    setActive((a) => Math.max(0, Math.min(next, instances.length - 1)));
  }, [instances.length]);

  // Desktop fallback (decision 3): arrow keys move the carousel.
  useEffect(() => {
    const onKey = (e) => {
      if (editing) return;
      if (e.key === 'ArrowLeft') go(active - 1);
      else if (e.key === 'ArrowRight') go(active + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, editing, go]);

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (dx <= -SWIPE_THRESHOLD) go(active + 1);
    else if (dx >= SWIPE_THRESHOLD) go(active - 1);
  };

  const addInstance = (e) => {
    e.preventDefault();
    const u = normalizeUrl(url);
    if (!u) return;
    const item = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, label: label.trim() || u, url: u };
    setInstances((list) => [...list, item]);
    setLabel('');
    setUrl('');
  };

  const removeInstance = (id) => setInstances((list) => list.filter((i) => i.id !== id));
  const renameInstance = (id, name) =>
    setInstances((list) => list.map((i) => (i.id === id ? { ...i, label: name } : i)));
  const moveInstance = (idx, dir) => {
    const to = idx + dir;
    if (to < 0 || to >= instances.length) return;
    setInstances((list) => {
      const next = [...list];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  };

  // Mount window (decision 5): keep every slide live at N<=3; beyond that only
  // the active slide and its immediate neighbours, so we never hold more than
  // a few full Harness apps in memory. Off-window slides reload on swipe-in.
  const mounted = (i) => instances.length <= 3 || Math.abs(i - active) <= 1;

  const activeInstance = instances[active];

  return (
    <div className="switcher">
      <header className="switcher__bar">
        <span className="switcher__title">{t('switcher.title')}</span>
        {activeInstance && !editing && (
          <span className="switcher__active-label" title={activeInstance.url}>{activeInstance.label}</span>
        )}
        <button type="button" className="switcher__btn" onClick={() => setEditing((v) => !v)}>
          {editing ? t('switcher.done') : t('switcher.edit')}
        </button>
      </header>

      {editing ? (
        <div className="switcher__editor">
          <ul className="switcher__list">
            {instances.map((inst, i) => (
              <li key={inst.id} className="switcher__list-row">
                <input
                  className="switcher__rename"
                  value={inst.label}
                  aria-label={t('switcher.rename')}
                  onChange={(e) => renameInstance(inst.id, e.target.value)}
                />
                <span className="switcher__row-url" title={inst.url}>{inst.url}</span>
                <span className="switcher__row-btns">
                  <button type="button" className="switcher__btn" aria-label={t('switcher.moveLeft')} disabled={i === 0} onClick={() => moveInstance(i, -1)}>↑</button>
                  <button type="button" className="switcher__btn" aria-label={t('switcher.moveRight')} disabled={i === instances.length - 1} onClick={() => moveInstance(i, 1)}>↓</button>
                  <button type="button" className="switcher__btn switcher__btn--danger" aria-label={t('switcher.remove')} onClick={() => removeInstance(inst.id)}>✕</button>
                </span>
              </li>
            ))}
          </ul>

          <form className="switcher__add" onSubmit={addInstance}>
            <h2 className="switcher__add-title">{t('switcher.addComputer')}</h2>
            <input
              className="switcher__input"
              value={label}
              placeholder={t('switcher.labelPlaceholder')}
              onChange={(e) => setLabel(e.target.value)}
            />
            <input
              className="switcher__input"
              value={url}
              placeholder={t('switcher.urlPlaceholder')}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button type="submit" className="switcher__btn switcher__btn--primary" disabled={!url.trim()}>
              {t('switcher.add')}
            </button>
          </form>
        </div>
      ) : instances.length === 0 ? (
        <p className="switcher__empty">{t('switcher.empty')}</p>
      ) : (
        <>
          <div className="switcher__viewport" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            <div className="switcher__track" style={{ transform: `translateX(-${active * 100}%)` }}>
              {instances.map((inst, i) => (
                <div className="switcher__slide" key={inst.id}>
                  {mounted(i) ? (
                    <iframe className="switcher__frame" src={inst.url} title={inst.label} />
                  ) : (
                    <div className="switcher__slide-rest">{inst.label}</div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <nav className="switcher__nav" aria-label={t('switcher.title')}>
            <button type="button" className="switcher__btn" aria-label={t('switcher.prev')} disabled={active === 0} onClick={() => go(active - 1)}>‹</button>
            <span className="switcher__dots">
              {instances.map((inst, i) => (
                <button
                  key={inst.id}
                  type="button"
                  className={`switcher__dot${i === active ? ' is-active' : ''}`}
                  aria-label={inst.label}
                  aria-current={i === active}
                  onClick={() => go(i)}
                />
              ))}
            </span>
            <button type="button" className="switcher__btn" aria-label={t('switcher.next')} disabled={active === instances.length - 1} onClick={() => go(active + 1)}>›</button>
          </nav>
        </>
      )}
    </div>
  );
}
