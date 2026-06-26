import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';

// Event Console lane (openspec agent-dock-event-console): a per-repo, read-only
// log of harness-owned background operations — that an operation was invoked and
// is awaiting a response, then that it returned and what the harness did with the
// result (discovery / run / check today). It deliberately does NOT show what the
// agent gateway does internally; that stays a black box.
//
// Transport mirrors the dock's other reattach surfaces: we hold a sequence
// watermark and poll GET /api/repos/{repoId}/events?after=N at the dock cadence,
// asking only for events newer than what we've seen and advancing the watermark
// by the returned lastSeq. The log is per-REPO, so two docks on the same repo
// show the same events. In-memory server-side, so a restart just empties it.
const POLL_MS = 5000;

function fmtTime(ms) {
  try {
    const d = new Date(ms);
    return d.toLocaleTimeString([], { hour12: false });
  } catch {
    return '';
  }
}

function PhaseIcon({ phase }) {
  if (phase === 'started') return <span className="evc__spin" aria-label="started" />;
  if (phase === 'error') return <span className="evc__ph evc__ph--err">✗</span>;
  return <span className="evc__ph evc__ph--ok">✓</span>;
}

export default function EventConsole({ repoId }) {
  const { t } = useT();
  const [events, setEvents] = useState([]);
  const [error, setError] = useState(false);
  const afterRef = useRef(-1); // watermark: highest seq we've rendered
  const timerRef = useRef(null);
  const bodyRef = useRef(null);

  const poll = useCallback(async () => {
    try {
      const r = await apiGet(`/repos/${repoId}/events?after=${afterRef.current}`);
      setError(false);
      const fresh = r?.events || [];
      if (fresh.length) {
        afterRef.current = r.lastSeq;
        setEvents((prev) => prev.concat(fresh));
      }
    } catch {
      setError(true); // keep what we have; transient errors shouldn't clear the log
    }
  }, [repoId]);

  // Reset + start polling on mount / repo-change; clear the interval on unmount.
  useEffect(() => {
    afterRef.current = -1;
    setEvents([]);
    setError(false);
    poll();
    timerRef.current = setInterval(poll, POLL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [repoId, poll]);

  // Keep the newest event in view (terminal-log feel).
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [events]);

  return (
    <div className="evc">
      <div className="evc__head">
        <span className="evc__title">{t('console.title')}</span>
        <span className="evc__hint">{t('console.hint')}</span>
      </div>
      <div className="evc__body" ref={bodyRef} role="log" aria-live="polite">
        {events.length === 0 ? (
          <div className="evc__empty">
            {error ? t('console.error') : t('console.empty')}
          </div>
        ) : (
          events.map((e) => (
            <div key={e.seq} className={`evc__ev evc__ev--${e.phase}`}>
              <span className="evc__ts">{fmtTime(e.at)}</span>
              <span className="evc__icon"><PhaseIcon phase={e.phase} /></span>
              <span className="evc__main">
                <span className="evc__ttl">
                  <span className={`evc__op evc__op--${e.op}`}>{e.op}</span>
                  {e.title}
                </span>
                <span className="evc__dt">{e.detail}</span>
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
