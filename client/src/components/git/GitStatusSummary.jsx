import { useT } from '../../i18n/LanguageContext';
import './gitStatusSummary.css';

// The branch + "n ahead · m behind" position rows shown at the top of the Git
// tab. Extracted so the Git tab, the dashboard cards, and the dashboard phone
// docks all render git state identically and can't drift (plans/dashboard-git-status.md).
//
// `status` is a /api/git/status payload. Renders nothing useful for a non-git
// repo (no branch) — callers should gate on a real status first.

export function PositionRow({ a, b, label, missingLabel }) {
  const { t } = useT();
  if (!label) {
    return (
      <div className="git-row">
        <span className="git-row__counts git-row__counts--missing">{missingLabel}</span>
      </div>
    );
  }
  return (
    <div className="git-row">
      <span className={`git-row__counts${a === 0 && b === 0 ? ' git-row__counts--insync' : ''}`}>
        {t('git.aheadBehind', { a, b })}
      </span>
      <span className="git-row__ref">{label}</span>
    </div>
  );
}

export default function GitStatusSummary({ status, compact = false }) {
  const { t } = useT();
  if (!status || !status.branch) return null;

  const onBase = status.branch === status.localBaseBranch;
  // Same row-visibility rules as the Git tab: the base row hides when we're on
  // the base branch; the origin-base row dedupes against an identical fallback.
  const showBaseRow = !onBase && !!status.baseBranch;
  const showOriginBaseRow =
    !!status.originBaseBranch &&
    status.originBaseBranch !== status.baseBranch &&
    !(onBase && status.originBaseBranch === status.upstream);

  return (
    <div className={`git-summary${compact ? ' git-summary--compact' : ''}`}>
      <div className="git-branch__name">
        <span aria-hidden="true">⎇</span> {status.branch}
      </div>
      <div className="git-rows">
        {showBaseRow && (
          <PositionRow a={status.baseAhead} b={status.baseBehind} label={status.baseBranch} />
        )}
        {showOriginBaseRow && (
          <PositionRow
            a={status.originBaseAhead}
            b={status.originBaseBehind}
            label={status.originBaseBranch}
          />
        )}
        <PositionRow
          a={status.ahead}
          b={status.behind}
          label={status.upstream}
          missingLabel={t('git.noUpstream')}
        />
      </div>
    </div>
  );
}
