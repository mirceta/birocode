import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/LanguageContext';
import './product.css';

// Shows whatever product is listening on the preview port, by iframing it. Used
// by both the public Landing page and the builder's App tab. Owns the liveness
// probe + the "nothing running" empty state; the parent supplies the port and
// can force a reload by bumping `reloadKey`. `onStatus(online)` reports liveness.
//
// `zoomable` (openspec: local-app-zoom) opts in to a per-frame zoom overlay that
// scales only the embedded app: the iframe is laid out at 100%/f and painted at
// scale(f), so the visual box always fills the viewport exactly and magnified
// content scrolls with the app's own scrollbars — the harness UI never moves.
// Zoom state is component-local on purpose: per-surface and ephemeral by spec.

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;

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

export default function ProductFrame({ url, port, reloadKey = 0, onStatus, zoomable = false }) {
  const { t } = useT();
  const [online, setOnline] = useState(null); // null = checking, true, false
  const [zoom, setZoom] = useState(1); // 0.25-steps are exact binary fractions, so !== 1 is safe
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
    const frame = (
      <iframe
        key={reloadKey}
        className="product-frame"
        src={url}
        title={t('nav.app')}
        style={zoomable && zoom !== 1 ? {
          width: `calc(100% / ${zoom})`,
          height: `calc(100% / ${zoom})`,
          transform: `scale(${zoom})`,
          transformOrigin: 'top left',
        } : undefined}
      />
    );
    if (!zoomable) return frame;
    return (
      <div className="product-frame__viewport">
        {frame}
        <div className="product-frame__zoom">
          <button
            type="button"
            className="product-frame__zoom-btn"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))}
            title={t('productframe.zoomOut')}
            aria-label={t('productframe.zoomOut')}
          >
            −
          </button>
          {zoom !== 1 && (
            <button
              type="button"
              className="product-frame__zoom-btn product-frame__zoom-level"
              onClick={() => setZoom(1)}
              title={t('productframe.zoomReset')}
              aria-label={t('productframe.zoomReset')}
            >
              {Math.round(zoom * 100)}%
            </button>
          )}
          <button
            type="button"
            className="product-frame__zoom-btn"
            disabled={zoom >= ZOOM_MAX}
            onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))}
            title={t('productframe.zoomIn')}
            aria-label={t('productframe.zoomIn')}
          >
            +
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="product-empty">
      <p className="product-empty__icon" aria-hidden="true">▶</p>
      <h2>{t('apptab.emptyTitle')}</h2>
      <p>{t('apptab.emptyBody', { port: port ?? 5200 })}</p>
    </div>
  );
}
