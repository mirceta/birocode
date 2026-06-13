import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/LanguageContext';
import './product.css';

// Shows whatever product is listening on the preview port, by iframing it. Used
// by both the public Landing page and the builder's App tab. Owns the liveness
// probe + the "nothing running" empty state; the parent supplies the port and
// can force a reload by bumping `reloadKey`. `onStatus(online)` reports liveness.

// Is it up? Cross-origin direct ports (App tab / Landing) can't expose CORS, so
// we no-cors-probe and treat any answer as "up". Same-origin URLs (the Local
// tab's /api/localview/ proxy, plans/local-app-proxy.md) DO let us read the
// status, so we check res.ok — a 502 from a dead local app then shows the empty
// state instead of the proxy's error body.
async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  const sameOrigin = url.startsWith('/') || url.startsWith(window.location.origin);
  try {
    const res = await fetch(url, {
      mode: sameOrigin ? 'cors' : 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return sameOrigin ? res.ok : true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export default function ProductFrame({ url, port, reloadKey = 0, onStatus }) {
  const { t } = useT();
  const [online, setOnline] = useState(null); // null = checking, true, false
  const pollRef = useRef(null);

  // Keep the latest onStatus without making it a hook dependency (parents often
  // pass an inline function, which would otherwise restart the poll each render).
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const check = useCallback(async () => {
    if (!url) return;
    const up = await probe(url);
    setOnline(up);
    onStatusRef.current?.(up);
  }, [url]);

  // Poll while open so the product appears as soon as it's started; also re-check
  // when the parent forces a reload.
  useEffect(() => {
    if (!url) return undefined;
    check();
    pollRef.current = setInterval(check, 4000);
    return () => clearInterval(pollRef.current);
  }, [url, check, reloadKey]);

  if (online) {
    return <iframe key={reloadKey} className="product-frame" src={url} title={t('nav.app')} />;
  }
  return (
    <div className="product-empty">
      <p className="product-empty__icon" aria-hidden="true">▶</p>
      <h2>{t('apptab.emptyTitle')}</h2>
      <p>{t('apptab.emptyBody', { port: port ?? 5200 })}</p>
    </div>
  );
}
