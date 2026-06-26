import { useMemo } from 'react';
import MessageBubble from './MessageBubble';
import { useT } from '../../i18n/LanguageContext';

// Operator messages panel (openspec: add-operator-message-history). The sibling
// of the tool-calls drawer: an overlay over the chat message area that lists
// every message the OPERATOR (the `user` role) sent in the ACTIVE conversation,
// in order, rendered as the same user bubbles the transcript uses.
//
// Purely client-side — operator messages are already in the loaded conversation
// (unlike tool calls, whose steps are stripped from the transcript and need a
// GET /sessions/{id}/tools fetch to rebuild). Data comes via props (not useChat)
// so the SAME panel serves both the active chat and an embedded Agent Dashboard
// dock, each bound to its own conversation. Reuses the .operators* styles, which
// parallel .toolcalls* so the two drawers look identical.
export default function OperatorMessagesPanel({ open, onClose, messages = [] }) {
  const { t } = useT();

  const operatorMessages = useMemo(
    () => messages.filter((m) => m.role === 'user'),
    [messages],
  );

  if (!open) return null;

  return (
    <section className="operators" role="region" aria-label={t('chat.operatorMessages')}>
      <div className="operators__head">
        <span className="operators__title">
          {t('chat.operatorMessages')}
          {operatorMessages.length > 0 && (
            <span className="operators__count">{operatorMessages.length}</span>
          )}
        </span>
        <button
          type="button"
          className="operators__close"
          onClick={onClose}
          aria-label={t('chat.operatorMessagesClose')}
          title={t('chat.operatorMessagesClose')}
        >
          ✕
        </button>
      </div>
      <div className="operators__body">
        {operatorMessages.length === 0 ? (
          <p className="operators__empty">{t('chat.operatorMessagesEmpty')}</p>
        ) : (
          operatorMessages.map((m, i) => (
            <MessageBubble key={i} role="user" text={m.text} />
          ))
        )}
      </div>
    </section>
  );
}
