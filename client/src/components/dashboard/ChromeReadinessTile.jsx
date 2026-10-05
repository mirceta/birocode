import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';
import { loadBrowserAgents } from '../chat/browserMode';
import { overallUi, checkMark, orderChecks, countsLine, browserAgentCount, openTargetOf, agoWords } from './chromeReadiness';
import './adminStatusTile.css';
import './watchdogStatusTile.css';
import './chromeReadinessTile.css';

// Claude-for-Chrome readiness (openspec chrome-readiness-preflight): is THIS machine able to
// give a repo agent the browser, and if not, which link of the chain is broken, what the harness
// repairs by itself, and what is left for the Operator.
//
// The chain (verified against the CLI, the extension and the official docs): agent turn --chrome
// → Claude Code → the Claude extension in a Chrome profile, signed in to claude.ai with the same
// account — reached through the extension's local native host (a named pipe) or its cloud
// connection.
//
// Same self-contained-chip idiom as its neighbours: its own 5 s poll of a CACHED endpoint
// (GET /api/chrome/preflight never starts a process), hidden-tab guard, unmounted while the
// strip is collapsed. Repair and the live probe run only on their buttons — and the harness
// repairs by itself before every browser turn.
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
  const [starting, setStarting] = useState('');  // 'rerun' | 'repair' while the POST is in flight
  const [runNote, setRunNote] = useState('');    // why a re-run / repair did not start
  const [openNote, setOpenNote] = useState('');  // what an "Open …" button did
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

  async function run(kind) {
    setStarting(kind);
    setRunNote('');
    setOpenNote('');
    try {
      const d = await apiPost(kind === 'repair' ? '/chrome/preflight/repair' : '/chrome/preflight/run');
      if (!aliveRef.current) return;
      setData(d);
      setLoadError(false);
      if (d && d.probeStarted === false && d.probeNotStartedWhy) setRunNote(d.probeNotStartedWhy);
    } catch (e) {
      if (aliveRef.current) setRunNote(e?.message || t('chromeReady.rerun.failed'));
    } finally {
      if (aliveRef.current) setStarting('');
    }
  }

  async function onOpen(target) {
    setOpenNote('');
    try {
      const r = await apiPost('/chrome/preflight/open', { target });
      if (aliveRef.current) setOpenNote(r?.detail || '');
    } catch (e) {
      if (aliveRef.current) setOpenNote(e?.message || t('chromeReady.open.failed'));
    }
  }

  const loading = !data && !loadError;
  const ui = overallUi(data?.overall, { loading, loadError });
  const running = !!data?.probeRunning;
  const repairing = !!data?.repairRunning;
  const busy = !!starting || running || repairing;
  const counts = countsLine(data?.counts);
  const repairs = data?.repairs || [];
  let agents = 0;
  try { agents = browserAgentCount(loadBrowserAgents(localStorage)); } catch { /* storage blocked */ }

  return (
    <div className={`astile crtile${collapsed ? ' astile--collapsed' : ''}`} data-chrome-ready={data?.overall || (loading ? 'loading' : 'unknown')}>
      <button type="button" className="astile__hd" onClick={toggle} aria-expanded={!collapsed} title={t('chromeReady.title')}>
        <span className="astile__kind">{t('chromeReady.kind')}</span>
        <span className={`astile__dot astile__dot--${ui.dot}`} aria-hidden="true" />
        <span className="astile__label">{t(ui.labelKey)}{counts ? <span className="crtile__counts"> · {counts}</span> : null}{data?.repairable ? <span className="crtile__counts"> · {t('chromeReady.repairable')}</span> : null}</span>
        <span className="astile__chevron" aria-hidden="true">⌄</span>
      </button>

      {!collapsed && (
        <div className="astile__body">
          {loadError && <div className="astile__error">{t('chromeReady.loadError')}</div>}

          <ul className="crtile__checks">
            {orderChecks(data?.checks).map((c) => {
              const m = checkMark(c.state);
              const open = openTargetOf(c.repair);
              return (
                <li key={c.id} className={`crtile__check crtile__check--${m.mod}`} data-check={c.id} data-state={c.state} data-repair={c.repair || undefined}>
                  <span className="crtile__mark" aria-label={c.state}>{m.mark}</span>
                  <div className="crtile__text">
                    <div className="crtile__label">{c.label}</div>
                    <div className="crtile__detail">{c.detail}</div>
                    {c.repair === 'auto' && <div className="crtile__auto">🔧 {t('chromeReady.auto')}</div>}
                    {c.fix && c.state !== 'pass' && c.repair !== 'auto' && <div className="crtile__fix"><b>{t('chromeReady.fix')}</b> {c.fix}</div>}
                    {open && (
                      <button type="button" className="crtile__open" onClick={() => onOpen(open)} data-open={open}>
                        {t(`chromeReady.open.${open}`)}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          {openNote && <div className="astile__note" data-open-note>{openNote}</div>}

          <div className="crtile__actions">
            {data?.repairable && (
              <button type="button" className="astile__enable" onClick={() => run('repair')} disabled={busy} data-repair-run>
                {repairing ? t('chromeReady.repair.running') : starting === 'repair' ? t('chromeReady.rerun.starting') : t('chromeReady.repair.action')}
              </button>
            )}
            <button type="button" className={data?.repairable ? 'crtile__secondary' : 'astile__enable'} onClick={() => run('rerun')} disabled={busy} data-rerun>
              {running && !repairing ? t('chromeReady.rerun.running') : starting === 'rerun' ? t('chromeReady.rerun.starting') : t('chromeReady.rerun.action')}
            </button>
            <span className="astile__note astile__note--soft">{data?.repairable ? t('chromeReady.repair.note') : t('chromeReady.rerun.note')}</span>
          </div>
          {runNote && <div className="astile__error" data-run-note>{t('chromeReady.rerun.notStarted')} {runNote}</div>}

          {repairs.length > 0 && (
            <div className="crtile__log" data-repair-log>
              <div className="crtile__log-h">{t('chromeReady.log.title')}</div>
              {repairs.slice(0, 5).map((r) => (
                <div key={`${r.at}-${r.action}`} className={`crtile__log-row${r.ok ? '' : ' crtile__log-row--bad'}`}>
                  <span className="crtile__log-when">{agoWords(Date.now() - r.at)}</span>
                  <span>{r.ok ? '✓' : '✗'} {r.detail} <span className="crtile__log-why">({r.trigger})</span></span>
                </div>
              ))}
            </div>
          )}

          <div className="astile__note astile__note--soft" data-device-agents={agents}>
            {agents === 0 ? t('chromeReady.device.none') : t('chromeReady.device.some').replace('{n}', String(agents))}
          </div>
          <div className="astile__note astile__note--soft">{t('chromeReady.autoNote')}</div>
          <div className="astile__note astile__note--soft">{t('chromeReady.note')}</div>
        </div>
      )}
    </div>
  );
}
