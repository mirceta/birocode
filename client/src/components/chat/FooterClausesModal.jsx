import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n/LanguageContext';
import { useFooterClauses } from '../../context/FooterClausesContext';

// Footer-clauses popup (openspec prompt-footer-clauses): the list of standing
// instructions the composer appends to every send while their checkbox is
// ticked. Reuses the prompt-mgr modal shell (backdrop + portal to <body>, so a
// small dock window doesn't shrink it); the list itself is footer-specific:
// checkbox = active, inline edit, delete, and an add row at the bottom.
export default function FooterClausesModal({ onClose }) {
  const { t } = useT();
  const { clauses, refresh, addClause, updateClause, toggleClause, deleteClause } = useFooterClauses();

  // Popup open = refetch, so edits from another device show without a reload.
  useEffect(() => { refresh(); }, [refresh]);

  const [newText, setNewText] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function run(op) {
    setBusy(true);
    setError('');
    try {
      await op();
    } catch {
      setError(t('footerClauses.saveError'));
    } finally {
      setBusy(false);
    }
  }

  function handleAdd(e) {
    e.preventDefault();
    const text = newText.trim();
    if (!text) return;
    run(async () => {
      await addClause(text);
      setNewText('');
    });
  }

  function startEdit(c) {
    setEditingId(c.id);
    setEditText(c.text);
    setError('');
  }

  function handleSaveEdit(e) {
    e.preventDefault();
    const text = editText.trim();
    if (!text) return;
    run(async () => {
      await updateClause(editingId, text);
      setEditingId(null);
    });
  }

  return createPortal(
    <div className="prompt-mgr-backdrop" onClick={onClose}>
      <div
        className="prompt-mgr footer-clauses"
        role="dialog"
        aria-modal="true"
        aria-label={t('footerClauses.title')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="prompt-mgr__head">
          <span className="prompt-mgr__title">{t('footerClauses.title')}</span>
          <button type="button" className="prompt-mgr__close" onClick={onClose} aria-label={t('common.close')}>
            &times;
          </button>
        </div>

        <p className="prompt-mgr__formhint">{t('footerClauses.hint')}</p>

        {clauses.length > 0 ? (
          <ul className="footer-clauses__list">
            {clauses.map((c) => (
              <li key={c.id} className={`footer-clauses__item${c.active ? ' footer-clauses__item--active' : ''}`}>
                {editingId === c.id ? (
                  <form className="footer-clauses__edit" onSubmit={handleSaveEdit}>
                    <textarea
                      className="prompt-mgr__text-input"
                      rows={3}
                      autoFocus
                      value={editText}
                      onChange={(ev) => setEditText(ev.target.value)}
                      aria-label={t('footerClauses.editAria')}
                    />
                    <div className="prompt-mgr__actions">
                      <button type="submit" className="prompt-mgr__save" disabled={busy || !editText.trim()}>
                        {t('footerClauses.save')}
                      </button>
                      <button type="button" className="prompt-mgr__cancel" onClick={() => setEditingId(null)}>
                        {t('footerClauses.cancel')}
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <label className="footer-clauses__row">
                      <input
                        type="checkbox"
                        className="footer-clauses__check"
                        checked={!!c.active}
                        disabled={busy}
                        onChange={(ev) => run(() => toggleClause(c.id, ev.target.checked))}
                        aria-label={t('footerClauses.activeAria')}
                      />
                      <span className="footer-clauses__text">{c.text}</span>
                    </label>
                    <div className="footer-clauses__actions">
                      <button type="button" className="prompt-mgr__item-btn" onClick={() => startEdit(c)}>
                        {t('footerClauses.edit')}
                      </button>
                      <button
                        type="button"
                        className="prompt-mgr__item-btn"
                        disabled={busy}
                        onClick={() => run(() => deleteClause(c.id))}
                      >
                        {t('footerClauses.delete')}
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="prompt-mgr__empty">{t('footerClauses.empty')}</p>
        )}

        {error && <p className="prompt-mgr__error" role="alert">{error}</p>}

        <form className="prompt-mgr__form" onSubmit={handleAdd}>
          <textarea
            className="prompt-mgr__text-input"
            placeholder={t('footerClauses.addPlaceholder')}
            rows={2}
            value={newText}
            onChange={(ev) => setNewText(ev.target.value)}
          />
          <div className="prompt-mgr__actions">
            <button type="submit" className="prompt-mgr__save" disabled={busy || !newText.trim()}>
              {t('footerClauses.add')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
