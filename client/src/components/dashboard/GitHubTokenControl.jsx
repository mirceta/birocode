import { useState } from 'react';
import { apiPost } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';

// Write-only control to set the box's global GitHub credential from a pasted PAT
// (openspec add-git-identity-surface). It POSTs the token to /api/github-credentials,
// which hands it to `gh` over stdin and wires git — see GitHubCredentialsService. The
// field is write-only: it is never pre-filled from a stored value and is cleared the
// moment it is submitted, so a token never lingers in the DOM. This sets the push/API
// (auth) identity only — it does NOT change the commit author.
export default function GitHubTokenControl({ onSaved }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState('');
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  const [msg, setMsg] = useState('');

  async function save(e) {
    e.preventDefault();
    const value = token.trim();
    if (!value || state === 'saving') return;
    setState('saving');
    try {
      const r = await apiPost('/github-credentials', { token: value });
      setToken(''); // clear immediately — never keep the secret around
      if (r && r.ok) {
        setState('saved');
        setMsg(r.account ? `@${r.account}` : t('ghToken.saved'));
        if (onSaved) onSaved();
      } else {
        setState('error');
        setMsg((r && r.error) || t('ghToken.failed'));
      }
    } catch {
      setToken('');
      setState('error');
      setMsg(t('ghToken.failed'));
    }
  }

  if (!open) {
    return (
      <button type="button" className="ghtok__toggle" onClick={() => setOpen(true)}>
        {t('ghToken.title')}
      </button>
    );
  }

  return (
    <form className="ghtok" onSubmit={save}>
      <div className="ghtok__field">
        <input
          type="password"
          className="ghtok__input"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={t('ghToken.placeholder')}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={t('ghToken.title')}
        />
        <button type="submit" className="ghtok__save" disabled={!token.trim() || state === 'saving'}>
          {state === 'saving' ? t('ghToken.saving') : t('ghToken.save')}
        </button>
      </div>
      <div className="ghtok__hint">{t('ghToken.hint')}</div>
      {state === 'saved' && <div className="ghtok__msg ghtok__msg--ok">{msg}</div>}
      {state === 'error' && <div className="ghtok__msg ghtok__msg--err">{msg}</div>}
    </form>
  );
}
