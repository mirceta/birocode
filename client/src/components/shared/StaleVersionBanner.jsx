import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/LanguageContext';
import { hardRefresh } from '../../lib/hardRefresh';
import './staleVersionBanner.css';

// After a redeploy a single-page tab keeps running the bundle it first loaded —
// it never re-fetches index.html on its own — so a long-open browser can sit on
// stale code (this stranded two windows after the per-tab-spaces deploy). This
// polls the build identity the server is CURRENTLY serving (dist/version.json,
// emitted by vite next to the bundle) and compares it to this bundle's baked
// __BUILD_TIME__. On a mismatch the user is offered a reload.
// See plans/stale-version-banner.md.
const POLL_MS = 3 * 60 * 1000;

export default function StaleVersionBanner() {
  const { t } = useT();
  const [stale, setStale] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  // Once we know we're stale, stop polling — the build only moves forward.
  const staleRef = useRef(false);

  const check = useCallback(async () => {
    if (staleRef.current) return;
    try {
      // cache-busted + no-store so we see what the server serves NOW, never a
      // cached copy (the whole point is to defeat stale caching).
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return; // dev server has no version.json — treat as unknown
      const data = await res.json();
      if (data && data.buildTime && data.buildTime !== __BUILD_TIME__) {
        staleRef.current = true;
        setStale(true);
      }
    } catch {
      /* offline or blocked — leave state unchanged and try again later */
    }
  }, []);

  useEffect(() => {
    check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    const id = setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', check);
    };
  }, [check]);

  if (!stale || dismissed) return null;

  return (
    <div className="stale-banner" role="alert">
      <span className="stale-banner__msg">{t('staleBanner.message')}</span>
      <button
        type="button"
        className="stale-banner__reload"
        onClick={() => hardRefresh()}
      >
        {t('staleBanner.reload')}
      </button>
      <button
        type="button"
        className="stale-banner__close"
        aria-label={t('common.close')}
        onClick={() => setDismissed(true)}
      >
        &times;
      </button>
    </div>
  );
}
