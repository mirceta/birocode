import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import { friendlyDate } from '../components/chat/formatDate';
import { useT } from '../i18n/LanguageContext';

// Branch "PR preview" (plans/git-pr-preview.md): for the checked-out feature
// branch, show what a GitHub pull request would — where it left the base, the
// commits unique to it (base..HEAD) and the cumulative changed-file list
// (base...HEAD). Read-only; distinct from the working-tree status above. Each
// file's full patch is fetched lazily on expand so a huge diff never ships up
// front.
function statusClass(s) {
  switch (s) {
    case 'A': return 'add';
    case 'D': return 'del';
    case 'R': return 'ren';
    case 'C': return 'ren';
    default: return 'mod';
  }
}

function FileRow({ file }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [patch, setPatch] = useState(null); // { text, truncated } | 'error' | null
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && patch === null && !loading) {
      setLoading(true);
      try {
        const r = await apiGet(`/git/review/file?path=${encodeURIComponent(file.path)}`);
        setPatch({ text: r.patch, truncated: r.truncated });
      } catch {
        setPatch('error');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <li className="git-rvfile">
      <button type="button" className="git-rvfile__head" onClick={toggle} aria-expanded={open}>
        <span className={`git-rvfile__status git-rvfile__status--${statusClass(file.status)}`}>
          {file.status}
        </span>
        <span className="git-rvfile__path">
          {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
        </span>
        <span className="git-rvfile__counts">
          {file.binary ? (
            <span className="git-rvfile__bin">{t('git.reviewBinary')}</span>
          ) : (
            <>
              {file.added > 0 && <span className="git-rvfile__add">+{file.added}</span>}
              {file.deleted > 0 && <span className="git-rvfile__del">−{file.deleted}</span>}
            </>
          )}
        </span>
      </button>
      {open && (
        <div className="git-rvfile__body">
          {loading && <div className="git-rvfile__hint">{t('git.reviewLoadingPatch')}</div>}
          {patch === 'error' && <div className="git-rvfile__hint">{t('git.reviewPatchError')}</div>}
          {patch && patch !== 'error' && (
            <>
              <pre className="git-rvpatch">{patch.text}</pre>
              {patch.truncated && (
                <div className="git-rvfile__hint">{t('git.reviewPatchTruncated')}</div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

export default function BranchReview({ branch, repoId }) {
  const { t } = useT();
  const [review, setReview] = useState(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setReview(await apiGet('/git/review'));
    } catch {
      setReview(null);
    }
  }, []);

  // Reload when the branch or repo changes (best-effort, never blocks the tab).
  useEffect(() => { load(); }, [load, branch, repoId]);

  if (!review || !review.isFeatureBranch) return null;

  const commits = review.commits || [];
  const files = review.files || [];

  return (
    <section className="git-review">
      <button
        type="button"
        className="git-review__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="git-review__caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        <span className="git-review__title">{t('git.review')}</span>
        <span className="git-review__into">
          {t('git.reviewInto', { branch, base: review.base })}
        </span>
        <span className="git-review__summary">
          {t('git.reviewSummary', { commits: commits.length, files: files.length })}
        </span>
      </button>

      {open && (
        <div className="git-review__body">
          <p className="git-review__hint">
            {t('git.reviewHint', { base: review.base })}
            {review.mergeBase
              ? ` (${t('git.reviewDiverged', { mergeBase: review.mergeBase })})`
              : ''}
          </p>
          {review.truncated && (
            <p className="git-review__truncated">{t('git.reviewTruncated')}</p>
          )}

          <h4 className="git-review__subtitle">
            {t('git.reviewCommits')} ({commits.length})
          </h4>
          {commits.length === 0 ? (
            <p className="git-review__empty">{t('git.reviewNoCommits')}</p>
          ) : (
            <ul className="git-rvcommits">
              {commits.map((c) => (
                <li key={c.short} className="git-rvcommit">
                  <code className="git-rvcommit__hash">{c.short}</code>
                  <span className="git-rvcommit__subject">{c.subject}</span>
                  <span className="git-rvcommit__meta">{friendlyDate(c.date, t)}</span>
                </li>
              ))}
            </ul>
          )}

          <h4 className="git-review__subtitle">
            {t('git.reviewFiles')} ({files.length})
          </h4>
          {files.length === 0 ? (
            <p className="git-review__empty">{t('git.reviewNoFiles')}</p>
          ) : (
            <ul className="git-rvfiles">
              {files.map((f) => (
                <FileRow key={f.path} file={f} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
