import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import Loading from '../components/shared/Loading';
import ErrorBanner from '../components/shared/ErrorBanner';
import { useRepo } from '../context/RepoContext';
import { useT } from '../i18n/LanguageContext';
import './git.css';

// Read-only git status view (plans/git-tab.md): branch, ahead/behind vs
// upstream, and the working-tree changes. No actions — the agent performs
// all git mutations through chat.
const GROUPS = [
  { key: 'conflicts', test: (f) => f.conflicted },
  { key: 'staged', test: (f) => !f.conflicted && !f.untracked && f.index !== '.' },
  { key: 'changed', test: (f) => !f.conflicted && !f.untracked && f.worktree !== '.' },
  { key: 'untracked', test: (f) => f.untracked },
];

function statusLetter(f) {
  if (f.untracked) return '?';
  if (f.conflicted) return 'U';
  return f.worktree !== '.' ? f.worktree : f.index;
}

export default function Git() {
  const { t } = useT();
  const { currentRepoId } = useRepo();

  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');

  // Initial/background loads stay fast (no fetch); the "check origin" button
  // passes fetch=true for a real origin comparison (plans/git-origin-sync.md).
  const load = useCallback(async (fetchOrigin = false) => {
    setError('');
    if (fetchOrigin) setChecking(true);
    try {
      setStatus(await apiGet(fetchOrigin ? '/git/status?fetch=true' : '/git/status'));
    } catch {
      setError(t('git.loadError'));
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, [t]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load, currentRepoId]);

  // Re-check when the phone comes back to the page.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  if (loading) return <Loading label={t('git.loading')} />;
  if (error) return <ErrorBanner message={error} onRetry={() => load()} />;
  if (!status) return null;

  const groups = GROUPS
    .map((g) => ({ key: g.key, files: status.files.filter(g.test) }))
    .filter((g) => g.files.length > 0);
  const clean = status.files.length === 0;

  return (
    <div className="git-page">
      <div className="git-branch">
        <div className="git-branch__name">
          <span aria-hidden="true">⎇</span> {status.branch}
        </div>
        {status.upstream ? (
          <div className="git-branch__sync">
            {status.upstream}
            {status.ahead > 0 && (
              <span className="git-branch__ahead">
                {t(status.ahead === 1 ? 'git.aheadOne' : 'git.ahead', { n: status.ahead })}
              </span>
            )}
            {status.behind > 0 && (
              <span className="git-branch__behind">
                {t(status.behind === 1 ? 'git.behindOne' : 'git.behind', { n: status.behind })}
              </span>
            )}
            {status.ahead === 0 && status.behind === 0 && (
              <span className="git-branch__insync">
                {status.fetched ? t('git.inSyncOrigin') : t('git.inSync')}
              </span>
            )}
          </div>
        ) : (
          <div className="git-branch__sync">
            <span className="git-branch__noupstream">{t('git.noUpstream')}</span>
          </div>
        )}
        {status.baseBranch && (
          <div className="git-branch__sync git-branch__base">
            {status.baseAhead > 0 && (
              <span className="git-branch__ahead">
                {t(status.baseAhead === 1 ? 'git.baseAheadOne' : 'git.baseAhead', {
                  n: status.baseAhead, base: status.baseBranch,
                })}
              </span>
            )}
            {status.baseBehind > 0 && (
              <span className="git-branch__behind">
                {t(status.baseBehind === 1 ? 'git.baseBehindOne' : 'git.baseBehind', {
                  n: status.baseBehind, base: status.baseBranch,
                })}
              </span>
            )}
            {status.baseAhead === 0 && status.baseBehind === 0 && (
              <span className="git-branch__insync">
                {t('git.baseInSync', { base: status.baseBranch })}
              </span>
            )}
          </div>
        )}
        {/* Origin-aware positions (plans/git-origin-visibility.md): HEAD vs
            origin/main directly — skipped when another row already shows the
            same ref (upstream on the base branch, or the baseBranch fallback). */}
        {status.originBaseBranch
          && status.originBaseBranch !== status.upstream
          && status.originBaseBranch !== status.baseBranch && (
          <div className="git-branch__sync git-branch__base">
            {status.originBaseAhead > 0 && (
              <span className="git-branch__ahead">
                {t(status.originBaseAhead === 1 ? 'git.baseAheadOne' : 'git.baseAhead', {
                  n: status.originBaseAhead, base: status.originBaseBranch,
                })}
              </span>
            )}
            {status.originBaseBehind > 0 && (
              <span className="git-branch__behind">
                {t(status.originBaseBehind === 1 ? 'git.baseBehindOne' : 'git.baseBehind', {
                  n: status.originBaseBehind, base: status.originBaseBranch,
                })}
              </span>
            )}
            {status.originBaseAhead === 0 && status.originBaseBehind === 0 && (
              <span className="git-branch__insync">
                {t('git.baseInSync', { base: status.originBaseBranch })}
              </span>
            )}
          </div>
        )}
        {/* Stale-local-main warning — the 2026-06-12 silent drift. Hidden on
            the base branch itself (the upstream row covers it there). */}
        {status.branch !== status.localBaseBranch
          && (status.baseDriftBehind > 0 || status.baseDriftAhead > 0) && (
          <div className="git-branch__drift" role="note">
            <span aria-hidden="true">⚠</span>
            {status.baseDriftBehind > 0 && (
              <span>{t('git.driftBehind', { base: status.localBaseBranch, n: status.baseDriftBehind })}</span>
            )}
            {status.baseDriftAhead > 0 && (
              <span>{t('git.driftAhead', { base: status.localBaseBranch, n: status.baseDriftAhead })}</span>
            )}
          </div>
        )}
        <button
          type="button"
          className="git-refresh"
          onClick={() => load(true)}
          disabled={checking}
        >
          {checking ? t('git.checking') : t('git.checkOrigin')}
        </button>
        <span className="git-fetchedat">
          {status.fetchedAt
            ? t('git.fetchedAt', {
                time: new Date(status.fetchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              })
            : t('git.neverFetched')}
        </span>
        {status.fetchError && (
          <div className="git-branch__fetcherror">{t('git.fetchError')}</div>
        )}
      </div>

      {clean ? (
        <div className="git-clean">
          <p className="git-clean__icon" aria-hidden="true">✓</p>
          <h2>{t('git.clean')}</h2>
          <p>{t('git.cleanHint')}</p>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="git-group">
            <h3 className={`git-group__title git-group__title--${g.key}`}>
              {t(`git.group.${g.key}`)} ({g.files.length})
            </h3>
            <ul className="git-files">
              {g.files.map((f) => (
                <li key={f.path} className="git-file">
                  <span className={`git-file__status git-file__status--${g.key}`}>
                    {statusLetter(f)}
                  </span>
                  <span className="git-file__path">{f.path}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
