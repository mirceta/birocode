import { useEffect, useState } from 'react';
import Arch from '../pages/Arch';
import { useT } from '../i18n/LanguageContext';
import { readPlacement, savePlacement, screenPicking, listScreens, screenSummary, openInHarnessWindow, HARNESS_WINDOW_NAME } from '../components/shared/harnessWindow';
import './manageSettings.css';

// The Settings tab (openspec management-settings-tab, fleet task a434653b): the things the
// Status tab used to carry that are configuration, not status — the arch's Managed-agents
// scope and the Fleet posture (allow sends / accept sends / accept upgrades) — and one new
// device-local setting: WHERE the Kanban badge links open their harness tabs. Read the
// note in harnessWindow.js for what a web page can and cannot do here; this tab says the
// same thing to the Operator instead of pretending.

export default function ManageSettings({ root, openHarness }) {
  const { t } = useT();
  const [placement, setPlacement] = useState(() => readPlacement());
  const [screens, setScreens] = useState(null);      // null = not detected yet
  const [detectError, setDetectError] = useState('');
  const [note, setNote] = useState('');
  const picking = screenPicking(typeof window !== 'undefined' ? window : null);
  const [feas] = useState(picking);

  const update = (next) => { const saved = savePlacement(next); setPlacement(saved); return saved; };
  const setMode = (mode) => update({ ...placement, mode });
  const chooseScreen = (s) => update({ mode: 'window', screen: s });

  const detect = async () => {
    setDetectError('');
    try {
      const list = await listScreens(window);
      setScreens(list);
      if (list.length === 1 && !placement.screen) chooseScreen(list[0]);
    } catch (e) {
      setDetectError(e?.message || String(e));
      setScreens([]);
    }
  };

  const tryOpen = () => {
    const url = `${(root || '').replace(/\/$/, '')}/studio`;
    const ok = openInHarnessWindow(url, placement, window);
    setNote(ok ? t('manageSettings.windowOpened') : t('manageSettings.windowBlocked'));
  };

  useEffect(() => { if (!note) return undefined; const id = setTimeout(() => setNote(''), 6000); return () => clearTimeout(id); }, [note]);

  const selectedLabel = placement.screen ? screenSummary(placement.screen) : null;
  const isChosen = (s) => placement.screen && (placement.screen.label && s.label ? placement.screen.label === s.label : (placement.screen.left === s.left && placement.screen.top === s.top && placement.screen.width === s.width));

  return (
    <div className="mg__status ms" data-settings-pane>
      <section className="ms__sec" aria-label={t('manageSettings.placement')} data-settings-placement>
        <h3 className="mg__status-h">🖥 {t('manageSettings.placement')}</h3>
        <p className="ms__lead">{t('manageSettings.placementLead')}</p>
        <div className="ms__modes" role="radiogroup" aria-label={t('manageSettings.placement')}>
          <label className={`ms__mode${placement.mode === 'tabs' ? ' ms__mode--on' : ''}`} data-placement-mode="tabs">
            <input type="radio" name="placement" checked={placement.mode === 'tabs'} onChange={() => setMode('tabs')} />
            <span className="ms__mode-t">{t('manageSettings.modeTabs')}</span>
            <span className="ms__dim">{t('manageSettings.modeTabsHint')}</span>
          </label>
          <label className={`ms__mode${placement.mode === 'window' ? ' ms__mode--on' : ''}`} data-placement-mode="window">
            <input type="radio" name="placement" checked={placement.mode === 'window'} onChange={() => setMode('window')} />
            <span className="ms__mode-t">{t('manageSettings.modeWindow')}</span>
            <span className="ms__dim">{t('manageSettings.modeWindowHint')}</span>
          </label>
        </div>

        {placement.mode === 'window' && (
          <div className="ms__screens" data-placement-screens>
            <div className="ms__row">
              <span className="ms__label">{t('manageSettings.screen')}</span>
              <span data-placement-screen-chosen>{selectedLabel || t('manageSettings.screenNone')}</span>
              {placement.screen && <button type="button" className="ms__btn" onClick={() => update({ mode: 'window', screen: null })} data-placement-screen-clear>{t('manageSettings.screenClear')}</button>}
            </div>
            {feas.available ? (
              <div className="ms__row">
                <button type="button" className="ms__btn ms__btn--primary" onClick={detect} data-placement-detect>{t('manageSettings.detect')}</button>
                <span className="ms__dim">{feas.reason || t('manageSettings.detectHint')}</span>
              </div>
            ) : (
              <div className="ms__note" data-placement-unavailable>
                <b>{t('manageSettings.noPicker')}</b> {feas.reason}. {t('manageSettings.noPickerHint')}
              </div>
            )}
            {detectError && <div className="ms__err" data-placement-detect-error>{detectError}</div>}
            {screens && screens.length > 0 && (
              <ul className="ms__list" data-placement-screen-list>
                {screens.map((s, i) => (
                  <li key={`${s.label || 'screen'}-${i}`}>
                    <label className={`ms__screen${isChosen(s) ? ' ms__screen--on' : ''}`}>
                      <input type="radio" name="screen" checked={!!isChosen(s)} onChange={() => chooseScreen(s)} data-placement-screen={i} />
                      <span>🖥 {screenSummary(s)}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {screens && screens.length === 0 && !detectError && <div className="ms__dim">{t('manageSettings.detectNone')}</div>}
            <div className="ms__row">
              <button type="button" className="ms__btn" onClick={tryOpen} data-placement-try>{t('manageSettings.tryOpen')}</button>
              <span className="ms__dim">{t('manageSettings.tryOpenHint', { name: HARNESS_WINDOW_NAME })}</span>
              {note && <span className="ms__ok" role="status" data-placement-note>{note}</span>}
            </div>
          </div>
        )}

        <details className="ms__limits" data-placement-limits>
          <summary>{t('manageSettings.limitsTitle')}</summary>
          <ul>
            <li>{t('manageSettings.limit1')}</li>
            <li>{t('manageSettings.limit2')}</li>
            <li>{t('manageSettings.limit3')}</li>
            <li>{t('manageSettings.limit4')}</li>
          </ul>
        </details>
      </section>

      <section className="mg__status-arch ms__sec" aria-label={t('manage.archControls')} data-settings-arch>
        <h3 className="mg__status-h">🏛 {t('manage.archControls')}</h3>
        <Arch popup view="cards" cards="settings" onOpenDock={openHarness} />
      </section>
    </div>
  );
}
