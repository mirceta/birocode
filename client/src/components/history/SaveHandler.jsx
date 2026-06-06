import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { apiPost } from '../../api/client';
import NoteModal from './NoteModal';
import './history.css';

// Owns the global Save flow used by the header Save button and shared by the
// History page. Wrapping the app shell in <SaveProvider> lets any descendant
// call useSave() to open the "What changed?" modal and trigger a save, and
// lets History subscribe to a refresh signal so it reloads after a save or a
// "go back" without manual reloads.
//
// Flow: tap Save -> NoteModal (optional note) -> POST /api/save ->
//   - { hash } success  -> "Saved!" toast + bump refresh signal
//   - { noChanges:true } -> "Nothing to save" toast
//   - error              -> friendly failure toast

const SaveContext = createContext(null);

const TOAST_MS = 2200;

export function SaveProvider({ children }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null); // { text, tone: 'ok' | 'warn' | 'error' }
  const [refreshTick, setRefreshTick] = useState(0);
  const toastTimer = useRef(null);

  const showToast = useCallback((text, tone = 'ok') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, tone });
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const openSave = useCallback(() => setModalOpen(true), []);

  const bumpRefresh = useCallback(() => setRefreshTick((n) => n + 1), []);

  const performSave = useCallback(
    async (note) => {
      setSaving(true);
      try {
        const res = await apiPost('/save', { message: note || undefined });
        setModalOpen(false);
        if (res && res.noChanges) {
          showToast('Nothing to save', 'warn');
        } else {
          showToast('Saved!', 'ok');
          bumpRefresh();
        }
      } catch {
        setModalOpen(false);
        showToast("Couldn't save -- please try again", 'error');
      } finally {
        setSaving(false);
      }
    },
    [showToast, bumpRefresh],
  );

  const value = {
    openSave,
    saving,
    refreshTick,
    notifyRestored: bumpRefresh,
    showToast,
  };

  return (
    <SaveContext.Provider value={value}>
      {children}

      {toast && (
        <div className={`hist-toast hist-toast--${toast.tone}`} role="status">
          {toast.tone === 'ok' && (
            <span className="hist-toast__check" aria-hidden="true">
              {'✓'}
            </span>
          )}
          {toast.text}
        </div>
      )}

      {modalOpen && (
        <NoteModal
          saving={saving}
          onConfirm={performSave}
          onCancel={() => (saving ? null : setModalOpen(false))}
        />
      )}
    </SaveContext.Provider>
  );
}

export function useSave() {
  const ctx = useContext(SaveContext);
  if (!ctx) {
    throw new Error('useSave must be used within a <SaveProvider>');
  }
  return ctx;
}
