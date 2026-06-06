import { friendlyDate } from './friendlyDate';
import { useT } from '../../i18n/LanguageContext';

export default function RestoreConfirm({ entry, restoring, onConfirm, onCancel }) {
  const { t } = useT();
  return (
    <div
      className="hist-modal__backdrop"
      role="presentation"
      onClick={restoring ? undefined : onCancel}
    >
      <div
        className="hist-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="restore-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="restore-modal-title" className="hist-modal__title">
          {t('history.confirmTitle')}
        </h2>
        <p className="hist-modal__body">{t('history.confirmBody')}</p>

        <p className="hist-modal__quote">
          {entry.message ? `"${entry.message}"` : t('history.noDescription')}
        </p>
        <p className="hist-modal__meta">{friendlyDate(entry.date, t)}</p>

        <div className="hist-modal__actions">
          <button
            type="button"
            className="hist-btn hist-btn--ghost"
            onClick={onCancel}
            disabled={restoring}
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="hist-btn hist-btn--danger"
            onClick={onConfirm}
            disabled={restoring}
          >
            {restoring ? t('history.goingBack') : t('history.goBackShort')}
          </button>
        </div>
      </div>
    </div>
  );
}
