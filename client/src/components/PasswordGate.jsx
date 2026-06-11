import { useState } from 'react';
import { apiPost } from '../api/client';
import { useT } from '../i18n/LanguageContext';

// Login gate (plans/auth-login.md): POSTs the password to /api/auth/login,
// which sets the HttpOnly session cookie. Wrong password and brute-force
// lockout (429 + retryAfterSeconds) are surfaced inline.
export default function PasswordGate({ onUnlock }) {
  const { t } = useT();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleSubmit(e) {
    e.preventDefault();
    const pw = value.trim();
    if (!pw || busy) return;
    setBusy(true);
    setError(null);
    try {
      await apiPost('/auth/login', { password: pw });
      if (onUnlock) {
        onUnlock();
      } else {
        window.location.reload();
      }
    } catch (err) {
      let body = null;
      try {
        body = JSON.parse(err.message);
      } catch {
        /* not JSON */
      }
      if (err.status === 429) {
        setError(t('pwgate.throttled', { seconds: body?.retryAfterSeconds ?? '?' }));
      } else {
        setError(t('pwgate.wrong'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pw-gate">
      <form className="pw-gate__card" onSubmit={handleSubmit}>
        <div className="pw-gate__emoji" aria-hidden="true">
          *
        </div>
        <h1 className="pw-gate__title">{t('pwgate.title')}</h1>
        <p className="pw-gate__subtitle">{t('pwgate.subtitle')}</p>
        <input
          className="pw-gate__input"
          type="password"
          inputMode="text"
          autoFocus
          placeholder={t('pwgate.placeholder')}
          aria-label={t('pwgate.aria')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={busy}
        />
        <button className="pw-gate__button" type="submit" disabled={!value.trim() || busy}>
          {t('pwgate.continue')}
        </button>
        {error && <p className="pw-gate__error">{error}</p>}
      </form>
    </div>
  );
}
