import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client';
import { useRepo } from '../context/RepoContext';
import ErrorBanner from '../components/shared/ErrorBanner';
import { useT } from '../i18n/LanguageContext';
import './ideas.css';

// The Ideas tab (plans/ideas-tab.md): per-project notes stored on the backend.
// Scoped to the selected project by the X-Repo-Id header (like Files/Git), so
// switching projects shows a different set. Page-local state — notes are only
// needed here, no global context.
function relTime(ms, t) {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return t('ideas.justNow');
  const m = Math.round(s / 60);
  if (m < 60) return t('ideas.minutesAgo', { n: m });
  const h = Math.round(m / 60);
  if (h < 24) return t('ideas.hoursAgo', { n: h });
  const d = Math.round(h / 24);
  return t('ideas.daysAgo', { n: d });
}

export default function Ideas() {
  const { t } = useT();
  const { currentRepoId, current } = useRepo();

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState('');
  const draftRef = useRef(null);

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await apiGet('/notes');
      setNotes(Array.isArray(data) ? data : []);
    } catch {
      setError(t('ideas.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  // Tab open / project switch: re-fetch this project's notes.
  useEffect(() => {
    setLoading(true);
    setEditingId(null);
    load();
  }, [load, currentRepoId]);

  async function add() {
    const text = draft.trim();
    if (!text || adding) return;
    setAdding(true);
    setError('');
    try {
      const note = await apiPost('/notes', { text });
      setNotes((prev) => [note, ...prev]);
      setDraft('');
      draftRef.current?.focus();
    } catch {
      setError(t('ideas.saveError'));
    } finally {
      setAdding(false);
    }
  }

  async function saveEdit(id) {
    const text = editDraft.trim();
    if (!text) return;
    const prev = notes;
    setNotes((ns) => ns.map((n) => (n.id === id ? { ...n, text, updatedAt: Date.now() } : n)));
    setEditingId(null);
    try {
      await apiPatch(`/notes/${id}`, { text });
    } catch {
      setNotes(prev);
      setError(t('ideas.saveError'));
    }
  }

  async function remove(id) {
    const prev = notes;
    setNotes((ns) => ns.filter((n) => n.id !== id));
    try {
      await apiDelete(`/notes/${id}`);
    } catch {
      setNotes(prev);
      setError(t('ideas.deleteError'));
    }
  }

  // Ctrl/Cmd+Enter submits the composer (the textarea keeps plain Enter for newlines).
  function onDraftKey(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      add();
    }
  }

  return (
    <div className="ideas">
      <div className="ideas__compose">
        <textarea
          ref={draftRef}
          className="ideas__input"
          placeholder={t('ideas.placeholder', { project: current?.name || '' })}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onDraftKey}
          rows={3}
        />
        <button type="button" className="ideas__add" onClick={add} disabled={adding || !draft.trim()}>
          {adding ? t('ideas.adding') : t('ideas.add')}
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="ideas__list">
        {loading ? (
          <p className="ideas__muted">{t('ideas.loading')}</p>
        ) : notes.length === 0 ? (
          <p className="ideas__muted">{t('ideas.empty')}</p>
        ) : (
          notes.map((n) => (
            <div key={n.id} className="idea">
              {editingId === n.id ? (
                <div className="idea__edit">
                  <textarea
                    className="ideas__input"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  <div className="idea__actions">
                    <button type="button" className="idea__btn idea__btn--primary" onClick={() => saveEdit(n.id)} disabled={!editDraft.trim()}>
                      {t('ideas.save')}
                    </button>
                    <button type="button" className="idea__btn" onClick={() => setEditingId(null)}>
                      {t('common.cancel')}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="idea__text">{n.text}</p>
                  <div className="idea__foot">
                    <span className="idea__time">{relTime(n.updatedAt || n.createdAt, t)}</span>
                    <button type="button" className="idea__btn" onClick={() => { setEditingId(n.id); setEditDraft(n.text); }}>
                      {t('ideas.edit')}
                    </button>
                    <button type="button" className="idea__btn idea__btn--danger" onClick={() => remove(n.id)}>
                      {t('ideas.delete')}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
