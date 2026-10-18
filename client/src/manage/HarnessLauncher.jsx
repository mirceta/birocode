import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/LanguageContext';
import { installHost, HOST_TAB_NAME } from '../components/shared/harnessHost';
import './harnessLauncher.css';

// The harness HOST tab (openspec harness-tabs-left-window, fleet task d3af3b9b): the same bundle rendered
// with ?launcher=1, kept in the Chrome window where the Operator wants the repo agents. It answers the
// dashboard over the same-origin BroadcastChannel and opens / raises each agent's named tab NEXT TO
// ITSELF — the only way a page can put a tab into another window (harnessHost.js explains why). While it
// still sits in the dashboard's window it only queues agents and says "drag me"; agents Chrome would not
// let it open (pop-ups blocked) wait here as buttons, whose click opens them.
export default function HarnessLauncher() {
  const { t } = useT();
  const [st, setSt] = useState({ inDashboard: false, queue: [], opened: [], last: null });
  const host = useRef(null);
  useEffect(() => {
    try { window.name = HOST_TAB_NAME; } catch { /* read-only */ }
    host.current = installHost(window, setSt);
    return () => host.current?.stop();
  }, []);
  useEffect(() => {
    const n = st.queue.length;
    try { document.title = `${n ? `(${n}) ` : ''}🪟 ${t('launcher.title')}`; } catch { /* no document */ }
  }, [t, st.queue.length]);
  const ago = (ms) => (ms < 60_000 ? `${Math.max(1, Math.round(ms / 1000))} s` : `${Math.round(ms / 60_000)} min`);
  const blocked = st.queue.some((q) => q.blocked);
  return (
    <div className="hl" data-harness-launcher data-harness-host data-host-state={st.inDashboard ? 'in-dashboard-window' : 'ready'}>
      <h1 className="hl__title">🪟 {t('launcher.title')}</h1>
      <p className="hl__lead">{t('launcher.lead')}</p>
      {st.inDashboard
        ? <div className="hl__drag" role="status" data-host-drag>⇦ {t('launcher.here')}</div>
        : <div className="hl__ok" role="status" data-host-ready>✓ {t('launcher.ready')}</div>}
      {st.queue.length > 0 && (<>
        <h2 className="hl__h">{t('launcher.waiting')}</h2>
        <ul className="hl__list" data-host-queue>
          {st.queue.map((q) => (
            <li key={q.name} data-host-queued={q.name}>
              <b>{q.label || q.name.replace(/^birocode-agent-/, '')}</b>{' '}
              <button type="button" className="hl__btn" onClick={() => host.current?.openNow(q.name)} data-host-open-now={q.name}>{t('launcher.openNow')}</button>
            </li>
          ))}
        </ul>
      </>)}
      <p className={blocked ? 'hl__err' : 'hl__dim'} data-host-popups={blocked ? 'blocked' : 'info'}>{t('launcher.popups')}</p>
      <p className="hl__dim">{t('launcher.pin')}</p>
      <h2 className="hl__h">{t('launcher.opened')}</h2>
      {st.opened.length === 0 ? <p className="hl__dim" data-launcher-empty>{t('launcher.none')}</p> : (
        <ul className="hl__list" data-launcher-list>
          {st.opened.map((o) => (
            <li key={o.name} data-launcher-agent={o.name}>
              <b>{o.label || o.name.replace(/^birocode-agent-/, '')}</b> — <a href={o.url} target={o.name} rel="noreferrer">{o.url}</a>
              <span className="hl__dim"> · {t('launcher.hits', { n: o.hits })} · {ago(Date.now() - o.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
