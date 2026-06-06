import { useT } from '../../i18n/LanguageContext';

export default function ThinkingIndicator() {
  const { t } = useT();
  return (
    <div className="msg msg--assistant">
      <div className="msg__bubble msg__bubble--thinking" role="status" aria-label={t('chat.thinkingAria')}>
        <span className="thinking-dot" />
        <span className="thinking-dot" />
        <span className="thinking-dot" />
      </div>
    </div>
  );
}
