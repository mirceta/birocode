import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../../i18n/LanguageContext';

// A large, distraction-free editor for the current chat draft (openspec:
// add-prompt-expand-popup). The composer's auto-growing textarea is fine until
// you write a long, multi-part turn on a phone, where it renders as a cramped
// sliver. This portals a centered modal to <body> (like PromptManager, so a
// small dashboard-dock window can't clip it) holding ONE big textarea bound to
// the SAME draft the composer edits — value/onChange come straight from
// ChatContext, no local copy. Editing here and editing in the composer are the
// same edit; closing is a pure unmount.
//
// It never sends and never clears: sending stays the composer's job, so the
// close -> review -> send flow matches every other prompt-entry path. Close via
// the Done button, a backdrop click, or Esc.
//
// Saved prompts (openspec expand-popup-prompt-list): below the editor sits the
// user's custom prompt library — the SAME global backend-synced store the ⚙
// manager edits (prompts/onAddPrompt come from PromptsContext via ChatInput).
// Insert APPENDS a prompt's text to the draft (blank-line separated, no send,
// popup stays open), and a minimal create form saves a new prompt into the
// store so it shows up everywhere. The fixed catalog stays ⚙-only, and
// template `{{param}}` bodies insert verbatim — this popup IS an editor, so
// placeholders are filled by editing. The whole section rides the
// customPrompts capability (promptsEnabled).
export default function PromptExpandModal({ value, onChange, onClose, promptsEnabled = false, prompts = [], onAddPrompt }) {
  const { t } = useT();
  const textareaRef = useRef(null);

  // Create-form state. Deliberately minimal (label + text, default emoji) —
  // emoji choice and editing stay in the ⚙ manager.
  const [newLabel, setNewLabel] = useState('');
  const [newText, setNewText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Focus the editor on open and close on Esc.
  useEffect(() => {
    textareaRef.current?.focus();
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Same append contract as the composer's insertPrompt: nothing is lost,
  // nothing auto-sends — and here the popup stays open for more editing.
  function insert(text) {
    const current = (value || '').trim();
    onChange(current ? `${current}\n\n${text}` : text);
    textareaRef.current?.focus();
  }

  async function saveNew(e) {
    e.preventDefault();
    if (!newText.trim() || busy || !onAddPrompt) return;
    setBusy(true);
    setError('');
    try {
      await onAddPrompt('💡', newLabel.trim(), newText.trim());
      setNewLabel('');
      setNewText('');
    } catch {
      setError(t('prompts.saveError'));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="prompt-expand-backdrop" onClick={onClose}>
      <div
        className={`prompt-expand${promptsEnabled ? ' prompt-expand--lib' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('chat.expandTitle')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="prompt-expand__head">
          <div className="prompt-expand__title">{t('chat.expandTitle')}</div>
          <button
            type="button"
            className="prompt-expand__close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            &times;
          </button>
        </div>
        <textarea
          ref={textareaRef}
          className="prompt-expand__field"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('chat.inputPlaceholder')}
          aria-label={t('chat.expandAria')}
        />
        {promptsEnabled && (
          <div className="prompt-expand__library" aria-label={t('chat.expandPromptsTitle')}>
            <div className="prompt-expand__lib-title">{t('chat.expandPromptsTitle')}</div>
            {prompts.length > 0 ? (
              <ul className="prompt-expand__lib-list">
                {prompts.map((p) => (
                  <li key={p.id} className="prompt-expand__lib-item">
                    <span className="prompt-expand__lib-emoji" aria-hidden="true">{p.emoji}</span>
                    <span className="prompt-expand__lib-body" title={p.text}>
                      {p.label && <span className="prompt-expand__lib-label">{p.label}</span>}
                      <span className="prompt-expand__lib-text">{p.text}</span>
                    </span>
                    <button
                      type="button"
                      className="prompt-expand__lib-insert"
                      onClick={() => insert(p.text)}
                    >
                      {t('chat.expandInsert')}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="prompt-expand__lib-empty">{t('chat.expandPromptsEmpty')}</p>
            )}
            <form className="prompt-expand__new" onSubmit={saveNew}>
              <span className="prompt-expand__new-hint">{t('chat.expandNewHint')}</span>
              <div className="prompt-expand__new-row">
                <input
                  className="prompt-expand__new-label"
                  type="text"
                  placeholder={t('prompts.labelPlaceholder')}
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
                <button
                  type="submit"
                  className="prompt-expand__new-save"
                  disabled={busy || !newText.trim()}
                >
                  {t('chat.expandSavePrompt')}
                </button>
              </div>
              <textarea
                className="prompt-expand__new-text"
                rows={2}
                placeholder={t('prompts.textPlaceholder')}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
              />
              {error && <p className="prompt-expand__new-error" role="alert">{error}</p>}
            </form>
          </div>
        )}
        <div className="prompt-expand__foot">
          <button type="button" className="prompt-expand__done" onClick={onClose}>
            {t('chat.expandDone')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
