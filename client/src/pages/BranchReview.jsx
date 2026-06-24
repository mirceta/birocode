import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api/client';
import { friendlyDate } from '../components/chat/formatDate';
import { useT } from '../i18n/LanguageContext';

// Branch "PR preview" (plans/git-pr-preview.md): for the checked-out feature
// branch, show what a GitHub pull request would — where it left the base, the
// commits unique to it (base..HEAD) and the cumulative changed-file list
// (base...HEAD). Read-only; distinct from the working-tree status above. Each
// file's full patch is fetched lazily on expand so a huge diff never ships up
// front. The base is auto-detected but Operator-overridable via the picker
// (plans/.../add-selectable-review-base).
function statusClass(s) {
  switch (s) {
    case 'A': return 'add';
    case 'D': return 'del';
    case 'R': return 'ren';
    case 'C': return 'ren';
    default: return 'mod';
  }
}

function FileRow({ file, baseRef }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [patch, setPatch] = useState(null); // { text, truncated } | 'error' | null
  const [loading, setLoading] = useState(false);

  // A base change above resets this row entirely (key= path|base in the parent),
  // so we never need to invalidate within a row instance.
  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && patch === null && !loading) {
      setLoading(true);
      try {
        const q = `path=${encodeURIComponent(file.path)}`
          + (baseRef ? `&base=${encodeURIComponent(baseRef)}` : '');
        const r = await apiGet(`/git/review/file?${q}`);
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

const STORAGE_PREFIX = 'claudeweb_reviewBase_';
function readStoredBase(repoId) {
  if (!repoId) return null;
  try {
    return localStorage.getItem(STORAGE_PREFIX + repoId) || null;
  } catch {
    return null;
  }
}
function writeStoredBase(repoId, ref) {
  if (!repoId) return;
  try {
    if (ref) localStorage.setItem(STORAGE_PREFIX + repoId, ref);
    else localStorage.removeItem(STORAGE_PREFIX + repoId);
  } catch { /* private mode etc. — silently skip */ }
}

export default function BranchReview({ branch, repoId }) {
  const { t } = useT();
  const [review, setReview] = useState(null);
  const [open, setOpen] = useState(false);
  const [bases, setBases] = useState(null); // { default, bases:[{ref,kind}] } | 'error' | null
  // null = "use server default once review loads"; string = explicit pick.
  const [selectedBase, setSelectedBase] = useState(null);

  // Reset picker state when the repo changes; rehydrate the stored pick.
  useEffect(() => {
    setSelectedBase(readStoredBase(repoId));
    setBases(null);
  }, [repoId]);

  const load = useCallback(async (baseParam) => {
    try {
      const q = baseParam ? `?base=${encodeURIComponent(baseParam)}` : '';
      setReview(await apiGet(`/git/review${q}`));
    } catch {
      setReview(null);
    }
  }, []);

  useEffect(() => {
    load(selectedBase);
  }, [load, branch, repoId, selectedBase]);

  // Fetch the candidate-bases list once per repo (lazy: only when the review
  // is actually shown — saves the call on non-feature branches).
  useEffect(() => {
    if (!review?.isFeatureBranch || bases) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await apiGet('/git/review/bases');
        if (!cancelled) setBases(r);
      } catch {
        if (!cancelled) setBases('error');
      }
    })();
    return () => { cancelled = true; };
  }, [review?.isFeatureBranch, bases]);

  // Pre-select stored base if still present in the list; else fall back to the
  // server default. Only runs when selectedBase is null (no explicit pick yet).
  useEffect(() => {
    if (selectedBase || !bases || bases === 'error') return;
    const stored = readStoredBase(repoId);
    const known = bases.bases?.some((b) => b.ref === stored);
    if (stored && known) setSelectedBase(stored);
    else if (bases.default) setSelectedBase(bases.default);
  }, [bases, repoId, selectedBase]);

  const onPickBase = useCallback((ref) => {
    setSelectedBase(ref || null);
    writeStoredBase(repoId, ref || null);
  }, [repoId]);

  // The base actually used by the displayed review (server-truthful).
  const usedBase = review?.base || selectedBase || null;

  // Stable key so each file row resets its expanded patch when the base changes.
  const fileKeySuffix = useMemo(() => usedBase || '', [usedBase]);

  if (!review || !review.isFeatureBranch) return null;

  const commits = review.commits || [];
  const files = review.files || [];
  const basesList = bases && bases !== 'error' ? bases.bases || [] : [];
  const serverDefault = bases && bases !== 'error' ? bases.default : null;

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
          <div className="git-review__picker">
            <label className="git-review__picker-label" htmlFor="git-review-base">
              {t('git.reviewBaseLabel')}
            </label>
            <select
              id="git-review-base"
              className="git-review__picker-select"
              aria-label={t('git.reviewBaseAria')}
              value={usedBase || ''}
              disabled={!bases || bases === 'error'}
              onChange={(e) => onPickBase(e.target.value)}
            >
              {/* Always include the currently-used base — covers the case where
                  the list hasn't loaded yet or the server picked something the
                  list doesn't echo (it always should, but be defensive). */}
              {usedBase && !basesList.some((b) => b.ref === usedBase) && (
                <option value={usedBase}>{usedBase}</option>
              )}
              {basesList.map((b) => (
                <option key={`${b.kind}:${b.ref}`} value={b.ref}>
                  {b.ref === serverDefault
                    ? t('git.reviewBaseDefault', { ref: b.ref })
                    : b.ref}
                </option>
              ))}
            </select>
            {bases === 'error' && (
              <span className="git-review__picker-error">
                {t('git.reviewBaseLoadError')}
              </span>
            )}
          </div>

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
                <FileRow key={`${f.path}|${fileKeySuffix}`} file={f} baseRef={usedBase} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
