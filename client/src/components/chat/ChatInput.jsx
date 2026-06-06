import { useRef, useState } from 'react';
import { useT } from '../../i18n/LanguageContext';

export default function ChatInput({ onSend, disabled }) {
  const { t } = useT();
  const [value, setValue] = useState('');
  const textareaRef = useRef(null);

  function submit() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function handleChange(e) {
    setValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className="chat-input">
      <textarea
        ref={textareaRef}
        className="chat-input__field"
        placeholder={t('chat.inputPlaceholder')}
        rows={1}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-label={t('chat.inputAria')}
      />
      <button
        type="button"
        className="chat-input__send"
        onClick={submit}
        disabled={!canSend}
        aria-label={t('chat.sendAria')}
      >
        {t('chat.send')}
      </button>
    </div>
  );
}
