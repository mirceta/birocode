import { useEffect, useRef, useState } from 'react';
import { apiGet } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';
import './hostClock.css';

// Dashboard host clock (openspec add-dashboard-host-clock): the HOST box's
// wall-clock time beside the Scoreboard and account chips, so a phone in any
// timezone can see what time it is where the agents actually run.
//
// The chip never formats with the phone's timezone. Each resync of
// GET /api/host-time stores skewMs = server unixMs - Date.now(); a 1 s local
// ticker renders (Date.now() + skewMs) shifted by the HOST's utcOffsetMinutes
// and formatted as UTC — host wall time, smooth seconds, no 1 s polling.
// Resync runs on the row's shared 5 s cadence (picks up DST/offset changes);
// after STALE_AFTER consecutive failures the chip dims with a stale marker
// but keeps ticking from the last good sync.
const POLL_MS = 5000;
const STALE_AFTER = 3;
const COLLAPSE_KEY = 'claudeweb_host_clock_collapsed';

function pad(n) {
  return String(n).padStart(2, '0');
}

// "UTC+2", "UTC-4", "UTC+5:30" — the stable label; the Windows zone id is
// localized/verbose so it lives in the expanded rows and tooltip only.
function formatOffset(minutes) {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${pad(m)}` : ''}`;
}

// Host wall time = instant + host offset, read back through the UTC getters so
// the phone's own timezone can never leak into the digits.
function hostParts(hostNowMs, offsetMinutes) {
  const d = new Date(hostNowMs + offsetMinutes * 60000);
  return {
    time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
  };
}

export default function HostClock() {
  const { t } = useT();
  // Last good sync: { skewMs, offsetMinutes, timeZoneId }; null until first.
  const [sync, setSync] = useState(null);
  const [failCount, setFailCount] = useState(0);
  const [, setTick] = useState(0); // 1 s re-render pulse; time derives from Date.now()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    const load = async () => {
      try {
        const d = await apiGet('/host-time');
        if (!aliveRef.current) return;
        setSync({
          skewMs: d.unixMs - Date.now(),
          offsetMinutes: d.utcOffsetMinutes,
          timeZoneId: d.timeZoneId,
        });
        setFailCount(0);
      } catch {
        // Keep ticking from the last good skew; count toward the stale marker.
        if (aliveRef.current) setFailCount((n) => n + 1);
      }
    };
    load();
    const resync = setInterval(load, POLL_MS);
    const ticker = setInterval(() => setTick((n) => n + 1), 1000);
    return () => {
      aliveRef.current = false;
      clearInterval(resync);
      clearInterval(ticker);
    };
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* private mode — in-memory only */
      }
      return next;
    });
  }

  const stale = failCount >= STALE_AFTER;
  const parts = sync ? hostParts(Date.now() + sync.skewMs, sync.offsetMinutes) : null;
  const offsetLabel = sync ? formatOffset(sync.offsetMinutes) : '';
  const title = sync
    ? `${t('hostclock.title')} — ${sync.timeZoneId}${stale ? ` (${t('hostclock.stale')})` : ''}`
    : t('hostclock.title');

  return (
    <button
      type="button"
      className={`hclk${stale ? ' hclk--stale' : ''}${collapsed ? ' hclk--collapsed' : ''}`}
      onClick={toggle}
      aria-expanded={!collapsed}
      title={title}
    >
      <span className="hclk__hd">
        <span className="hclk__kind">{t('hostclock.kind')}</span>
        <span
          className={`hclk__dot hclk__dot--${sync ? (stale ? 'stale' : 'ok') : 'loading'}`}
          aria-hidden="true"
        />
        {parts ? (
          <span className="hclk__time">
            {parts.time}
            <span className="hclk__offset">{offsetLabel}</span>
          </span>
        ) : (
          <span className="hclk__time hclk__time--pending">{t('hostclock.syncing')}</span>
        )}
        {stale && <span className="hclk__stale">{t('hostclock.stale')}</span>}
        <span className="hclk__chevron" aria-hidden="true">⌄</span>
      </span>
      {!collapsed && sync && (
        <span className="hclk__body">
          <span className="hclk__row">
            <span className="hclk__rk">{t('hostclock.date')}</span>
            <span className="hclk__rv">{parts.date}</span>
          </span>
          <span className="hclk__row">
            <span className="hclk__rk">{t('hostclock.timezone')}</span>
            <span className="hclk__rv">{`${sync.timeZoneId} · ${offsetLabel}`}</span>
          </span>
        </span>
      )}
    </button>
  );
}
