import { useEffect, useRef } from 'react';
import { useT } from '../../i18n/LanguageContext';

// Controlled composer. The draft text lives in ChatContext (so it persists
// across tab navigation and can be appended to by other tabs), and is passed
// in via value/onChange.
export default function ChatInput({ value, onChange, onSend, onStop, streaming }) {
  const { t } = useT();
  const textareaRef = useRef(null);
  const disabled = streaming;

  // Auto-grow to fit the content. Runs on every value change -- including when
  // the draft is restored after navigating back, or cleared after sending.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  function submit() {
    const trimmed = (value || '').trim();
    if (!trimmed || disabled) return;
    onSend(trimmed); // ChatContext clears the draft on send
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const canSend = (value || '').trim().length > 0 && !disabled;

  return (
    <div className="chat-input">
      <textarea
        ref={textareaRef}
        className="chat-input__field"
        placeholder={t('chat.inputPlaceholder')}
        rows={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-label={t('chat.inputAria')}
      />
      {streaming ? (
        <button
          type="button"
          className="chat-input__send chat-input__stop"
          onClick={onStop}
          aria-label={t('chat.stopAria')}
        >
          <span className="chat-input__stop-square" aria-hidden="true" />
          {t('chat.stop')}
        </button>
      ) : (
        <button
          type="button"
          className="chat-input__send"
          onClick={submit}
          disabled={!canSend}
          aria-label={t('chat.sendAria')}
        >
          {t('chat.send')}
        </button>
      )}
    </div>
  );
}
