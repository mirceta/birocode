import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLocalAppFramesMaybe } from '../../context/LocalAppFramesContext';
import { useT } from '../../i18n/LanguageContext';
import { classify, next as nextLiveness, initial as initialLiveness, PROBE_INTERVAL_MS, PROBE_TIMEOUT_MS } from './liveness';
import './product.css';

// Shows whatever product is listening on the preview port, by iframing it. Used
// by the public Landing page, the builder's App tab, the Local tab and the
// agent docks. Owns the liveness probe + the "nothing running" empty state;
// the parent supplies the port and can force a reload by bumping `reloadKey`.
// `onStatus(online)` reports liveness.
//
// Two rendering modes:
//  - Inline (no `frameKey`): the iframe renders right here, as always. The App
//    tab and Landing page use this — they preview the one product on the
//    preview port, and remounting with the route is fine there.
//  - Hosted (`frameKey` + `frameMeta`, openspec local-app-state-preserve): this
//    component becomes just the surface SHELL — probe + empty state + a
//    placeholder slot div. The actual iframe lives in the root-mounted
//    LocalAppFrameHost, keyed by frameKey, and is projected over the slot; it
//    survives this component unmounting, which is the whole point (navigation
//    must never reload an opened local app). The slot is registered only while
//    the probe says `online`, so a dead app shows the empty state while its
//    stale frame stays hidden.
//
// `zoomable` (openspec: local-app-zoom) opts in to a per-frame zoom overlay that
// scales only the embedded app: the iframe is laid out at 100%/f and painted at
// scale(f), so the visual box always fills the viewport exactly and magnified
// content scrolls with the app's own scrollbars — the harness UI never moves.
// In hosted mode the zoom cluster (and its state) moves to the hosted frame so
// the level survives navigation with the frame.

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;

// Is it up? One sample: up | down | unknown (openspec local-app-liveness-hysteresis).
// Cross-origin direct ports (App tab / Landing) can't expose CORS, so we no-cors-
// probe and any answer is "up". Same-origin URLs (the /api/localview/ proxy,
// plans/local-app-proxy.md) let us read the harness's OWN verdict header: only
// "unreachable" (502, the port refused) and "no-app" (404) mean down — an app that
// answered anything is alive, and a probe that timed out says nothing. The verdict
// itself is taken with hysteresis in `check` below, never from one sample.
async function probe(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const sameOrigin = url.startsWith('/') || url.startsWith(window.location.origin);
  try {
    const res = await fetch(url, {
      mode: sameOrigin ? 'cors' : 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    return classify({ res, sameOrigin });
  } catch (e) {
    return classify({ error: e?.name || 'Error', sameOrigin });
  } finally {
    clearTimeout(timer);
  }
}

export default function ProductFrame({
  url,
  port,
  reloadKey = 0,
  onStatus,
  zoomable = false,
  frameKey = null,
  frameMeta = null,
}) {
  const { t } = useT();
  const framesApi = useLocalAppFramesMaybe(); // null outside the provider (Landing)
  const hosted = !!(frameKey && framesApi);
  // A kept-alive frame for this key means the app was live moments ago: start
  // optimistic so returning to it re-shows the frame instantly instead of
  // flashing the empty state for a probe round-trip. The probe still runs and
  // can flip it off.
  const [online, setOnline] = useState(() => (hosted && framesApi.frames[frameKey] ? true : null));
  const [zoom, setZoom] = useState(1); // 0.25-steps are exact binary fractions, so !== 1 is safe
  const pollRef = useRef(null);
  const slotRef = useRef(null);
  // The liveness state behind `online` (misses, last good sample): a live app is
  // hidden only after several consecutive harness "down" verdicts over ten seconds
  // (openspec local-app-liveness-hysteresis); one bad probe never tears the frame down.
  const liveRef = useRef(initialLiveness(hosted && framesApi.frames[frameKey] ? true : null));
  const probingRef = useRef(false);

  // Frame identity changed (app/surface switch in place): re-derive liveness
  // for the NEW frame the same way instead of inheriting the old one's.
  const lastKeyRef = useRef(frameKey);
  if (lastKeyRef.current !== frameKey) {
    lastKeyRef.current = frameKey;
    const seed = hosted && framesApi.frames[frameKey] ? true : null;
    liveRef.current = initialLiveness(seed);
    setOnline(seed);
  }

  // Keep the latest onStatus without making it a hook dependency (parents often
  // pass an inline function, which would otherwise restart the poll each render).
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  const check = useCallback(async () => {
    if (!url || probingRef.current) return; // a slow probe is not restarted underneath itself
    probingRef.current = true;
    let sample;
    try { sample = await probe(url); } finally { probingRef.current = false; }
    const before = liveRef.current;
    const after = nextLiveness(before, sample, Date.now());
    liveRef.current = after;
    if (after.online !== before.online) {
      setOnline(after.online);
      onStatusRef.current?.(after.online);
    }
  }, [url]);

  // Poll while open so the product appears as soon as it's started; also re-check
  // when the parent forces a reload.
  useEffect(() => {
    if (!url) return undefined;
    liveRef.current = initialLiveness(liveRef.current.online);
    check();
    // Hidden tab = no probing (openspec reduce-connection-appetite).
    pollRef.current = setInterval(() => { if (!document.hidden) check(); }, PROBE_INTERVAL_MS);
    return () => clearInterval(pollRef.current);
  }, [url, check, reloadKey]);

  // Hosted mode: while online, hand the slot to the frame host — it creates
  // (or re-shows) the kept-alive iframe over it. Cleanup only unregisters the
  // slot; the frame itself stays alive for the next visit. Layout effect so
  // the projection lands before paint. Meta rides in a ref: it's fully
  // determined by frameKey, and keeping it out of the deps means an inline
  // object literal at the call site can't churn the registration.
  const metaRef = useRef(frameMeta);
  metaRef.current = frameMeta;
  const acquire = framesApi?.acquireFrame;
  const release = framesApi?.releaseSlot;
  useLayoutEffect(() => {
    if (!hosted || !online || !url) return undefined;
    const el = slotRef.current;
    if (!el) return undefined;
    acquire(frameKey, { url, port, meta: metaRef.current, slotEl: el });
    return () => release(frameKey, el);
  }, [hosted, online, url, port, frameKey, acquire, release]);

  if (online && hosted) {
    return <div ref={slotRef} className="product-frame__slot" />;
  }
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
