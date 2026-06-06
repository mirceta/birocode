import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api/client';
import Loading from '../components/shared/Loading';
import ErrorBanner from '../components/shared/ErrorBanner';
import HistoryTimeline from '../components/history/HistoryTimeline';
import RestoreConfirm from '../components/history/RestoreConfirm';
import { useSave } from '../components/history/SaveHandler';
import { useT } from '../i18n/LanguageContext';
import '../components/history/history.css';

export default function History() {
  const { t } = useT();
  const { refreshTick, notifyRestored, showToast } = useSave();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet('/history');
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      setError(t('history.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load, refreshTick]);

  async function confirmRestore() {
    if (!pending) return;
    setRestoring(true);
    try {
      await apiPost('/history/restore', { hash: pending.hash });
      setPending(null);
      showToast(t('history.restoredToast'), 'ok');
      notifyRestored();
    } catch {
      setPending(null);
      showToast(t('history.restoreErrorToast'), 'error');
    } finally {
      setRestoring(false);
    }
  }

  if (loading) return <Loading label={t('history.loading')} />;

  if (error) return <ErrorBanner message={error} onRetry={load} />;

  if (entries.length === 0) {
    return (
      <div className="hist-empty">
        <p className="hist-empty__icon" aria-hidden="true">
          {'🕓'}
        </p>
        <h2>{t('history.empty')}</h2>
        <p>{t('history.emptyHint')}</p>
      </div>
    );
  }

  return (
    <div className="hist-page">
      <HistoryTimeline entries={entries} onGoBack={setPending} />

      {pending && (
        <RestoreConfirm
          entry={pending}
          restoring={restoring}
          onConfirm={confirmRestore}
          onCancel={() => (restoring ? null : setPending(null))}
        />
      )}
    </div>
  );
}
