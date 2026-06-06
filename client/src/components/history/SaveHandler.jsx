import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { apiPost } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';
import NoteModal from './NoteModal';
import './history.css';

const SaveContext = createContext(null);

const TOAST_MS = 2200;

export function SaveProvider({ children }) {
  const { t } = useT();
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
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
          showToast(t('save.nothingToSave'), 'warn');
        } else {
          showToast(t('save.saved'), 'ok');
          bumpRefresh();
        }
      } catch {
        setModalOpen(false);
        showToast(t('save.failed'), 'error');
      } finally {
        setSaving(false);
      }
    },
    [showToast, bumpRefresh, t],
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
