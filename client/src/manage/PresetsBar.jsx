import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPut } from '../api/client';
import { useT } from '../i18n/LanguageContext';
import { showToast } from '../components/shared/toast';
import {
  PRESETS_KEY, ACTIVE_KEY, MAX_PRESETS, capture, updateFrom, rename, isModified, move,
  cleanList, sameList, mergeBrowserWins, shortcutOf,
} from './viewPresets';
import './viewPresets.css';

// Layout presets (fleet task d6e499cd, openspec manage-view-presets): the bar under the
// dashboard header. The browser copy (localStorage) is the working copy; the hub copy
// (/api/settings/view-presets) follows every edit while the two agree. When they differ on
// load (another browser saved its own), the browser keeps its list and "⇅ Sync" merges:
// the union by id, the browser's version winning a conflict, written to both.

const HUB = '/settings/view-presets';
const readLocal = () => { try { return cleanList(JSON.parse(localStorage.getItem(PRESETS_KEY))); } catch { return []; } };
const writeLocal = (list) => { try { localStorage.setItem(PRESETS_KEY, JSON.stringify(list)); } catch { /* private mode */ } };
const readActive = () => { try { return localStorage.getItem(ACTIVE_KEY) || null; } catch { return null; } };
const writeActive = (id) => { try { if (id) localStorage.setItem(ACTIVE_KEY, id); else localStorage.removeItem(ACTIVE_KEY); } catch { /* ignore */ } };

/**
 * view: the view on screen ({ panes, fractions }); allTabs: the tab keys this build has;
 * labelOf: tab label; sel: the Subagents selection; onApply(preset) applies one to ManageApp.
 */
