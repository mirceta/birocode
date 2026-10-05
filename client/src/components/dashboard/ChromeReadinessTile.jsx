import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';
import { loadBrowserAgents } from '../chat/browserMode';
import { overallUi, checkMark, orderChecks, countsLine, browserAgentCount } from './chromeReadiness';
import './adminStatusTile.css';
import './watchdogStatusTile.css';
import './chromeReadinessTile.css';

// Claude-for-Chrome readiness (openspec chrome-readiness-preflight): is THIS machine able to
// give a repo agent the browser, and if not, which link of the chain is broken and what to do.
//
// The chain (verified against the CLI and the official docs): agent turn --chrome → Claude Code
// → named pipe → the native host Chrome starts from its native-messaging registration → the
// Claude extension in a Chrome profile, signed in to claude.ai with the same account.
//
// Same self-contained-chip idiom as its neighbours: its own 5 s poll of a CACHED endpoint
// (GET /api/chrome/preflight never starts a process), hidden-tab guard, unmounted while the
// strip is collapsed. The live probe — one short real agent turn — runs only on Re-run.
const POLL_MS = 5000;
const COLLAPSE_KEY = 'claudeweb_chrome_ready_collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) !== '0';   // collapsed until opened: the row stays compact
  } catch {
    return true;
  }
}

export default function ChromeReadinessTile() {
  const { t } = useT();
  const [data, setData] = useState(null);       // last good payload
  const [loadError, setLoadError] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [starting, setStarting] = useState(false);
  const [runNote, setRunNote] = useState('');   // why a re-run did not start its probe
  const aliveRef = useRef(true);

  const load = async () => {
    try {
      const d = await apiGet('/chrome/preflight');
      if (!aliveRef.current) return;
      setData(d);
      setLoadError(false);
    } catch {
      if (aliveRef.current) setLoadError(true);
    }
  };

  useEffect(() => {
    aliveRef.current = true;
    load();
    // Hidden tab = no polling (openspec reduce-connection-appetite).
    const poll = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => {
      aliveRef.current = false;
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* private mode — in-memory only */
      }
      return next;
    });
  }

  async function onRerun() {
    setStarting(true);
    setRunNote('');
    try {
      const d = await apiPost('/chrome/preflight/run');
      if (!aliveRef.current) return;
      setData(d);
      setLoadError(false);
      if (d && d.probeStarted === false && d.probeNotStartedWhy) setRunNote(d.probeNotStartedWhy);
    } catch (e) {
      if (aliveRef.current) setRunNote(e?.message || t('chromeReady.rerun.failed'));
    } finally {
      if (aliveRef.current) setStarting(false);
    }
  }

  const loading = !data && !loadError;
  const ui = overallUi(data?.overall, { loading, loadError });
  const running = !!data?.probeRunning;
  const counts = countsLine(data?.counts);
  let agents = 0;
  try { agents = browserAgentCount(loadBrowserAgents(localStorage)); } catch { /* storage blocked */ }

  return (
    <div className={`astile crtile${collapsed ? ' astile--collapsed' : ''}`} data-chrome-ready={data?.overall || (loading ? 'loading' : 'unknown')}>
      <button type="button" className="astile__hd" onClick={toggle} aria-expanded={!collapsed} title={t('chromeReady.title')}>
        <span className="astile__kind">{t('chromeReady.kind')}</span>
        <span className={`astile__dot astile__dot--${ui.dot}`} aria-hidden="true" />
        <span className="astile__label">{t(ui.labelKey)}{counts ? <span className="crtile__counts"> · {counts}</span> : null}</span>
        <span className="astile__chevron" aria-hidden="true">⌄</span>
      </button>

      {!collapsed && (
        <div className="astile__body">
          {loadError && <div className="astile__error">{t('chromeReady.loadError')}</div>}

          <ul className="crtile__checks">
            {orderChecks(data?.checks).map((c) => {
              const m = checkMark(c.state);
              return (
                <li key={c.id} className={`crtile__check crtile__check--${m.mod}`} data-check={c.id} data-state={c.state}>
                  <span className="crtile__mark" aria-label={c.state}>{m.mark}</span>
                  <div className="crtile__text">
                    <div className="crtile__label">{c.label}</div>
                    <div className="crtile__detail">{c.detail}</div>
                    {c.fix && c.state !== 'pass' && <div className="crtile__fix"><b>{t('chromeReady.fix')}</b> {c.fix}</div>}
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="crtile__actions">
            <button type="button" className="astile__enable" onClick={onRerun} disabled={starting || running} data-rerun>
              {running ? t('chromeReady.rerun.running') : starting ? t('chromeReady.rerun.starting') : t('chromeReady.rerun.action')}
            </button>
            <span className="astile__note astile__note--soft">{t('chromeReady.rerun.note')}</span>
          </div>
          {runNote && <div className="astile__error" data-run-note>{t('chromeReady.rerun.notStarted')} {runNote}</div>}

          <div className="astile__note astile__note--soft" data-device-agents={agents}>
            {agents === 0 ? t('chromeReady.device.none') : t('chromeReady.device.some').replace('{n}', String(agents))}
          </div>
          <div className="astile__note astile__note--soft">{t('chromeReady.note')}</div>
        </div>
      )}
    </div>
  );
}
