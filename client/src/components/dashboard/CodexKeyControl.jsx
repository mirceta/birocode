import { useState } from 'react';
import { apiPost } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';

// Write-only control to log the box's Codex CLI in from a pasted OpenAI API key
// (openspec codex-real-run) — the Codex twin of GitHubTokenControl. It POSTs the key
// to /api/codex-credentials, which pipes it to `codex login --with-api-key` over
// stdin (CodexCredentialsService); Codex writes its own auth.json under its home and
// every codex-engine turn reads it from there. The field is never pre-filled and is
// cleared the moment it is submitted, so the key never lingers in the DOM.
export default function CodexKeyControl({ onSaved }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [state, setState] = useState('idle'); // idle | saving | saved | error
  const [msg, setMsg] = useState('');

  async function save(e) {
    e.preventDefault();
    const value = key.trim();
    if (!value || state === 'saving') return;
    setState('saving');
    try {
      const r = await apiPost('/codex-credentials', { apiKey: value });
      setKey(''); // clear immediately — never keep the secret around
      if (r && r.ok) {
        setState('saved');
        setMsg(r.method || t('codexKey.saved'));
        if (onSaved) onSaved();
      } else {
        setState('error');
        setMsg((r && r.error) || t('codexKey.failed'));
      }
    } catch {
      setKey('');
      setState('error');
      setMsg(t('codexKey.failed'));
    }
  }

  if (!open) {
    return (
      <button type="button" className="ghtok__toggle ghtok__toggle--codex" onClick={() => setOpen(true)}>
        {t('codexKey.title')}
      </button>
    );
  }

  return (
    <form className="ghtok ghtok--codex" onSubmit={save}>
      <div className="ghtok__field">
        <input
          type="password"
          className="ghtok__input"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={t('codexKey.placeholder')}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-label={t('codexKey.title')}
        />
        <button type="submit" className="ghtok__save" disabled={!key.trim() || state === 'saving'}>
          {state === 'saving' ? t('codexKey.saving') : t('codexKey.save')}
        </button>
      </div>
      <div className="ghtok__hint">{t('codexKey.hint')}</div>
      {state === 'saved' && <div className="ghtok__msg ghtok__msg--ok">{msg}</div>}
      {state === 'error' && <div className="ghtok__msg ghtok__msg--err">{msg}</div>}
    </form>
  );
}
