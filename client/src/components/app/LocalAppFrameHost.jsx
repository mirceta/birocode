import { useLayoutEffect, useRef } from 'react';
import { useLocalAppFrames } from '../../context/LocalAppFramesContext';
import { useT } from '../../i18n/LanguageContext';
import './product.css';

// The single root-mounted home of every kept-alive local-app iframe (openspec
// local-app-state-preserve, design D1). Mounted once in StudioShell, OUTSIDE
// the router Outlet, so no navigation can unmount a frame. Each frame is
// projected over the placeholder slot its surface registered in
// LocalAppFramesContext; frames whose slot is gone stay mounted with
// display:none (which does NOT unload an iframe — only unmounting does).

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;

// Where the slot is actually visible: its rect intersected with every
// overflow-clipping ancestor (the dashboard grid and pane strip scroll, so a
// naively projected frame would paint outside its half-scrolled-away phone).
function slotClipRect(slot) {
  const r = slot.getBoundingClientRect();
  let left = r.left;
  let top = r.top;
  let right = r.right;
  let bottom = r.bottom;
  for (let node = slot.parentElement; node; node = node.parentElement) {
    const s = getComputedStyle(node);
    if (/(auto|scroll|hidden|clip)/.test(s.overflow + s.overflowX + s.overflowY)) {
      const c = node.getBoundingClientRect();
      left = Math.max(left, c.left);
      top = Math.max(top, c.top);
      right = Math.min(right, c.right);
      bottom = Math.min(bottom, c.bottom);
    }
  }
  return { rect: r, left, top, right, bottom };
}

function HostedFrame({ frameKey, frame }) {
  const { t } = useT();
  const { refreshFrame, setZoom } = useLocalAppFrames();
  const ref = useRef(null);

  // Slot projection: pin this wrapper over the slot's on-screen rect and keep
  // it there through scroll/resize/layout changes. Rects are re-read at rAF
  // cadence at most (capture-phase scroll listener sees every scroll
  // container), and styles are written directly to the node — no React
  // re-render per scroll tick.
  const { slotEl } = frame;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (!slotEl) {
      el.style.display = 'none';
      return undefined;
    }
    let raf = 0;
    const place = () => {
      raf = 0;
      const { rect, left, top, right, bottom } = slotClipRect(slotEl);
      if (right <= left || bottom <= top) {
        // Slot fully scrolled out of view: hide, don't unmount.
        el.style.display = 'none';
        return;
      }
      el.style.display = 'flex';
      el.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
      el.style.width = `${rect.width}px`;
      el.style.height = `${rect.height}px`;
      el.style.clipPath = `inset(${top - rect.top}px ${rect.right - right}px ${rect.bottom - bottom}px ${left - rect.left}px)`;
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(place);
    };
    place();
    const ro = new ResizeObserver(schedule);
    ro.observe(slotEl);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, [slotEl]);

  const { url, zoom, reloadKey, bust } = frame;
  const src = bust ? `${url}${url.includes('?') ? '&' : '?'}_=${bust}` : url;

  return (
    <div ref={ref} className="laf-frame" style={{ display: 'none' }}>
      <div className="product-frame__viewport">
        <iframe
          key={reloadKey}
          className="product-frame"
          src={src}
          title={t('nav.app')}
          style={zoom !== 1 ? {
            width: `calc(100% / ${zoom})`,
            height: `calc(100% / ${zoom})`,
            transform: `scale(${zoom})`,
            transformOrigin: 'top left',
          } : undefined}
        />
        {/* Same corner cluster ProductFrame used to own (local-app-zoom), plus
            the explicit per-frame reload — the only way an opened app reloads
            now that navigation never does. */}
        <div className="product-frame__zoom">
          <button
            type="button"
            className="product-frame__zoom-btn"
            disabled={zoom <= ZOOM_MIN}
            onClick={() => setZoom(frameKey, Math.max(ZOOM_MIN, zoom - ZOOM_STEP))}
            title={t('productframe.zoomOut')}
            aria-label={t('productframe.zoomOut')}
          >
            −
          </button>
          {zoom !== 1 && (
            <button
              type="button"
              className="product-frame__zoom-btn product-frame__zoom-level"
              onClick={() => setZoom(frameKey, 1)}
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
            onClick={() => setZoom(frameKey, Math.min(ZOOM_MAX, zoom + ZOOM_STEP))}
            title={t('productframe.zoomIn')}
            aria-label={t('productframe.zoomIn')}
          >
            +
          </button>
          <button
            type="button"
            className="product-frame__zoom-btn"
            onClick={() => refreshFrame(frameKey)}
            title={t('productframe.refresh')}
            aria-label={t('productframe.refresh')}
          >
            ↻
          </button>
        </div>
      </div>
    </div>
  );
}

export default function LocalAppFrameHost() {
  const { frames } = useLocalAppFrames();
  const keys = Object.keys(frames);
  if (keys.length === 0) return null;
  return (
    <div className="laf-host" aria-hidden={false}>
      {keys.map((k) => (
        <HostedFrame key={k} frameKey={k} frame={frames[k]} />
      ))}
    </div>
  );
}
