import { useState } from 'react';
import { setPassword } from '../api/client';

// The only auth UI in the app. If no password is stored, we show a friendly
// full-screen prompt. Saving stores it in localStorage and reloads so the rest
// of the app mounts with the password available for every /api call.
//
// Intentionally non-technical copy -- the user just thinks of it as the code
// that unlocks her workspace.
export default function PasswordGate({ onUnlock }) {
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
        <h1 className="pw-gate__title">Welcome back</h1>
        <p className="pw-gate__subtitle">
          Enter your access code to open your workspace.
        </p>
        <input
          className="pw-gate__input"
          type="password"
          inputMode="text"
          autoFocus
          placeholder="Access code"
          aria-label="Access code"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button className="pw-gate__button" type="submit" disabled={!value.trim()}>
          Continue
        </button>
      </form>
    </div>
  );
}
