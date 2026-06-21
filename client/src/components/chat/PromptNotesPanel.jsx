import { useState } from 'react';
import { useT } from '../../i18n/LanguageContext';

// The "Notes" tab of the ⚙ modal (openspec add-prompt-notes-tab). A NOTE is a
// titled, freeform block of text the user is drafting that hasn't yet been ported
// into a prompt PLAN — the messy first step of planning. Create / edit / delete /
// list, nothing more: notes are drafts, not send-ready text, so there's no "Use →
// composer" action (unlike the Plans tab). Notes are global + backend-synced
// (parent passes them in from PromptNotesContext), like the prompts and plans tabs,
// and live in their OWN store — separate from the Ideas feature.

const EMPTY = { title: '', body: '' };

export default function PromptNotesPanel({ notes, onAddNote, onUpdateNote, onDeleteNote }) {
  const { t } = useT();

  // editingId: null → list view; '' → adding a new note; an id → editing that note.
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function reset() {
    setEditingId(null);
    setDraft(EMPTY);
    setError('');
  }

  function startAdd() {
    setEditingId('');
    setDraft(EMPTY);
    setError('');
  }

  function startEdit(n) {
    setEditingId(n.id);
    setDraft({ title: n.title || '', body: n.body || '' });
    setError('');
  }

  async function save(e) {
    e.preventDefault();
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (!title && !body) { setError(t('notes.needsContent')); return; }
    setBusy(true);
    setError('');
    try {
      if (editingId) await onUpdateNote(editingId, title, body);
      else await onAddNote(title, body);
      reset();
    } catch {
      setError(t('notes.saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    try {
      await onDeleteNote(id);
      if (editingId === id) reset();
    } catch {
      setError(t('notes.saveError'));
    }
  }

  // ---- EDITOR (adding or editing) ----
  if (editingId !== null) {
    return (
      <div className="note-mgr">
        <button type="button" className="plan-mgr__back" onClick={reset}>
          &larr; {t('notes.back')}
        </button>
        <form className="prompt-mgr__form" onSubmit={save}>
          <p className="prompt-mgr__formhint">{editingId ? t('notes.editNote') : t('notes.newNote')}</p>
          <input
            className="prompt-mgr__label-input"
            type="text"
            placeholder={t('notes.titlePlaceholder')}
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
          <textarea
            className="prompt-mgr__text-input"
            placeholder={t('notes.bodyPlaceholder')}
            rows={6}
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          />
          {error && <p className="prompt-mgr__error" role="alert">{error}</p>}
          <div className="prompt-mgr__actions">
            <button type="submit" className="prompt-mgr__save" disabled={busy || (!draft.title.trim() && !draft.body.trim())}>
              {editingId ? t('notes.save') : t('notes.add')}
            </button>
            <button type="button" className="prompt-mgr__cancel" onClick={reset}>{t('notes.cancel')}</button>
          </div>
        </form>
      </div>
    );
  }

  // ---- LIST VIEW ----
  return (
    <div className="note-mgr">
      {notes.length === 0 && <p className="prompt-mgr__empty">{t('notes.empty')}</p>}
      <ul className="prompt-mgr__list">
        {notes.map((n) => (
          <li key={n.id} className="prompt-mgr__item">
            <div className="prompt-mgr__item-main">
              {n.title && <span className="prompt-mgr__item-label">{n.title}</span>}
              {n.body && <span className="prompt-mgr__item-text">{n.body}</span>}
            </div>
            <div className="prompt-mgr__item-actions">
              <button type="button" className="prompt-mgr__item-btn" onClick={() => startEdit(n)}>
                {t('notes.edit')}
              </button>
              <button type="button" className="prompt-mgr__item-btn" onClick={() => remove(n.id)}>
                {t('notes.delete')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {error && <p className="prompt-mgr__error" role="alert">{error}</p>}
      <p className="prompt-mgr__formhint">{t('notes.newHint')}</p>
      <div className="prompt-mgr__actions">
        <button type="button" className="prompt-mgr__save" onClick={startAdd}>
          + {t('notes.create')}
        </button>
      </div>
    </div>
  );
}
