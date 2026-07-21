import { useEffect, useState } from 'react';
import { apiGet, apiPost, ApiError } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';
import './dockIdentity.css';

// Two identity rows for an agent dock's git section (openspec
// add-git-identity-surface + add-commit-identity-write): who this repo's commits are
// authored as, and which GitHub account a push authenticates as. The commit identity
// rides in on the dock's existing /api/git/status payload (commitIdentity); the push
// account is the box's global gh login, polled from /api/github-account (the same
// probe the dashboard chip uses). The two are independent — commit identity is per-repo
// config, push identity is the one global token — and that distinction is the whole
// point of showing both.
//
// The "commits as" row is EDITABLE (add-commit-identity-write): the push side is
// already settable via the dashboard PAT control, so this closes the asymmetry by
// letting the commit identity be set right where it's shown, writing user.name/email
// through POST /api/git/identity. The "pushes as" row stays read-only.
const POLL_MS = 10000;

function useGitHubAccount(repoId) {
  const [acct, setAcct] = useState(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const d = await apiGet('/github-account', { repoId });
        if (alive) setAcct(d);
      } catch {
        /* keep last good */
      }
    };
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [repoId]);
  return acct;
}

// Inline editor for the commit identity. Seeds from the current values, writes via
// POST /api/git/identity, and on success asks the dock to re-fetch git status
// (onSaved) so the row reflects the authoritative post-write identity.
function CommitIdentityEditor({ identity, repoId, onSaved, onClose }) {
  const { t } = useT();
  const [name, setName] = useState(identity?.name || '');
  const [email, setEmail] = useState(identity?.email || '');
  // Default the scope to the existing one when set, else a per-repo (local) write.
  const [scope, setScope] = useState(identity?.scope === 'global' ? 'global' : 'local');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const canSave = !saving && (name.trim() || email.trim());

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await apiPost('/git/identity', { name: name.trim(), email: email.trim(), scope }, { repoId });
      onSaved?.();
      onClose();
    } catch (err) {
      let text = t('gitIdentity.edit.error');
      if (err instanceof ApiError) {
        try {
          text = JSON.parse(err.message).error || text;
        } catch {
          /* keep default */
        }
      }
      setError(text);
      setSaving(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') save();
    else if (e.key === 'Escape') onClose();
  };

  return (
    <div className="dock-id__edit" onKeyDown={onKeyDown}>
      <input
        className="dock-id__input"
        type="text"
        value={name}
        placeholder={t('gitIdentity.edit.name')}
        aria-label={t('gitIdentity.edit.name')}
        onChange={(e) => setName(e.target.value)}
        disabled={saving}
        autoFocus
      />
      <input
        className="dock-id__input"
        type="email"
        value={email}
        placeholder={t('gitIdentity.edit.email')}
        aria-label={t('gitIdentity.edit.email')}
        onChange={(e) => setEmail(e.target.value)}
        disabled={saving}
      />
      <select
        className="dock-id__scope"
        value={scope}
        aria-label={t('gitIdentity.edit.scopeLocal')}
        onChange={(e) => setScope(e.target.value)}
        disabled={saving}
      >
        <option value="local">{t('gitIdentity.edit.scopeLocal')}</option>
        <option value="global">{t('gitIdentity.edit.scopeGlobal')}</option>
      </select>
      <button type="button" className="dock-id__btn dock-id__btn--save" disabled={!canSave} onClick={save}>
        {saving ? t('gitIdentity.edit.saving') : t('gitIdentity.edit.save')}
      </button>
      <button type="button" className="dock-id__btn" disabled={saving} onClick={onClose}>
        {t('gitIdentity.edit.cancel')}
      </button>
      {error && <span className="dock-id__error" role="alert">{error}</span>}
    </div>
  );
}

export default function DockIdentityRows({ commitIdentity, repoId, onSaved }) {
  const { t } = useT();
  const acct = useGitHubAccount(repoId);
  const [editing, setEditing] = useState(false);

  // commits as <name> <email>  ·  [global|local] badge
  const ci = commitIdentity || { scope: 'unset' };
  const hasCommit = ci.scope !== 'unset' && (ci.name || ci.email);

  // pushes as <login | not authenticated | not installed | …>
  let pushState = 'loading';
  let pushText = t('account.checking');
  if (acct) {
    if (!acct.ghInstalled) {
      pushState = 'missing';
      pushText = t('account.github.missing');
    } else if (acct.authenticated) {
      pushState = 'ok';
      pushText = `@${acct.account}`;
    } else {
      pushState = 'unauth';
      pushText = t('account.notAuthed');
    }
  }

  return (
    <div className="dock-id" aria-label={t('gitIdentity.label')}>
      <div className="dock-id__row">
        <span className="dock-id__key">{t('gitIdentity.commitsAs')}</span>
        {editing ? (
          <CommitIdentityEditor
            identity={ci}
            repoId={repoId}
            onSaved={onSaved}
            onClose={() => setEditing(false)}
          />
        ) : (
          <>
            {hasCommit ? (
              <>
                <span className="dock-id__val" title={ci.email || ''}>
                  {ci.name || ci.email}
                  {ci.name && ci.email ? ` <${ci.email}>` : ''}
                </span>
                <span className={`dock-id__badge dock-id__badge--${ci.scope}`}>
                  {t(`gitIdentity.scope.${ci.scope}`)}
                </span>
              </>
            ) : (
              <span className="dock-id__val dock-id__val--muted">{t('gitIdentity.notSet')}</span>
            )}
            <button
              type="button"
              className="dock-id__pencil"
              title={t('gitIdentity.edit.open')}
              aria-label={t('gitIdentity.edit.open')}
              onClick={() => setEditing(true)}
            >
              ✎
            </button>
          </>
        )}
      </div>
      <div className="dock-id__row">
        <span className="dock-id__key">{t('gitIdentity.pushesAs')}</span>
        <span className={`dock-id__dot dock-id__dot--${pushState}`} aria-hidden="true" />
        <span className={`dock-id__val${pushState === 'ok' ? '' : ' dock-id__val--muted'}`}>
          {pushText}
        </span>
      </div>
    </div>
  );
}
