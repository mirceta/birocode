import { friendlyDate } from './formatDate';
import { useT } from '../../i18n/LanguageContext';

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
  const { t } = useT();
  if (!open) return null;

  return (
    <>
      <div className="picker-backdrop" onClick={onClose} aria-hidden="true" />
      <div className="picker" role="dialog" aria-label={t('chat.yourConversations')}>
        <div className="picker__header">
          <span className="picker__title">{t('chat.yourConversations')}</span>
          <button
            type="button"
            className="picker__close"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            {t('common.close')}
          </button>
        </div>

        <button type="button" className="picker__new" onClick={onNew}>
          <span className="picker__new-plus" aria-hidden="true">+</span>
          {t('picker.newConversation')}
        </button>

        {loading && <div className="picker__hint">{t('picker.loading')}</div>}
        {error && <div className="picker__hint">{t('picker.loadError')}</div>}
        {!loading && !error && sessions.length === 0 && (
          <div className="picker__hint">{t('picker.empty')}</div>
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
                  {s.title || s.firstPrompt || t('picker.untitled')}
                </span>
                <span className="picker__item-meta">
                  {[friendlyDate(s.lastModified, t), messageCount(s.turnCount, t)]
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

function messageCount(turns, t) {
  if (turns == null) return '';
  return t(turns === 1 ? 'picker.messageOne' : 'picker.messageMany', { count: turns });
}
