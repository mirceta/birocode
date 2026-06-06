import { friendlyDate } from './formatDate';

// Slide-down panel listing the user's past conversations. Tapping one resumes
// it; "New conversation" starts fresh. Uses only "conversations" language --
// never "session" or "thread".
export default function SessionPicker({
  open,
  sessions,
  loading,
  error,
  activeId,
  onSelect,
  onNew,
  onClose,
}) {
  if (!open) return null;

  return (
    <>
      <div className="picker-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="picker" role="dialog" aria-label="Your conversations">
        <div className="picker__header">
          <span className="picker__title">Your conversations</span>
          <button
            type="button"
            className="picker__close"
            onClick={onClose}
            aria-label="Close"
          >
            Close
          </button>
        </div>

        <button type="button" className="picker__new" onClick={onNew}>
          <span className="picker__new-plus" aria-hidden="true">+</span>
          New conversation
        </button>

        {loading && <div className="picker__hint">Loading your conversations...</div>}
        {error && <div className="picker__hint">Couldn't load conversations.</div>}
        {!loading && !error && sessions.length === 0 && (
          <div className="picker__hint">No conversations yet. Start a new one!</div>
        )}

        <ul className="picker__list">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={`picker__item${s.id === activeId ? ' is-active' : ''}`}
                onClick={() => onSelect(s.id)}
              >
                <span className="picker__item-title">
                  {s.title || s.firstPrompt || 'Conversation'}
                </span>
                <span className="picker__item-meta">
                  {[friendlyDate(s.lastModified), messageCount(s.turnCount)]
                    .filter(Boolean)
                    .join(' -- ')}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

function messageCount(turns) {
  if (!turns && turns !== 0) return '';
  return `${turns} ${turns === 1 ? 'message' : 'messages'}`;
}
