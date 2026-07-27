import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '../../api/client';
import { useFeature } from '../../context/UiModeContext';
import './traffic-panel.css';

// Harness HTTP throughput monitor (openspec traffic-monitor). A read-only,
// collapsible dock panel — same drag-layout chrome as AgentAuditPanel —
// showing what the harness is serving right now: req/s + KB/s in the header
// (useful even collapsed), a 60s bytes-out sparkline with the high-threshold
// line, and the top endpoint buckets by volume. "high" comes from the SERVER
// (AppConfig.TrafficHighBytesPerSec) so every consumer shares one definition; this
// panel just renders it (amber chrome + rail-chip dot via onHighChange).
//
// Polls /api/traffic at the dock cadence while mounted and the page is
// visible. Its own polling is counted like all other traffic — the
// "GET api/traffic" bucket showing up in its own table is deliberate honesty,
// not a bug (see the change's design.md).
const POLL_MS = 5000;
const COLLAPSED_KEY = 'claudeweb_dash_traffic_collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function fmtBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return `${Math.round(n)} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtRate(n) {
  return `${fmtBytes(n)}/s`;
}

// 60 one-second bytesOut totals as an SVG bar sparkline; the threshold rides
// as a dashed line when it fits the scale (scale always includes it so the
// operator can see how far away "high" is).
function Sparkline({ history, threshold }) {
  const W = 240;
  const H = 56;
  const bars = history ?? [];
  if (bars.length === 0) return <div className="tp-spark tp-spark--empty">no data yet</div>;
  const peak = Math.max(...bars.map((h) => h.bytesOut), threshold, 1);
  const bw = W / bars.length;
  const ty = H - (threshold / peak) * H;
  return (
    <svg
      className="tp-spark"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Bytes out per second, last 60 seconds"
    >
      {bars.map((h, i) => {
        const bh = Math.max(h.bytesOut > 0 ? 1 : 0, (h.bytesOut / peak) * H);
        return (
          <rect
            key={i}
            x={i * bw + 0.5}
            y={H - bh}
            width={Math.max(0.5, bw - 1)}
            height={bh}
            className="tp-spark__bar"
          />
        );
      })}
      <line x1="0" y1={ty} x2={W} y2={ty} className="tp-spark__threshold" />
    </svg>
  );
}

export default function TrafficPanel({ dragHandle = null, onHighChange = null }) {
  const on = useFeature('trafficPanel');
  const [data, setData] = useState(null); // null = not loaded yet
  const [failed, setFailed] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      const d = await apiGet('/traffic');
      setData(d);
      setFailed(false);
      onHighChange?.(!!d?.high);
    } catch {
      // Keep the last good numbers; surface the failure only if we never loaded.
      setFailed(true);
    }
  }, [onHighChange]);

  // Poll while mounted AND the page is visible; a hidden phone tab must not
  // keep the radio busy (and would only be measuring itself anyway). On
  // return, refresh immediately rather than waiting out the interval.
  useEffect(() => {
    if (!on) return undefined;
    function tick() {
      if (!document.hidden) load();
    }
    function onVisible() {
      if (!document.hidden) load();
    }
    tick();
    timer.current = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
      onHighChange?.(false); // dismissed panel must not leave a stale chip dot
    };
  }, [on, load, onHighChange]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* private mode — in-memory only */
      }
      return next;
    });
  }

  if (!on) return null;

  const high = !!data?.high;
  const now = data?.now;

  return (
    <section className={`tp-panel${high ? ' tp-panel--high' : ''}`}>
      <div className="tp-panel__bar">
        {dragHandle}
        <button
          type="button"
          className="tp-panel__toggle"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand traffic' : 'Collapse traffic'}
        >
          <span className={`tp-panel__chev${collapsed ? ' is-collapsed' : ''}`}>▾</span>
          <span className="tp-panel__title">📡 Traffic</span>
        </button>
        <span className="tp-panel__summary">
          {data === null ? (
            failed ? 'unreachable' : 'loading…'
          ) : (
            <>
              {now.reqPerSec.toFixed(1)} req/s · {fmtRate(now.bytesOutPerSec)} out
              {high && <b className="tp-panel__high-badge"> · HIGH</b>}
            </>
          )}
        </span>
      </div>

      {!collapsed && (
        <div className="tp-panel__body">
          {data === null ? (
            <div className="tp-panel__empty">{failed ? 'Could not load /api/traffic.' : 'Loading…'}</div>
          ) : (
            <>
              <div className="tp-panel__sparkrow">
                <Sparkline history={data.history} threshold={data.thresholdBytesPerSec} />
                <div className="tp-panel__legend">
                  <div>
                    <span className="tp-panel__legend-label">now (10s)</span>{' '}
                    {fmtRate(now.bytesOutPerSec)}
                  </div>
                  <div>
                    <span className="tp-panel__legend-label">avg (60s)</span>{' '}
                    {fmtRate(data.avg60.bytesOutPerSec)}
                  </div>
                  <div>
                    <span className="tp-panel__legend-label">high over</span>{' '}
                    {fmtRate(data.thresholdBytesPerSec)}
                  </div>
                </div>
              </div>

              {data.buckets.length === 0 ? (
                <div className="tp-panel__empty">No requests in the last 60s.</div>
              ) : (
                <table className="tp-table">
                  <thead>
                    <tr>
                      <th>endpoint (60s)</th>
                      <th>req</th>
                      <th>in</th>
                      <th>out</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.buckets.map((b) => (
                      <tr key={b.key}>
                        <td className="tp-table__key">{b.key}</td>
                        <td>{b.requests}</td>
                        <td>{fmtBytes(b.bytesIn)}</td>
                        <td>{fmtBytes(b.bytesOut)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
