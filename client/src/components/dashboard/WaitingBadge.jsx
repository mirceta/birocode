import { useT } from '../../i18n/LanguageContext';

// A toggle that marks an agent "waiting for another agent to finish"
// (plans/agent-waiting.md): the dock gets an amber waiting cue (and an inline
// "waiting on which agent?" field — see WaitingOnField). Sibling of
// ImportantStar — it lives INSIDE the card/dock's open-agent <button>, so it's a
// role="button" span (not a nested <button>, which is invalid HTML) and stops
// the click from bubbling so it toggles instead of opening the agent.
// `className` selects per-surface placement (phone__waiting / dash-cell__waiting).
export default function WaitingBadge({ waiting, onToggle, className = '' }) {
  const { t } = useT();
  const label = waiting ? t('dashboard.unmarkWaiting') : t('dashboard.markWaiting');

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
      className={`waiting-badge${waiting ? ' waiting-badge--on' : ''}${className ? ` ${className}` : ''}`}
      onClick={click}
      onKeyDown={onKeyDown}
      aria-pressed={waiting}
      title={label}
      aria-label={label}
    >
      ⏳
    </span>
  );
}
