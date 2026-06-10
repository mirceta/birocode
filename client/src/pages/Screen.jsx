import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiGetBlob } from '../api/client';
import ErrorBanner from '../components/shared/ErrorBanner';
import { useT } from '../i18n/LanguageContext';
import './screen.css';

// Screen tab (plans/screen-tab.md): read-only snapshots of the host desktop
// or a single window, with optional auto-refresh (~0.5 fps). View only — no
// remote input.
const AUTO_INTERVAL_MS = 2000;

export default function Screen() {
  const { t } = useT();

  const [windows, setWindows] = useState([]);
  const [source, setSource] = useState(''); // '' = whole desktop, else hwnd
  const [imgUrl, setImgUrl] = useState(null);
  const [auto, setAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const urlRef = useRef(null);

  const loadWindows = useCallback(async () => {
    try {
      setWindows(await apiGet('/screen/windows'));
    } catch {
      /* window list is best-effort; desktop capture still works */
    }
  }, []);

  const snap = useCallback(async (hwnd) => {
    setBusy(true);
    setError('');
    try {
      const blob = await apiGetBlob(hwnd ? `/screen?hwnd=${hwnd}` : '/screen');
      const next = URL.createObjectURL(blob);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = next;
      setImgUrl(next);
    } catch {
      setError(t('screen.captureError'));
      setAuto(false);
    } finally {
      setBusy(false);
    }
  }, [t]);

  // First load: window list + desktop snapshot. Revoke the blob on unmount.
  useEffect(() => {
    loadWindows();
    snap('');
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [loadWindows, snap]);

  // Auto-refresh loop.
  useEffect(() => {
    if (!auto) return undefined;
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') snap(source);
    }, AUTO_INTERVAL_MS);
    return () => clearInterval(id);
  }, [auto, source, snap]);

  const onSourceChange = (e) => {
    const next = e.target.value;
    setSource(next);
    snap(next);
  };

  return (
    <div className="screen-page">
      <div className="screen-toolbar">
        <select
          className="screen-source"
          value={source}
          onChange={onSourceChange}
          onFocus={loadWindows}
          aria-label={t('screen.source')}
        >
          <option value="">{t('screen.desktop')}</option>
          {windows.map((w) => (
            <option key={w.hwnd} value={w.hwnd}>{w.title}</option>
          ))}
        </select>
        <button
          type="button"
          className="screen-refresh"
          onClick={() => snap(source)}
          disabled={busy}
        >
          {t('screen.refresh')}
        </button>
        <label className="screen-auto">
          <input
            type="checkbox"
            checked={auto}
            onChange={(e) => setAuto(e.target.checked)}
          />
          {t('screen.auto')}
        </label>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => snap(source)} />}

      {imgUrl && (
        <div className="screen-view">
          <img className="screen-img" src={imgUrl} alt={t('screen.alt')} />
        </div>
      )}
    </div>
  );
}
