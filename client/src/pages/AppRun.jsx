import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '../api/client';
import { useT } from '../i18n/LanguageContext';
import './apprun.css';

// The "App" tab: previews the product (the app in the opened repo) by iframing a
// fixed preview port. The harness does NOT start the product -- you ask Claude in
// the Chat tab to start it on that port (bound to 0.0.0.0, launched detached so
// it survives the turn). This page just shows whatever is listening there.

// A no-cors probe: resolves (opaque) if something answers on the URL, rejects if
// the port is closed/unreachable. Lets us detect "is it up?" without the product
// needing CORS headers.
async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default function AppRun() {
  const { t } = useT();
  const [port, setPort] = useState(null);
  const [online, setOnline] = useState(null); // null = checking, true, false
  const [reloadKey, setReloadKey] = useState(0);
  const pollRef = useRef(null);

  // The product runs on the same host the user is reaching the harness on (so it
  // works from a phone over the LAN), just on the preview port.
  const url = port ? `${window.location.protocol}//${window.location.hostname}:${port}` : null;

  useEffect(() => {
    let cancelled = false;
    apiGet('/app/preview')
      .then((data) => {
        if (!cancelled) setPort(data?.port ?? 5200);
      })
      .catch(() => {
        if (!cancelled) setPort(5200);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const check = useCallback(async () => {
    if (!url) return;
    const up = await probe(url);
    setOnline(up);
  }, [url]);

  // Poll while the page is open so the preview appears as soon as Claude starts it.
  useEffect(() => {
    if (!url) return undefined;
    check();
    pollRef.current = setInterval(check, 4000);
    return () => clearInterval(pollRef.current);
  }, [url, check]);

  function refresh() {
    setReloadKey((k) => k + 1);
    check();
  }

  const statusLabel =
    online === null ? t('apptab.checking') : online ? t('apptab.online') : t('apptab.offline');
  const statusClass =
    online === null ? 'is-checking' : online ? 'is-online' : 'is-offline';

  return (
    <div className="apprun">
      <div className="apprun__bar">
        <span className={`apprun__status ${statusClass}`}>
          <span className="apprun__dot" aria-hidden="true" />
          {statusLabel}
        </span>
        {url && (
          <a className="apprun__url" href={url} target="_blank" rel="noreferrer" title={url}>
            {url}
          </a>
        )}
        <button type="button" className="apprun__refresh" onClick={refresh}>
          {t('apptab.refresh')}
        </button>
      </div>

      <div className="apprun__body">
        {online ? (
          <iframe
            key={reloadKey}
            className="apprun__frame"
            src={url}
            title={t('nav.app')}
          />
        ) : (
          <div className="apprun__empty">
            <p className="apprun__empty-icon" aria-hidden="true">▶</p>
            <h2>{t('apptab.emptyTitle')}</h2>
            <p>{t('apptab.emptyBody', { port: port ?? 5200 })}</p>
          </div>
        )}
      </div>
    </div>
  );
}
