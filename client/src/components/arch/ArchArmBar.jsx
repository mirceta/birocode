import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { armView, ARM_RULES } from './armModel';
import './archArmBar.css';

// The arch agent's ONE on/off, always in view (openspec arch-arm-control): on every arch
// conversation and in the Management App's arch cards. Says plainly whether the arch can send
// tasks, what keeps it on — or why it went off and when — and offers the one switch.
export default function ArchArmBar({ onChanged = null }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(() => apiGet('/arch/armed').then((s) => { setState(s); setError(''); }).catch((e) => setError(String(e?.message || e))), []);
  useEffect(() => { load(); const id = setInterval(load, 5000); return () => clearInterval(id); }, [load]);

  const v = armView(state);
  const flip = async () => {
    if (!v.action) return;
    if (v.action.confirm && !window.confirm(v.action.confirm)) return;
    setBusy(true); setError('');
    try { setState(await apiPost('/arch/armed', { armed: v.action.armed })); onChanged?.(); }
    catch (e) {
      let msg = String(e?.message || e);
      try { msg = JSON.parse(msg).error || msg; } catch { /* plain text */ }
      setError(msg);
    }
    setBusy(false);
  };

  return (
    <section className={`armbar armbar--${v.tone}`} data-arch-armbar={v.tone} aria-live="polite">
      <div className="armbar__row">
        <span className="armbar__dot" aria-hidden="true" />
        <b className="armbar__title" data-armbar-title>{v.title}</b>
        {v.action && (
          <button type="button" className={`armbar__btn armbar__btn--${v.action.armed ? 'on' : 'off'}`} onClick={flip} disabled={busy || v.action.disabled} data-armbar-switch={v.action.armed ? 'on' : 'off'}>
            {busy ? '…' : v.action.label}
          </button>
        )}
      </div>
      {v.lines.map((l) => <div key={l} className="armbar__line" data-armbar-line>{l}</div>)}
      {error && <div className="armbar__err" role="alert" data-armbar-error>{error}</div>}
      <details className="armbar__rules">
        <summary>What turns the arch on and off</summary>
        <table className="armbar__table" data-armbar-rules>
          <thead><tr><th>Turns it ON</th><th>Turns it OFF</th></tr></thead>
          <tbody>{ARM_RULES.map(([on, off], i) => <tr key={i}><td>{on}</td><td>{off}</td></tr>)}</tbody>
        </table>
        <div className="armbar__note">While it is OFF the arch can still chat with you and read the fleet; it only cannot send tasks to repo agents.</div>
      </details>
    </section>
  );
}
