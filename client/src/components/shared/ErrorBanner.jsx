import { useT } from '../../i18n/LanguageContext';

export default function ErrorBanner({ message, onRetry }) {
  const { t } = useT();
  if (!message) return null;
  return (
    <div className="error-banner" role="alert">
      <span className="error-banner__icon" aria-hidden="true">
        !
      </span>
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="error-banner__retry" onClick={onRetry}>
          {t('common.tryAgain')}
        </button>
      )}
    </div>
  );
}
