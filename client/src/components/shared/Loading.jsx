import { useT } from '../../i18n/LanguageContext';

export default function Loading({ label }) {
  const { t } = useT();
  const text = label ?? t('common.justAMoment');
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="loading__spinner" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}
