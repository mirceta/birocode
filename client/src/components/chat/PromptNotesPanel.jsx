import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/LanguageContext';

// The "Notes" tab of the ⚙ modal (openspec add-prompt-notes-tab). ONE freeform white
// canvas — a single document the user reads and edits, drafting the messy first step
// of planning before it's ported into a prompt PLAN. The canvas is resizable (drag the
// corner to make it as big as you like), autosaves a short moment after you stop
// typing, and has an explicit Save button too. Global + backend-synced via
// PromptNotesContext, in its OWN store (separate from the Ideas feature).

const AUTOSAVE_MS = 1000;

export default function PromptNotesPanel({ text, loaded, onSave }) {
  const { t } = useT();

  // Local draft mirrors the canvas; `saved` is the last value known to be on the
  // backend, so we can show clean/dirty and skip no-op saves.
  const [draft, setDraft] = useState(text);
  const [saved, setSaved] = useState(text);
  const [status, setStatus] = useState('idle'); // idle | saving | saved | error
  const timer = useRef(null);

  // Latest draft/saved/onSave for the unmount flush, which only runs once and must
  // not capture stale closure values.
  const latest = useRef({ draft, saved, onSave });
  latest.current = { draft, saved, onSave };

  // Adopt the backend value once it loads (or changes underneath us) — but only when
  // there are no unsaved local edits, so we never stomp what the user is typing.
  useEffect(() => {
    if (draft === saved) {
      setDraft(text);
      setSaved(text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, loaded]);

  // On unmount (modal closed / tab switched), FLUSH any unsaved edit rather than
  // dropping it — losing a note you just typed would be the worst failure here.
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    const cur = latest.current;
    if (cur.draft !== cur.saved) cur.onSave(cur.draft).catch(() => {});
  }, []);

  const dirty = draft !== saved;

  async function persist(value) {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    setStatus('saving');
    try {
      const stored = await onSave(value);
      setSaved(stored);
      setStatus('saved');
    } catch {
      setStatus('error');
    }
  }

  function onChange(e) {
    const value = e.target.value;
    setDraft(value);
    setStatus('idle');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { persist(value); }, AUTOSAVE_MS);
  }

  // Save immediately when focus leaves the canvas (e.g. reaching for the Save button
  // or clicking elsewhere) so the debounce window can't swallow a quick edit.
  function onBlur() {
    if (draft !== saved && status !== 'saving') persist(draft);
  }

  function saveNow() {
    persist(draft);
  }

  const statusText =
    status === 'saving' ? t('notes.saving')
      : status === 'error' ? t('notes.saveError')
        : dirty ? t('notes.unsaved')
          : t('notes.saved');

  return (
    <div className="note-mgr">
      <textarea
        className="note-mgr__canvas"
        placeholder={t('notes.canvasPlaceholder')}
        value={draft}
        onChange={onChange}
        onBlur={onBlur}
        disabled={!loaded}
        spellCheck={false}
      />
      <div className="note-mgr__bar">
        <span className={`note-mgr__status${status === 'error' ? ' note-mgr__status--error' : ''}`} role="status">
          {statusText}
        </span>
        <button
          type="button"
          className="prompt-mgr__save"
          onClick={saveNow}
          disabled={!loaded || status === 'saving' || !dirty}
        >
          {t('notes.save')}
        </button>
      </div>
    </div>
  );
}
