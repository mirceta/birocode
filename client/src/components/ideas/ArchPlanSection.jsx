import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPut } from '../../api/client';
import ErrorBanner from '../shared/ErrorBanner';
import Markdown from '../shared/Markdown';
import { useT } from '../../i18n/LanguageContext';

// The single global, user-written "architectural plan" document
// (plans/ideas-arch-plan.md), shown as its own tall tab in the Ideas surface.
// View renders the doc as Markdown; Edit drops to a plain-text textarea (the raw
// markdown). Saved via GET/PUT /api/arch-plan. Fills the panel height so there's
// room to read/write a lot.
export default function ArchPlanSection() {
  const { t } = useT();
  const [text, setText] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiGet('/arch-plan');
      setText(typeof data?.text === 'string' ? data.text : '');
    } catch {
      setError(t('archplan.loadError'));
    } finally {
      setLoaded(true);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  function startEdit() {
    setDraft(text);
    setEditing(true);
    setError('');
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const data = await apiPut('/arch-plan', { text: draft });
      setText(typeof data?.text === 'string' ? data.text : draft);
      setEditing(false);
    } catch {
      setError(t('archplan.saveError'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="archplan">
      {error && <ErrorBanner message={error} />}

      {editing ? (
        <>
          <textarea
            className="ideas__input archplan__textarea"
            placeholder={t('archplan.placeholder')}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          <div className="idea__actions archplan__actions">
            <button type="button" className="idea__btn idea__btn--primary" onClick={save} disabled={saving}>
              {saving ? t('archplan.saving') : t('ideas.save')}
            </button>
            <button type="button" className="idea__btn" onClick={() => setEditing(false)} disabled={saving}>
              {t('common.cancel')}
            </button>
          </div>
        </>
      ) : (
        <>
          {text.trim() ? (
            <div className="archplan__view">
              <Markdown>{text}</Markdown>
            </div>
          ) : (
            <div className="archplan__view archplan__view--empty">
              <p className="ideas__muted">{loaded ? t('archplan.empty') : t('ideas.loading')}</p>
            </div>
          )}
          <div className="idea__actions archplan__actions">
            <button type="button" className="idea__btn" onClick={startEdit}>
              {t('archplan.edit')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
