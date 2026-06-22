import { useEffect, useRef } from 'react';
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
export default function PromptExpandModal({ value, onChange, onClose }) {
  const { t } = useT();
  const textareaRef = useRef(null);

  // Focus the editor on open and close on Esc.
  useEffect(() => {
    textareaRef.current?.focus();
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="prompt-expand-backdrop" onClick={onClose}>
      <div
        className="prompt-expand"
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
