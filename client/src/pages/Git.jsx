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
        <button
          type="button"
          className="git-refresh"
          onClick={() => load(true)}
          disabled={checking}
        >
          {checking ? t('git.checking') : t('git.checkOrigin')}
        </button>
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
