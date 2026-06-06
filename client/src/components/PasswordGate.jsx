import { useState } from 'react';
import { setPassword } from '../api/client';
import { useT } from '../i18n/LanguageContext';

export default function PasswordGate({ onUnlock }) {
  const { t } = useT();
  const [value, setValue] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    const pw = value.trim();
    if (!pw) return;
    setPassword(pw);
    if (onUnlock) {
      onUnlock();
    } else {
      window.location.reload();
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
        />
        <button className="pw-gate__button" type="submit" disabled={!value.trim()}>
          {t('pwgate.continue')}
        </button>
      </form>
    </div>
  );
}
