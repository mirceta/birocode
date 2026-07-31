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
        This is the complaint inbox for agents run by autopilot loops. An agent working
        under a loop has nobody to ask, so when it hits a doubt it makes a judgment call
        and keeps going — this page is where it reports those judgment calls, so you can
        check them later instead of never hearing about them.
      </p>
      <ol className="fl-how">
        <li>
          When a loop drives an agent, the prompt includes one standing rule: <em>&quot;if you
          had to guess, work around a problem, or something felt wrong — add a line starting
          with <code>FLAG:</code> to your reply.&quot;</em>
        </li>
        <li>
          The harness scans every reply and lifts those lines into the list below. The loop
          is never interrupted — a flag is a note, not an alarm. (An agent that genuinely
          cannot continue writes <code>NEEDS_HUMAN:</code> instead; that one pauses the loop.)
        </li>
        <li>
          You read them whenever you like. Open flags also appear in the footer strip and as
          a ⚑ badge on that agent&apos;s dock card. Dismissing one (×) moves it into the
          Dismissed history at the bottom — nothing is deleted.
        </li>
      </ol>
      <label className="fl-channel">
        <input type="checkbox" checked={enabled} disabled={!data} onChange={(e) => setEnabled(e.target.checked)} />
        <span>
          FLAG channel on — loop prompts include the <code>FLAG:</code> rule and replies are
          scanned for flags.
          {!enabled && ' Currently OFF: prompts stop mentioning flags and replies are not scanned; flags already open stay listed until you dismiss them.'}
        </span>
      </label>

      <h4 className="fl-subhead">Open{open.length ? ` (${open.length})` : ''}</h4>
      <ul className="lp-list fl-list">
        {open.map((f) => row(f, fmt(f.at)))}
        {open.length === 0 && (
          <li className="autopilot__empty">
            No open flags — no loop-driven agent has raised a concern yet. One appears here
            the moment a driven reply contains a <code>FLAG:</code> line.
          </li>
        )}
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