export default function PresetsBar({ view, allTabs, labelOf, sel, onApply }) {
  const { t } = useT();
  const [presets, setPresets] = useState(readLocal);
  const [activeId, setActiveId] = useState(readActive);
  const [hub, setHub] = useState(null); // the hub's list, null until fetched / unreachable
  const [menu, setMenu] = useState(null); // preset id whose ⋯ menu is open
  const menuRef = useRef(null);

  const conflict = hub !== null && !sameList(presets, hub);

  // Load the hub copy once: an empty browser adopts it; otherwise a difference waits for ⇅ Sync.
  useEffect(() => {
    let alive = true;
    apiGet(HUB).then((r) => {
      if (!alive) return;
      const remote = cleanList(r?.presets);
      setHub(remote);
      const local = readLocal();
      if (local.length === 0 && remote.length > 0) { writeLocal(remote); setPresets(remote); }
      // The hub has never held presets: nothing to lose, the browser's become the hub copy.
      else if (remote.length === 0 && local.length > 0) apiPut(HUB, { presets: local }).then((s) => { if (alive) setHub(cleanList(s?.presets)); }).catch(() => {});
    }).catch(() => { if (alive) setHub(null); });
    return () => { alive = false; };
  }, []);

  const pushHub = useCallback((list) => {
    apiPut(HUB, { presets: list }).then((r) => setHub(cleanList(r?.presets))).catch(() => { /* the browser copy stands */ });
  }, []);

  // Every edit: browser first; the hub follows while it agreed with the browser before the edit.
  const commit = (next) => {
    const wasInSync = hub !== null && sameList(presets, hub);
    setPresets(next);
    writeLocal(next);
    if (wasInSync) pushHub(next);
  };

  const sync = () => {
    const merged = mergeBrowserWins(presets, hub || []);
    setPresets(merged);
    writeLocal(merged);
    pushHub(merged);
    showToast({ text: t('presets.synced', { n: merged.length }), data: { 'preset-synced': String(merged.length) } });
  };

  const activate = (p) => { setActiveId(p.id); writeActive(p.id); setMenu(null); onApply(p); };

  const saveView = () => {
    if (presets.length >= MAX_PRESETS) { showToast({ text: t('presets.full', { n: MAX_PRESETS }) }); return; }
    const p = capture(view, { labelOf, sel });
    commit([...presets, p]);
    setActiveId(p.id); writeActive(p.id);
    showToast({ text: t('presets.saved', { name: p.name }), data: { 'preset-saved': p.id } });
  };

  const active = presets.find((p) => p.id === activeId) || null;
  const modified = !!active && isModified(active, view, allTabs);
  const replace = (id, fn) => commit(presets.map((p) => (p.id === id ? fn(p) : p)));
  const updatePreset = (id) => { replace(id, (p) => updateFrom(p, view, { labelOf, sel })); setMenu(null); };
  const renamePreset = (p) => {
    setMenu(null);
    const name = window.prompt(t('presets.renamePrompt'), p.name);
    if (name !== null) replace(p.id, (q) => rename(q, name));
  };
  const deletePreset = (p) => {
    setMenu(null);
    if (!window.confirm(t('presets.deleteConfirm', { name: p.name }))) return;
    commit(presets.filter((q) => q.id !== p.id));
    if (activeId === p.id) { setActiveId(null); writeActive(null); }
  };

  // Alt+1..9 switch, Alt+Shift+S save (Ctrl+1..9 belongs to the browser's own tab switching).
  const keyRef = useRef(null);
  keyRef.current = (e) => {
    const s = shortcutOf(e);
    if (!s) return;
    if (s.save) { e.preventDefault(); saveView(); return; }
    const p = presets[s.index];
    if (p) { e.preventDefault(); activate(p); }
  };
  useEffect(() => {
    const onKey = (e) => keyRef.current?.(e);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!menu) return undefined;
    const onDoc = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(null); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menu]);

  return (
    <div className="vp" role="toolbar" aria-label={t('presets.title')} data-presets>
      <span className="vp__title">📌 {t('presets.title')}</span>
      {presets.length === 0 && <span className="vp__empty">{t('presets.empty')}</span>}
      {presets.map((p, i) => {
        const on = p.id === activeId;
        return (
          <span key={p.id} className={`vp__item${on ? ' vp__item--on' : ''}${on && modified ? ' vp__item--modified' : ''}`} ref={menu === p.id ? menuRef : undefined}>
            <button
              type="button"
              className="vp__tab"
              aria-pressed={on}
              title={`${p.name} — Alt+${i + 1}${on && modified ? ` · ${t('presets.modified')}` : ''}`}
              onClick={() => activate(p)}
              onDoubleClick={() => renamePreset(p)}
              data-preset={p.id}
              data-preset-index={i + 1}
              data-preset-modified={on && modified ? 'true' : undefined}
            >
              <span className="vp__pin" aria-hidden="true">🔖</span>
              {p.name}
              {on && modified && <span className="vp__dot" aria-label={t('presets.modified')}> •</span>}
            </button>
            <button type="button" className="vp__more" aria-label={`${t('presets.actions')}: ${p.name}`} aria-expanded={menu === p.id} onClick={() => setMenu(menu === p.id ? null : p.id)} data-preset-menu={p.id}>⋯</button>
            {menu === p.id && (
              <span className="vp__menu" role="menu">
                <button type="button" role="menuitem" onClick={() => renamePreset(p)} data-preset-rename>✎ {t('presets.rename')}</button>
                <button type="button" role="menuitem" onClick={() => updatePreset(p.id)} data-preset-update>⟳ {t('presets.update')}</button>
                <button type="button" role="menuitem" disabled={i === 0} onClick={() => { commit(move(presets, p.id, -1)); setMenu(null); }} data-preset-left>◀ {t('presets.moveLeft')}</button>
                <button type="button" role="menuitem" disabled={i === presets.length - 1} onClick={() => { commit(move(presets, p.id, 1)); setMenu(null); }} data-preset-right>▶ {t('presets.moveRight')}</button>
                <button type="button" role="menuitem" className="vp__danger" onClick={() => deletePreset(p)} data-preset-delete>🗑 {t('presets.delete')}</button>
              </span>
            )}
          </span>
        );
      })}
      {modified && (
        <span className="vp__modified" data-preset-modified-actions>
          <span className="vp__modified-label">{t('presets.modified')}</span>
          <button type="button" className="vp__btn" onClick={() => updatePreset(active.id)} data-preset-update-current>⟳ {t('presets.update')}</button>
          <button type="button" className="vp__btn" onClick={() => activate(active)} data-preset-revert>↶ {t('presets.revert')}</button>
        </span>
      )}
      <button type="button" className="vp__btn vp__save" onClick={saveView} title={`${t('presets.saveHint')} — Alt+Shift+S`} data-preset-save>💾 {t('presets.save')}</button>
      {conflict && (
        <button type="button" className="vp__btn vp__sync" onClick={sync} title={t('presets.syncHint', { n: hub.length })} data-preset-sync>⇅ {t('presets.sync')}</button>
      )}
    </div>
  );
}
