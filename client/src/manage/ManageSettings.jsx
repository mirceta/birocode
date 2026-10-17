import { useCallback, useEffect, useState } from 'react';
import Arch from '../pages/Arch';
import { useT } from '../i18n/LanguageContext';
import { readPlacement, savePlacement } from '../components/shared/harnessWindow';
import { askHosts, pickHost, rectOf, hostUrl, hostRouteAvailable, HOST_TAB_NAME } from '../components/shared/harnessHost';
import ProxySettings from './ProxySettings';
import './manageSettings.css';

// The Settings tab (openspec management-settings-tab, fleet task a434653b): the things the
// Status tab used to carry that are configuration, not status — the arch's Managed-agents
// scope and the Fleet posture (allow sends / accept sends / accept upgrades) — and one
// device-local setting: WHERE "open harness" puts an agent's tab (openspec harness-tabs-left-window:
// in the other Chrome window through the harness host tab, or beside the dashboard). Read the
// header of harnessHost.js for what a web page can and cannot do here; this tab says the same
// thing to the Operator instead of pretending, and shows where the host stands right now.

export default function ManageSettings({ root, openHarness }) {
  const { t } = useT();
  const [placement, setPlacement] = useState(() => readPlacement());
  const [host, setHost] = useState('checking');   // checking | none | left | here | unavailable
  const [note, setNote] = useState('');
  const setMode = (mode) => setPlacement(savePlacement({ mode }));

  const probe = useCallback(async () => {
    if (!hostRouteAvailable(window)) { setHost('unavailable'); return; }
    const answers = await askHosts(window);
    const p = pickHost(answers, rectOf(window));
    setHost(!p.host ? 'none' : p.inDashboard ? 'here' : 'left');
  }, []);
  useEffect(() => {
    if (placement.mode !== 'left') return undefined;
    probe();
    const id = setInterval(probe, 3000);
    return () => clearInterval(id);
  }, [placement.mode, probe]);

  const openHost = () => {
    let w = null;
    try { w = window.open(hostUrl(window), HOST_TAB_NAME); } catch { w = null; }
    setNote(w ? t('manageSettings.hostOpened') : t('manageSettings.hostBlocked'));
    setTimeout(probe, 1200);
  };
  useEffect(() => { if (!note) return undefined; const id = setTimeout(() => setNote(''), 8000); return () => clearTimeout(id); }, [note]);

  const hostText = { checking: 'manageSettings.hostChecking', none: 'manageSettings.hostNone', left: 'manageSettings.hostLeft', here: 'manageSettings.hostHere' }[host];

  return (
    <div className="mg__status ms" data-settings-pane>
      <ProxySettings />
      <section className="ms__sec" aria-label={t('manageSettings.placement')} data-settings-placement>
        <h3 className="mg__status-h">🖥 {t('manageSettings.placement')}</h3>
        <p className="ms__lead">{t('manageSettings.placementLead')}</p>
        <div className="ms__modes" role="radiogroup" aria-label={t('manageSettings.placement')}>
          {['left', 'tabs'].map((m) => (
            <label key={m} className={`ms__mode${placement.mode === m ? ' ms__mode--on' : ''}`} data-placement-mode={m}>
              <input type="radio" name="placement" checked={placement.mode === m} onChange={() => setMode(m)} />
              <span className="ms__mode-t">{t(m === 'left' ? 'manageSettings.modeLeft' : 'manageSettings.modeTabs')}</span>
              <span className="ms__dim">{t(m === 'left' ? 'manageSettings.modeLeftHint' : 'manageSettings.modeTabsHint')}</span>
            </label>
          ))}
        </div>

        {placement.mode === 'left' && (
          <div className="ms__screens" data-placement-host>
            <div className="ms__row">
              <span className="ms__label">{t('manageSettings.hostStatus')}</span>
              <span className={host === 'left' ? 'ms__ok' : host === 'here' ? 'ms__err' : ''} data-host-status={host}>{hostText ? t(hostText) : null}</span>
              {host !== 'left' && <button type="button" className="ms__btn ms__btn--primary" onClick={openHost} data-host-open>{t('manageSettings.hostOpen')}</button>}
              {note && <span className="ms__ok" role="status" data-placement-note>{note}</span>}
            </div>
            <div className="ms__dim"><b>{t('manageSettings.setupTitle')}</b></div>
            <ol className="ms__steps" data-host-setup>
              <li>{t('manageSettings.setup1')}</li>
              <li>{t('manageSettings.setup2')}</li>
              <li>{t('manageSettings.setup3')}</li>
            </ol>
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
