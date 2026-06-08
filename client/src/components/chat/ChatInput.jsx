import { useEffect, useRef } from 'react';
import { useT } from '../../i18n/LanguageContext';

// Controlled composer. The draft text lives in ChatContext (so it persists
// across tab navigation and can be appended to by other tabs), and is passed
// in via value/onChange. An optional attachment (image/file) can be added via
// the paperclip button; it is uploaded on send and its path appended to the
// message so Claude can Read it.
export default function ChatInput({ value, onChange, onSend, onStop, streaming, attachment, onAttach }) {
  const { t } = useT();
  const textareaRef = useRef(null);
  const fileRef = useRef(null);
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
    if ((!trimmed && !attachment) || disabled) return;
    onSend(trimmed);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) onAttach(file);
    // Reset so the same file can be re-selected.
    e.target.value = '';
  }

  const canSend = ((value || '').trim().length > 0 || !!attachment) && !disabled;

  return (
    <div className="chat-input">
      {attachment && (
        <div className="chat-input__preview">
          {attachment.type.startsWith('image/') ? (
            <img
              className="chat-input__thumb"
              src={URL.createObjectURL(attachment)}
              alt={attachment.name}
            />
          ) : (
            <span className="chat-input__file-name">{attachment.name}</span>
          )}
          <button
            type="button"
            className="chat-input__remove"
            onClick={() => onAttach(null)}
            aria-label={t('common.close')}
          >
            &times;
          </button>
        </div>
      )}
      <div className="chat-input__row">
        <button
          type="button"
          className="chat-input__attach"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          aria-label={t('chat.attach')}
          title={t('chat.attach')}
        >
          +
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,.txt,.md,.json,.csv,.xml,.html,.css,.js,.ts,.jsx,.tsx,.py,.cs,.java,.rb,.go,.rs,.c,.cpp,.h"
          className="chat-input__file-hidden"
          onChange={handleFileChange}
        />
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
    </div>
  );
}
