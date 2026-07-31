import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import '../../pages/autopilot.css';

// The "⚑ Flags" sub-tab of the Loops root (docs/loop-driven-agent-convention.md,
// "Non-blocking flags"): the whole ledger, not just the footer's open strip —
// open flags with the same dismiss, the channel on/off switch, and the dismissed
// HISTORY, so a dismissal moves an entry down here instead of silently vanishing
// (auditable until the ledger's overall cap drops the oldest). Reads /api/flags
// directly: the ledger is session-auth, not operator-gated, like the footer.
const POLL_MS = 10000;

export default function FlagsHistoryView() {
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    if (document.hidden) return;
    apiGet('/flags').then(setData).catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const dismiss = (id) => apiPost(`/flags/${id}/dismiss`, {}).then(setData).catch(() => load());
  const setEnabled = (enabled) => apiPost('/flags/enabled', { enabled }).then(setData).catch(() => load());

  const open = data?.flags ?? [];
  const dismissed = data?.dismissed ?? [];
  const enabled = data?.enabled !== false;
  const fmt = (ms) => (ms ? new Date(ms).toLocaleString() : '');

  const row = (f, when) => (
    <li key={f.id} className="fl-row">
      <span className="fl-repo">{f.repoName}</span>
      <span className="fl-text">{f.text}</span>
      <span className="fl-meta">{f.kind} · iter {f.iteration} · {when}</span>
      {!f.dismissed && (
        <button type="button" className="fl-dismiss" title="Dismiss flag" onClick={() => dismiss(f.id)}>×</button>
      )}
    </li>
  );

  return (
    <>
      <h3 className="rp-section">⚑ Agent flags</h3>
      <p className="autopilot__summary autopilot__summary--sub">
        Every <code>FLAG:</code> line a driven agent left in a reply — complaints, workarounds,
        ambiguities it resolved by guessing. Non-blocking by design: a flag never stops or
        re-drives a loop (that is <code>NEEDS_HUMAN:</code>&apos;s job). Open flags also show in the
        footer strip and on the agent&apos;s dock card; dismissing moves an entry into the history
        below, so nothing silently disappears.
      </p>
      <label className="fl-channel">
        <input type="checkbox" checked={enabled} disabled={!data} onChange={(e) => setEnabled(e.target.checked)} />
        <span>
          FLAG channel enabled — driven sends teach the marker and replies are collected.
          {!enabled && ' Currently OFF: sends carry no FLAG line and replies are not mined.'}
        </span>
      </label>

      <h4 className="fl-subhead">Open{open.length ? ` (${open.length})` : ''}</h4>
      <ul className="lp-list fl-list">
        {open.map((f) => row(f, fmt(f.at)))}
        {open.length === 0 && <li className="autopilot__empty">No open flags.</li>}
      </ul>

      <details className="fl-history">
        <summary>Dismissed{dismissed.length ? ` (${dismissed.length})` : ''}</summary>
        <ul className="lp-list fl-list">
          {dismissed.map((f) => row(f, `dismissed ${fmt(f.dismissedAt)}`))}
          {dismissed.length === 0 && <li className="autopilot__empty">Nothing dismissed yet.</li>}
        </ul>
      </details>
    </>
  );
}
