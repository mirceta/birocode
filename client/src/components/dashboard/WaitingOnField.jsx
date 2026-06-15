import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/LanguageContext';

// The free-text "waiting on which agent?" field (plans/agent-waiting.md), shown
// under a dock that's marked waiting (see WaitingBadge). Commits on blur / Enter
// rather than on every keystroke, so we don't PATCH the backend per character.
// It re-seeds from the backing value when that changes elsewhere (another
// device / a poll) but never clobbers what the user is mid-typing. Stops
// click/keydown from bubbling to the dock's open-agent button.
export default function WaitingOnField({ value, onCommit, className = '' }) {
  const { t } = useT();
  const [text, setText] = useState(value || '');
  const lastValue = useRef(value || '');

  useEffect(() => {
    const incoming = value || '';
    if (incoming !== lastValue.current) {
      lastValue.current = incoming;
      setText(incoming);
    }
  }, [value]);

  function commit() {
    const next = text.trim();
    if (next !== (lastValue.current || '')) {
      lastValue.current = next;
      onCommit(next);
    }
  }

  return (
    <div
      className={`waiting-on${className ? ` ${className}` : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="waiting-on__icon" aria-hidden="true">⏳</span>
      <input
        type="text"
        className="waiting-on__input"
        value={text}
        placeholder={t('dashboard.waitingOnPlaceholder')}
        aria-label={t('dashboard.waitingOnLabel')}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            commit();
            e.currentTarget.blur();
          }
        }}
      />
    </div>
  );
}
