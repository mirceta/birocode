import { useT } from '../../i18n/LanguageContext';

// "Depends on…" picker (plans/dependent-agents.md): sets which PRIMARY agent
// this dock depends on. When set, the dashboard groups this (dependent) dock
// under its primary and renders it smaller. A plain <select> of the other
// dashboard agents; the empty option clears the dependency. Rendered as a
// sibling OUTSIDE the dock's open-agent button (a <select> can't nest in a
// <button>); stops click/change from bubbling to the open-agent handler.
export default function DependsOnPicker({ value, candidates, onChange, className = '' }) {
  const { t } = useT();

  return (
    <label
      className={`depends-on${className ? ` ${className}` : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      <span className="depends-on__icon" aria-hidden="true">🔗</span>
      <select
        className="depends-on__select"
        value={value || ''}
        aria-label={t('dashboard.dependsOnLabel')}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{t('dashboard.dependsOnNone')}</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>{c.repoName}</option>
        ))}
      </select>
    </label>
  );
}
