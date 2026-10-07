import { useEffect, useRef, useState } from 'react';
import { TOAST_EVENT, TOAST_TTL_MS, makeToast, addToast } from './toast';
import './toastLayer.css';

// The overlay toast stack (fleet task 6ee431ea, openspec manage-toast-overlay): fixed
// bottom-right, pointer-events only on the toasts themselves, so it can NEVER shift the
// layout under it. Mounted ONCE per page (first instance wins — same singleton idiom as
// OpenAgentNotice had); everything else just calls showToast().
//
// A toast: one compact line, role="status" inside an aria-live="polite" region, an "×"
// and click-anywhere-on-it dismiss, auto-evaporates after TOAST_TTL_MS with a fade the
// reduced-motion setting turns off; hovering pauses the clock. Sticky toasts (the
// persistent "cannot open: reason" family) have no clock — dismiss only.

let mounted = 0;

function Toast({ t, onClose }) {
  const [hover, setHover] = useState(false);
  const [closing, setClosing] = useState(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const close = () => { setClosing(true); setTimeout(() => closeRef.current(t.id), 180); };
  useEffect(() => {
    if (t.sticky || hover || closing) return undefined;
    const h = setTimeout(close, TOAST_TTL_MS);
    return () => clearTimeout(h);
  }, [t.sticky, hover, closing]); // eslint-disable-line react-hooks/exhaustive-deps
  const dataAttrs = Object.fromEntries(Object.entries(t.data).map(([k, v]) => [`data-${k}`, v ?? '']));
  return (
    <div
      className={`toast${t.sticky ? ' toast--sticky' : ''}${closing ? ' toast--closing' : ''}`}
      role="status"
      onClick={close}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={t.sticky ? 'Stays until dismissed — click to dismiss' : 'Click to dismiss'}
      data-toast={t.id}
      data-toast-sticky={t.sticky || undefined}
      {...dataAttrs}
    >
      <span className="toast__text">{t.text}</span>
      {t.link && <a className="toast__link" href={t.link.href} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} data-toast-link>{t.link.text}</a>}
      <button type="button" className="toast__x" aria-label="Dismiss" title="Dismiss" onClick={close}>×</button>
    </div>
  );
}

export default function ToastLayer() {
  const [toasts, setToasts] = useState([]);
  const [owner, setOwner] = useState(false);
  useEffect(() => {
    if (mounted > 0) return undefined;
    mounted += 1; setOwner(true);
    const on = (e) => setToasts((prev) => addToast(prev, makeToast(e.detail)));
    window.addEventListener(TOAST_EVENT, on);
    return () => { window.removeEventListener(TOAST_EVENT, on); mounted -= 1; };
  }, []);
  if (!owner) return null;
  const remove = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));
  return (
    <div className="toast-layer" aria-live="polite" data-toast-layer>
      {toasts.map((t) => <Toast key={t.id} t={t} onClose={remove} />)}
    </div>
  );
}
