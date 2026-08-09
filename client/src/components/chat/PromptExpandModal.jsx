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
// Queued prompts (openspec expand-popup-prompt-list, amended): below the editor
// sits the surface's QUEUE STASH — the cached prompts on the composer strip,
// the same items an armed 🗒️ queue loop unloads in order (stash/onAddStash come
// from ChatInput's queueTabId resolution, so a dock lists its OWN tab's queue).
// Entries are numbered in strip order; Insert APPENDS an item's text to the
// draft (blank-line separated, no send, popup stays open) and never consumes
// the item — the strip keeps remove/reorder/send. A minimal form queues a new
// item into the same stash. The custom-prompts library stays ⚙-only. The whole
// section rides the promptStash capability (stashEnabled).
export default function PromptExpandModal({ value, onChange, onClose, stashEnabled = false, stash = [], onAddStash }) {
  const { t } = useT();
  const textareaRef = useRef(null);

  // Add-to-queue form state. Deliberately minimal (text only) — queued items
  // have no label/emoji, and remove/reorder stay on the composer strip.
  const [newText, setNewText] = useState('');

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

  function queueNew(e) {
    e.preventDefault();
    const text = newText.trim();
    if (!text || !onAddStash) return;
    onAddStash(text);
    setNewText('');
  }

  return createPortal(
    <div className="prompt-expand-backdrop" onClick={onClose}>
      <div
        className={`prompt-expand${stashEnabled ? ' prompt-expand--lib' : ''}`}
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
        {stashEnabled && (
          <div className="prompt-expand__library" aria-label={t('chat.expandPromptsTitle')}>
            <div className="prompt-expand__lib-title">{t('chat.expandPromptsTitle')}</div>
            {stash.length > 0 ? (
              <ul className="prompt-expand__lib-list">
                {stash.map((item, idx) => (
                  <li key={item.id} className="prompt-expand__lib-item">
                    <span className="prompt-expand__lib-num" aria-hidden="true">{idx + 1}</span>
                    <span className="prompt-expand__lib-body" title={item.text}>
                      <span className="prompt-expand__lib-text">{item.text}</span>
                    </span>
                    <button
                      type="button"
                      className="prompt-expand__lib-insert"
                      onClick={() => insert(item.text)}
                    >
                      {t('chat.expandInsert')}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="prompt-expand__lib-empty">{t('chat.expandPromptsEmpty')}</p>
            )}
            <form className="prompt-expand__new" onSubmit={queueNew}>
              <span className="prompt-expand__new-hint">{t('chat.expandNewHint')}</span>
              <textarea
                className="prompt-expand__new-text"
                rows={2}
                placeholder={t('prompts.textPlaceholder')}
                value={newText}
                onChange={(e) => setNewText(e.target.value)}
              />
              <div className="prompt-expand__new-row">
                <button
                  type="submit"
                  className="prompt-expand__new-save"
                  disabled={!newText.trim()}
                >
                  {t('chat.expandSavePrompt')}
                </button>
              </div>
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
