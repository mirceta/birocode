import { useT } from '../../i18n/LanguageContext';

// A toggle that enlarges a dock to two horizontal spaces
// (plans/dock-double-width.md): the dock's grid cell gets grid-column: span 2,
// so this one agent takes double the width while the rest stay compact. Sibling
// of ImportantStar — it lives INSIDE the card/dock's open-agent <button>, so it
// is a role="button" span (not a nested <button>, which is invalid HTML) and
// stops the click from bubbling so it toggles instead of opening the agent.
// `className` selects per-surface placement (phone__wide / dash-cell__wide).
export default function WideToggle({ wide, onToggle, className = '' }) {
  const { t } = useT();
  const label = wide ? t('dashboard.unmarkWide') : t('dashboard.markWide');

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
      className={`wide-toggle${wide ? ' wide-toggle--on' : ''}${className ? ` ${className}` : ''}`}
      onClick={click}
      onKeyDown={onKeyDown}
      aria-pressed={wide}
      title={label}
      aria-label={label}
    >
      ⤢
    </span>
  );
}
