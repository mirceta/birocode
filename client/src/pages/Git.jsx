import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../api/client';
import { friendlyDate } from '../components/chat/formatDate';
import Loading from '../components/shared/Loading';
import ErrorBanner from '../components/shared/ErrorBanner';
import { useRepo } from '../context/RepoContext';
import { useFeature } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';
import './git.css';

// Git tab (plans/git-tab.md + plans/git-actions.md): a fixed position card —
// the same "n ahead · m behind" rows every time (vs main, origin/main,
// origin/B) — and three inward-sync actions (merge main into branch, pull
// main, pull branch). No push/rebase/checkout: publishing stays with Claude
// in chat. Actions are blocked while a chat run mutates this repo.
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

function PositionRow({ a, b, label, missingLabel }) {
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

export default function Git() {
  const { t } = useT();
  const { currentRepoId } = useRepo();
  const showActions = useFeature('gitActions');

  const showBranchList = useFeature('gitBranchList');

  const [status, setStatus] = useState(null);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [acting, setActing] = useState(''); // which action is in flight
  const [actionMsg, setActionMsg] = useState(null); // { ok, text }

  const load = useCallback(async (fetchOrigin = false) => {
    setError('');
    if (fetchOrigin) setChecking(true);
    try {
      setStatus(await apiGet(fetchOrigin ? '/git/status?fetch=true' : '/git/status'));
      // Branch overview is best-effort: its failure never blocks the card.
      apiGet('/git/branches').then(setBranches).catch(() => setBranches([]));
    } catch {
      setError(t('git.loadError'));
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, [t]);

  // Tab open / repo switch: fetch origin so all three rows are honest
  // (agreed addition 1). Visibility returns stay cheap.
  useEffect(() => {
    setLoading(true);
    setActionMsg(null);
    load(true);
  }, [load, currentRepoId]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const act = async (name, path) => {
    setActing(name);
    setActionMsg(null);
    try {
      const r = await apiPost(path);
      setActionMsg({ ok: true, text: r.updated ? t('git.actUpdated') : t('git.actNoop') });
    } catch (err) {
      let text = err.message;
      try {
        text = JSON.parse(err.message).error || text;
      } catch { /* raw text */ }
      setActionMsg({ ok: false, text });
    } finally {
      setActing('');
      load();
    }
  };

  if (loading) return <Loading label={t('git.loading')} />;
  if (error) return <ErrorBanner message={error} onRetry={() => load()} />;
  if (!status) return null;

  const groups = GROUPS
    .map((g) => ({ key: g.key, files: status.files.filter(g.test) }))
    .filter((g) => g.files.length > 0);
  const clean = status.files.length === 0;

  const onBase = status.branch === status.localBaseBranch;
  const busy = !!status.busy;
  const base = status.localBaseBranch || status.baseBranch;
  // The originBase row dedupes only against an IDENTICAL baseBranch fallback
  // (no local main) — otherwise all three rows always render (user's spec).
  const showBaseRow = !onBase && !!status.baseBranch;
  const showOriginBaseRow = !!status.originBaseBranch
    && status.originBaseBranch !== status.baseBranch
    && !(onBase && status.originBaseBranch === status.upstream);
  const canMerge = !busy && clean && !onBase && status.baseBehind > 0
    && status.baseBranch === status.localBaseBranch;
  const canPullMain = !busy && !!base && (onBase ? status.behind > 0 : status.baseDriftBehind > 0);
  const canPullBranch = !busy && !onBase && !!status.upstream && status.behind > 0;
  // Publishable (no upstream yet) or carrying unpushed commits.
  const canPush = !busy && (!status.upstream || status.ahead > 0);

  return (
    <div className="git-page">
      <div className="git-branch">
        <div className="git-branch__name">
          <span aria-hidden="true">⎇</span> {status.branch}
        </div>

        <div className="git-rows">
          {showBaseRow && (
            <PositionRow a={status.baseAhead} b={status.baseBehind} label={status.baseBranch} />
          )}
          {showOriginBaseRow && (
            <PositionRow a={status.originBaseAhead} b={status.originBaseBehind} label={status.originBaseBranch} />
          )}
          <PositionRow
            a={status.ahead}
            b={status.behind}
            label={status.upstream}
            missingLabel={t('git.noUpstream')}
          />
        </div>

        {showActions && (
          <div className="git-actions">
            {!onBase && (
              <button
                type="button"
                className="git-action"
                disabled={!canMerge || !!acting}
                onClick={() => act('merge', '/git/merge-base')}
              >
                {acting === 'merge' ? t('git.acting') : t('git.actMerge', { base })}
              </button>
            )}
            <button
              type="button"
              className="git-action"
              disabled={!canPullMain || !!acting}
              onClick={() => act('pullMain', onBase ? '/git/pull-current' : '/git/pull-base')}
            >
              {acting === 'pullMain' ? t('git.acting') : t('git.actPullMain', { base: base || 'main' })}
            </button>
            {!onBase && (
              <button
                type="button"
                className="git-action"
                disabled={!canPullBranch || !!acting}
                onClick={() => act('pullBranch', '/git/pull-current')}
              >
                {acting === 'pullBranch' ? t('git.acting') : t('git.actPullBranch')}
              </button>
            )}
            <button
              type="button"
              className="git-action"
              disabled={!canPush || !!acting}
              onClick={() => act('push', '/git/push-current')}
            >
              {acting === 'push' ? t('git.acting') : t('git.actPush')}
            </button>
          </div>
        )}
        {showActions && busy && <div className="git-acthint">{t('git.actBusy')}</div>}
        {showActions && !busy && !clean && !onBase && status.baseBehind > 0 && (
          <div className="git-acthint">{t('git.actDirty')}</div>
        )}
        {actionMsg && (
          <div className={`git-actmsg git-actmsg--${actionMsg.ok ? 'ok' : 'err'}`} role="status">
            {actionMsg.text}
          </div>
        )}

        <button
          type="button"
          className="git-refresh"
          onClick={() => load(true)}
          disabled={checking || !!acting}
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

      {/* Other branches (plans/git-branches.md): same convention per branch,
          led by the last commit — the "what was I doing there" memory aid.
          Read-only; the action buttons only ever touch the checked-out branch. */}
      {showBranchList && branches.length > 0 && (
        <section className="git-others">
          <h3 className="git-others__title">{t('git.others')} ({branches.length})</h3>
          {branches.map((b) => (
            <div key={b.name} className="git-other">
              <div className="git-other__head">
                <span className="git-other__name">
                  <span aria-hidden="true">⎇</span> {b.name}
                </span>
                <span className="git-other__meta">
                  “{b.subject}” · {friendlyDate(b.committedAt, t)}
                </span>
              </div>
              <div className="git-rows">
                {status.localBaseBranch && (
                  <PositionRow a={b.baseAhead} b={b.baseBehind} label={status.localBaseBranch} />
                )}
                {status.originBaseBranch && (
                  <PositionRow a={b.originBaseAhead} b={b.originBaseBehind} label={status.originBaseBranch} />
                )}
                {b.hasUpstream ? (
                  <PositionRow a={b.upstreamAhead} b={b.upstreamBehind} label={`origin/${b.name}`} />
                ) : (
                  <PositionRow label={null} missingLabel={t('git.noUpstream')} />
                )}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
