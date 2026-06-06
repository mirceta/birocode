import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api/client';
import Loading from '../components/shared/Loading';
import ErrorBanner from '../components/shared/ErrorBanner';
import HistoryTimeline from '../components/history/HistoryTimeline';
import RestoreConfirm from '../components/history/RestoreConfirm';
import { useSave } from '../components/history/SaveHandler';
import '../components/history/history.css';

// The History screen: a timeline of previous saves with a "Go back to this
// version" action. It reloads automatically when a save (from the header Save
// button) or a restore completes, via the shared refreshTick from useSave().
export default function History() {
  const { refreshTick, notifyRestored, showToast } = useSave();

  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // entry awaiting confirmation
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await apiGet('/history');
      setEntries(Array.isArray(data) ? data : []);
    } catch {
      setError("We couldn't load your saved versions. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload on mount and whenever a save/restore bumps the shared signal.
  useEffect(() => {
    load();
  }, [load, refreshTick]);

  async function confirmRestore() {
    if (!pending) return;
    setRestoring(true);
    try {
      await apiPost('/history/restore', { hash: pending.hash });
      setPending(null);
      showToast('Done -- went back to that version', 'ok');
      notifyRestored();
    } catch {
      setPending(null);
      showToast("Couldn't go back -- please try again", 'error');
    } finally {
      setRestoring(false);
    }
  }

  if (loading) return <Loading label="Loading your saved versions..." />;

  if (error) return <ErrorBanner message={error} onRetry={load} />;

  if (entries.length === 0) {
    return (
      <div className="hist-empty">
        <p className="hist-empty__icon" aria-hidden="true">
          {'🕓'}
        </p>
        <h2>No saved versions yet</h2>
        <p>Tap Save at the top to keep a snapshot of your work.</p>
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
