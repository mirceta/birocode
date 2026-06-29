import { useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';
import './dockIdentity.css';

// Two read-only identity rows for an agent dock's git section (openspec
// add-git-identity-surface): who this repo's commits are authored as, and which
// GitHub account a push authenticates as. The commit identity rides in on the dock's
// existing /api/git/status payload (commitIdentity); the push account is the box's
// global gh login, polled from /api/github-account (the same probe the dashboard chip
// uses). The two are independent — commit identity is per-repo config, push identity
// is the one global token — and that distinction is the whole point of showing both.
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

export default function DockIdentityRows({ commitIdentity, repoId }) {
  const { t } = useT();
  const acct = useGitHubAccount(repoId);

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
