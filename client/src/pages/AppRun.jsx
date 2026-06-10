import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import ProductFrame from '../components/app/ProductFrame';
import { resolveProductUrl } from '../components/app/productUrl';
import { useT } from '../i18n/LanguageContext';
import './apprun.css';

// The builder's "App" tab: a status bar (liveness, URL, Prepare, Refresh) over a
// shared ProductFrame that previews whatever is running on the preview port. The
// harness does NOT start the product -- you ask Claude in Chat to start it.
export default function AppRun() {
  const { t } = useT();
  const navigate = useNavigate();
  const [port, setPort] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [online, setOnline] = useState(null); // null = checking, true, false
  const [identity, setIdentity] = useState(null); // { repoName, processName, ... }
  const [reloadKey, setReloadKey] = useState(0);
  const [preparing, setPreparing] = useState(false);
  const [note, setNote] = useState('');

  const url = port ? resolveProductUrl(port, previewUrl) : null;

  useEffect(() => {
    let cancelled = false;
    apiGet('/app/preview')
      .then((data) => {
        if (cancelled) return;
        setPort(data?.port ?? 5200);
        setPreviewUrl(data?.previewUrl ?? '');
      })
      .catch(() => {
        if (!cancelled) setPort(5200);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Whoever listens on the preview port may change at any time (Claude starts
  // and restarts products) — re-resolve identity whenever liveness flips or
  // the iframe is refreshed.
  useEffect(() => {
    if (!online) {
      setIdentity(null);
      return;
    }
    let cancelled = false;
    apiGet('/app/identity')
      .then((data) => {
        if (!cancelled) setIdentity(data);
      })
      .catch(() => {
        if (!cancelled) setIdentity(null);
      });
    return () => {
      cancelled = true;
    };
  }, [online, reloadKey]);

  async function prepare() {
    setPreparing(true);
    setNote('');
    try {
      await apiPost('/app/prepare');
      setNote(t('apptab.prepared'));
    } catch {
      setNote(t('apptab.prepareError'));
    } finally {
      setPreparing(false);
    }
  }

  const productLabel = identity?.running
    ? identity.repoName
      ?? t('apptab.unknownProduct', { process: identity.processName || '?' })
    : null;
  const statusLabel =
    online === null ? t('apptab.checking')
    : online ? (productLabel ? `${t('apptab.online')} — ${productLabel}` : t('apptab.online'))
    : t('apptab.offline');
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
        <button
          type="button"
          className="apprun__prepare"
          onClick={prepare}
          disabled={preparing}
          title={t('apptab.prepareHint')}
        >
          {preparing ? t('apptab.preparing') : t('apptab.prepare')}
        </button>
        <button type="button" className="apprun__refresh" onClick={() => setReloadKey((k) => k + 1)}>
          {t('apptab.refresh')}
        </button>
        <button type="button" className="apprun__fullscreen" onClick={() => navigate('/')} title={t('apptab.fullscreen')}>
          {t('apptab.fullscreen')}
        </button>
      </div>

      {note && <div className="apprun__note" role="status">{note}</div>}

      <div className="apprun__body">
        <ProductFrame url={url} port={port} reloadKey={reloadKey} onStatus={setOnline} />
      </div>
    </div>
  );
}
