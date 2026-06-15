import { useT } from '../../i18n/LanguageContext';

// A star toggle that marks an agent "important" (plans/important-agents.md):
// the dock gets a bright-red thick border and sorts first on the dashboard.
// Like CopyPath, it lives INSIDE the card/dock's open-agent <button>, so it's a
// role="button" span (not a nested <button>, which is invalid HTML) and stops
// the click from bubbling so it toggles instead of opening the agent.
// `className` selects per-surface placement (phone__important / dash-cell__important).
export default function ImportantStar({ important, onToggle, className = '' }) {
  const { t } = useT();
  const label = important ? t('dashboard.unmarkImportant') : t('dashboard.markImportant');

  function click(e) {
    e.stopPropagation();
    e.preventDefault();
    onToggle();
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' || e.key === ' ') click(e);
  }

  return (
    <span
      role="button"
      tabIndex={0}
      className={`important-star${important ? ' important-star--on' : ''}${className ? ` ${className}` : ''}`}
      onClick={click}
      onKeyDown={onKeyDown}
      aria-pressed={important}
      title={label}
      aria-label={label}
    >
      {important ? '★' : '☆'}
    </span>
  );
}
