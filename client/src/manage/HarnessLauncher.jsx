import { useEffect, useState } from 'react';
import { useT } from '../i18n/LanguageContext';
import { installLauncher, HARNESS_WINDOW_NAME } from '../components/shared/harnessWindow';
import './harnessLauncher.css';

// The harness window's launcher tab (openspec harness-window-agent-tabs): the same Management
// bundle rendered with ?launcher=1. It does one thing — expose window.__birocodeOpenAgent so the
// dashboard (which holds this window's handle by name) can open each repo agent as its OWN
// tab NEXT TO this one, and focus an existing tab instead of reloading it. Measured in Chrome
// (check-harness-tabs.mjs): a tab lands in the window of the page that opened it, so this tab
// is what makes "agent tabs in the harness window" possible; the Operator drags this window to
// the other monitor once and allows pop-ups for the site once.
export default function HarnessLauncher() {
  const { t } = useT();
  const [opened, setOpened] = useState([]);
  const [last, setLast] = useState(null);
  useEffect(() => {
    installLauncher(window, (e) => { setOpened(e.opened); setLast(e); });
    try { document.title = `🪟 ${t('launcher.title')}`; } catch { /* no document */ }
  }, [t]);
  const ago = (ms) => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60_000)} min`);
  return (
    <div className="hl" data-harness-launcher data-launcher-name={HARNESS_WINDOW_NAME}>
      <h1 className="hl__title">🪟 {t('launcher.title')}</h1>
      <p className="hl__lead">{t('launcher.lead')}</p>
      <p className="hl__dim">{t('launcher.popups')}</p>
      {last?.result === 'blocked' && <div className="hl__err" role="status" data-launcher-blocked>{t('manageSettings.relayBlocked')}</div>}
      <h2 className="hl__h">{t('launcher.opened')}</h2>
      {opened.length === 0 ? <p className="hl__dim" data-launcher-empty>{t('launcher.none')}</p> : (
        <ul className="hl__list" data-launcher-list>
          {opened.map((o) => (
            <li key={o.name} data-launcher-agent={o.name}>
              <code>{o.name.replace(/^birocode-agent-/, '')}</code> — <a href={o.url} target={o.name} rel="noreferrer">{o.url}</a>
              <span className="hl__dim"> · {t('launcher.hits', { n: o.hits })} · {ago(Date.now() - o.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
