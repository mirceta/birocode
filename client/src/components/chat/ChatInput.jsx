import { useRef, useState } from 'react';

// Message composer fixed at the bottom of the chat, above the nav bar. Grows
// with content up to a few lines, sends on Enter (Shift+Enter for newline),
// and is disabled while a response is streaming so the user can't send two
// messages at once.
export default function ChatInput({ onSend, disabled }) {
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
    // Auto-grow the textarea up to its CSS max-height.
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
        placeholder="Type a message..."
        rows={1}
        value={value}
        disabled={disabled}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        aria-label="Type a message"
      />
      <button
        type="button"
        className="chat-input__send"
        onClick={submit}
        disabled={!canSend}
        aria-label="Send"
      >
        Send
      </button>
    </div>
  );
}
