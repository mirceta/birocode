import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/LanguageContext';
import './product.css';

// Shows whatever product is listening on the preview port, by iframing it. Used
// by both the public Landing page and the builder's App tab. Owns the liveness
// probe + the "nothing running" empty state; the parent supplies the port and
// can force a reload by bumping `reloadKey`. `onStatus(online)` reports liveness.

// A no-cors probe: resolves (opaque) if something answers, rejects if the port is
// closed -- lets us detect "is it up?" without the product needing CORS headers.
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

export default function ProductFrame({ port, reloadKey = 0, onStatus }) {
  const { t } = useT();
  const [online, setOnline] = useState(null); // null = checking, true, false
  const pollRef = useRef(null);

  // Keep the latest onStatus without making it a hook dependency (parents often
  // pass an inline function, which would otherwise restart the poll each render).
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  // The product runs on the same host the user reached this page on (so it works
  // from a phone over the LAN), just on the preview port.
  const url = port ? `${window.location.protocol}//${window.location.hostname}:${port}` : null;

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
