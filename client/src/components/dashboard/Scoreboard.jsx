import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';
import './scoreboard.css';

// Scoreboard / analytics (plans/scoreboard-analytics.md): a panel pinned above
// the agent docks showing headline usage numbers + two hand-rolled SVG charts
// (no chart lib). Reads the global GET /api/analytics, folded from the
// activity.jsonl run ledger, and polls while the dashboard overlay is open.
const POLL_MS = 5000;

function fmtDur(ms) {
  if (!ms || ms < 0) return '0s';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function fmtClock(ms) {
  try {
    return new Date(ms).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export default function Scoreboard() {
  const { t } = useT();
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await apiGet('/analytics'));
    } catch {
      /* keep the last good snapshot; try again next tick */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  if (!data) return null;
  const agents = data.agents || [];

  return (
    <section className="scoreboard" aria-label={t('scoreboard.title')}>
      <div className="scoreboard__stats">
        <Stat label={t('scoreboard.promptsToday')} value={data.promptsToday ?? 0} />
        <Stat label={t('scoreboard.peak')} value={data.peakConcurrency ?? 0} />
        <Stat
          label={t('scoreboard.longest')}
          value={data.longestRun ? fmtDur(data.longestRun.ms) : '—'}
          sub={data.longestRun?.agent}
        />
        <Stat label={t('scoreboard.totalWork')} value={fmtDur(data.totalWorkMs)} sub={`${data.totalRuns ?? 0} runs`} />
      </div>

      {agents.length === 0 ? (
        <p className="scoreboard__empty">{t('scoreboard.empty')}</p>
      ) : (
        <div className="scoreboard__charts">
          <UsageTimeline agents={agents} t={t} />
          <WorkIdleBars agents={agents} t={t} />
        </div>
      )}
    </section>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="scoreboard__stat">
      <span className="scoreboard__stat-value">{value}</span>
      <span className="scoreboard__stat-label">{label}</span>
      {sub && <span className="scoreboard__stat-sub" title={sub}>{sub}</span>}
    </div>
  );
}

// Chart 1 — each agent's used window (first→last) on a shared time axis; overlap
// across rows is the visual of concurrency. Slim rounded pills on a light rail,
// with the window duration read out at the end of each row.
function UsageTimeline({ agents, t }) {
  const t0 = Math.min(...agents.map((a) => a.firstStart));
  const t1 = Math.max(...agents.map((a) => a.lastFinish));
  const span = Math.max(1, t1 - t0);
  const rowH = 30;
  const barH = 8;
  const W = 1000;
  const labelW = 150;
  const numW = 70;
  const trackW = W - labelW - numW;
  const x = (ts) => labelW + ((ts - t0) / span) * trackW;
  const H = agents.length * rowH + 24;

  return (
    <div className="scoreboard__chart">
      <h4 className="scoreboard__chart-title">{t('scoreboard.windows')}</h4>
      <svg viewBox={`0 0 ${W} ${H}`} className="scoreboard__svg" role="img" preserveAspectRatio="xMinYMin meet">
        {agents.map((a, i) => {
          const cy = i * rowH + rowH / 2;
          const x0 = x(a.firstStart);
          const w = Math.max(barH, x(a.lastFinish) - x0);
          return (
            <g key={a.agent}>
              <text x="0" y={cy + 4} className="scoreboard__svg-label">{a.agent}</text>
              {/* Light full-width rail for time context (rounded, recedes). */}
              <rect x={labelW} y={cy - 2} width={trackW} height="4" rx="2" className="scoreboard__track" />
              <rect x={x0} y={cy - barH / 2} width={w} height={barH} rx={barH / 2} className="scoreboard__window">
                <title>{`${a.agent}: ${fmtClock(a.firstStart)} → ${fmtClock(a.lastFinish)}`}</title>
              </rect>
              <text x={W} y={cy + 4} textAnchor="end" className="scoreboard__svg-num">
                {fmtDur(a.lastFinish - a.firstStart)}
              </text>
            </g>
          );
        })}
        <line x1={labelW} y1={H - 16} x2={labelW + trackW} y2={H - 16} className="scoreboard__axis-line" />
        <text x={labelW} y={H - 4} className="scoreboard__svg-axis">{fmtClock(t0)}</text>
        <text x={labelW + trackW} y={H - 4} textAnchor="end" className="scoreboard__svg-axis">{fmtClock(t1)}</text>
      </svg>
    </div>
  );
}

// Chart 2 — per agent, a bar of work (filled) over idle (light), exact split;
// bar length is the agent's window duration so agents are comparable.
function WorkIdleBars({ agents, t }) {
  const maxDur = Math.max(1, ...agents.map((a) => a.workMs + a.idleMs));
  const rowH = 30;
  const barH = 14;
  const W = 1000;
  const labelW = 150;
  const numW = 90;
  const barW = W - labelW - numW;

  return (
    <div className="scoreboard__chart">
      <h4 className="scoreboard__chart-title">{t('scoreboard.workIdle')}</h4>
      <svg viewBox={`0 0 ${W} ${agents.length * rowH + 6}`} className="scoreboard__svg" role="img" preserveAspectRatio="xMinYMin meet">
        {agents.map((a, i) => {
          const cy = i * rowH + rowH / 2;
          const fullW = ((a.workMs + a.idleMs) / maxDur) * barW;
          const workW = (a.workMs / maxDur) * barW;
          const r = barH / 2;
          return (
            <g key={a.agent}>
              <text x="0" y={cy + 4} className="scoreboard__svg-label">{a.agent}</text>
              {/* Idle is the full pill (rounded both ends); work overlays from the
                  left so the seam is clean and short bars still read as pills. */}
              <rect x={labelW} y={cy - barH / 2} width={Math.max(barH, fullW)} height={barH} rx={r} className="scoreboard__idle">
                <title>{`${t('scoreboard.idle')}: ${fmtDur(a.idleMs)}`}</title>
              </rect>
              {a.workMs > 0 && (
                <rect x={labelW} y={cy - barH / 2} width={Math.max(barH, workW)} height={barH} rx={r} className="scoreboard__work">
                  <title>{`${t('scoreboard.work')}: ${fmtDur(a.workMs)}`}</title>
                </rect>
              )}
              <text x={W} y={cy + 4} textAnchor="end" className="scoreboard__svg-num">
                {fmtDur(a.workMs)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="scoreboard__legend">
        <span><i className="scoreboard__swatch scoreboard__swatch--work" /> {t('scoreboard.work')}</span>
        <span><i className="scoreboard__swatch scoreboard__swatch--idle" /> {t('scoreboard.idle')}</span>
      </div>
    </div>
  );
}
