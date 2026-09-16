import { useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';
import './adminStatusTile.css';
import './watchdogStatusTile.css';

// Harness keep-alive watchdog tile (fleet task c96de7ae): reports whether THIS box has an
// OS-level Scheduled Task that auto-starts the harness at boot/logon and restarts it if it
// dies. The browser can't read the Task Scheduler, so the whole state comes from a real probe
// on GET /api/watchdog/status on its own 5 s poller — same self-contained-chip idiom as
// AdminStatusTile, unmounted (polling stopped) while the header strip is collapsed.
//
// state ∈ { healthy, not_set_up, error } (+ supported:false => unsupported). CREATE is offered
// in not_set_up and error. When the harness lacks the rights to register the task, enable
// returns method 'needs-elevation' with the EXACT command to run elevated + the generated
// .cmd path — the tile shows those verbatim and never pretends it succeeded.
const POLL_MS = 5000;
const COLLAPSE_KEY = 'claudeweb_watchdog_status_collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

// Maps state -> { dot modifier, i18n label key }. Unsupported is handled before this map.
const STATE_UI = {
  healthy: { dot: 'ok', labelKey: 'watchdog.state.healthy' },
  not_set_up: { dot: 'pending', labelKey: 'watchdog.state.notSetUp' },
  error: { dot: 'err', labelKey: 'watchdog.state.error' },
};

export default function WatchdogStatusTile() {
  const { t } = useT();
  const [status, setStatus] = useState(null); // last good status payload; null until first load
  const [loadError, setLoadError] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [enabling, setEnabling] = useState(false);
  const [result, setResult] = useState(null); // last enable result (esp. needs-elevation)
  const [copied, setCopied] = useState(false);
  const aliveRef = useRef(true);

  const load = async () => {
    try {
      const d = await apiGet('/watchdog/status');
      if (!aliveRef.current) return;
      setStatus(d);
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

  async function onCreate() {
    setEnabling(true);
    setResult(null);
    setCopied(false);
    try {
      const res = await apiPost('/watchdog/enable');
      if (!aliveRef.current) return;
      setResult(res);
      await load(); // re-probe: healthy on success, unchanged on needs-elevation
    } catch (e) {
      if (aliveRef.current) setResult({ ok: false, error: e?.message || t('watchdog.create.failed') });
    } finally {
      if (aliveRef.current) setEnabling(false);
    }
  }

  async function onCopy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => { if (aliveRef.current) setCopied(false); }, 1500);
    } catch {
      /* clipboard blocked — the command is selectable in the box regardless */
    }
  }

  const supported = status ? status.supported : true;
  const state = status?.state || 'not_set_up';
  const loading = !status && !loadError;

  let dotMod;
  let label;
  if (loading) {
    dotMod = 'loading';
    label = t('watchdog.checking');
  } else if (!supported) {
    dotMod = 'off';
    label = t('watchdog.state.unsupported');
  } else {
    const ui = STATE_UI[state] || STATE_UI.not_set_up;
    dotMod = ui.dot;
    label = t(ui.labelKey);
  }

  const showCreate = supported && !loading && (state === 'not_set_up' || state === 'error');
  const needsElevation = result && !result.ok && result.method === 'needs-elevation';

  return (
    <div className={`astile${collapsed ? ' astile--collapsed' : ''}`}>
      <button
        type="button"
        className="astile__hd"
        onClick={toggle}
        aria-expanded={!collapsed}
        title={t('watchdog.title')}
      >
        <span className="astile__kind">{t('watchdog.kind')}</span>
        <span className={`astile__dot astile__dot--${dotMod}`} aria-hidden="true" />
        <span className="astile__label">{label}</span>
        <span className="astile__chevron" aria-hidden="true">⌄</span>
      </button>

      {!collapsed && (
        <div className="astile__body">
          {showCreate && (
            <button
              type="button"
              className="astile__enable"
              onClick={onCreate}
              disabled={enabling}
            >
              {enabling ? t('watchdog.create.working') : t('watchdog.create.action')}
            </button>
          )}

          {result && result.ok && (
            <div className="astile__note">{t('watchdog.create.done')}</div>
          )}

          {needsElevation && (
            <div className="wtile__elevate">
              <div className="astile__error">{t('watchdog.elevate.title')}</div>
              {result.error && <div className="astile__note">{result.error}</div>}
              <div className="astile__note astile__note--soft">{t('watchdog.elevate.runThis')}</div>
              <div className="wtile__cmd">
                <code>{result.elevatedCommand}</code>
                <button type="button" className="wtile__copy" onClick={() => onCopy(result.elevatedCommand)}>
                  {copied ? t('watchdog.elevate.copied') : t('watchdog.elevate.copy')}
                </button>
              </div>
              {result.cmdPath && (
                <div className="astile__note astile__note--soft">
                  {t('watchdog.elevate.orCmd')} <code className="wtile__path">{result.cmdPath}</code>
                </div>
              )}
            </div>
          )}

          {result && !result.ok && !needsElevation && result.error && (
            <div className="astile__error">{result.error}</div>
          )}

          <div className="astile__note astile__note--soft">{t('watchdog.note')}</div>
        </div>
      )}
    </div>
  );
}
