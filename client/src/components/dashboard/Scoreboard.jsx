import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';
import './scoreboard.css';

// Scoreboard / analytics (plans/scoreboard-analytics.md): a collapsible panel
// pinned above the agent docks. Window-scoped headline stats (today / 7d / all)
// plus three hand-rolled SVG views (no chart lib): concurrency over time, a
// 7-day activity strip, and a per-agent leaderboard. Reads the global
// GET /api/analytics?window=…, folded from the activity.jsonl run ledger, and
// polls while the dashboard overlay is open. Open/closed state is per device.
const POLL_MS = 5000;
const COLLAPSED_KEY = 'claudeweb_scoreboard_collapsed';
const WINDOWS = ['today', '7d', 'all'];

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

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

function fmtCost(usd) {
  if (!usd) return '$0';
  return usd < 1 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(usd < 10 ? 1 : 0)}`;
}

export default function Scoreboard() {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [window, setWindow] = useState('7d');
  const [collapsed, setCollapsed] = useState(readCollapsed);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* private mode — in-memory only */
      }
      return next;
    });
  }

  const load = useCallback(async (win) => {
    try {
      setData(await apiGet(`/analytics?window=${win}`));
    } catch {
      /* keep the last good snapshot; try again next tick */
    }
  }, []);

  useEffect(() => {
    load(window);
    const timer = setInterval(() => load(window), POLL_MS);
    return () => clearInterval(timer);
  }, [load, window]);

  if (!data) return null;
  const agents = data.agents || [];
  const empty = (data.totalRuns ?? 0) === 0 && (data.prompts ?? 0) === 0;

  return (
    <section className="scoreboard" aria-label={t('scoreboard.title')}>
      <div className="scoreboard__bar">
        <button
          type="button"
          className="scoreboard__head"
          onClick={toggle}
          aria-expanded={!collapsed}
        >
          <span className={`scoreboard__chevron${collapsed ? ' scoreboard__chevron--collapsed' : ''}`} aria-hidden="true">⌄</span>
          <span className="scoreboard__head-title">{t('scoreboard.title')}</span>
          {collapsed && (
            <span className="scoreboard__head-summary">
              {t('scoreboard.prompts')}: {data.prompts ?? 0} · {t('scoreboard.totalWork')}: {fmtDur(data.totalWorkMs)}
            </span>
          )}
        </button>
        {!collapsed && (
          <div className="scoreboard__windows" role="tablist" aria-label={t('scoreboard.window')}>
            {WINDOWS.map((w) => (
              <button
                key={w}
                type="button"
                role="tab"
                aria-selected={window === w}
                className={`scoreboard__win${window === w ? ' scoreboard__win--on' : ''}`}
                onClick={() => setWindow(w)}
              >
                {t(`scoreboard.win.${w}`)}
              </button>
            ))}
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          <div className="scoreboard__stats">
            <Stat label={t('scoreboard.prompts')} value={data.prompts ?? 0} />
            <Stat label={t('scoreboard.peak')} value={data.peakConcurrency ?? 0} />
            <Stat
              label={t('scoreboard.longest')}
              value={data.longestRun ? fmtDur(data.longestRun.ms) : '—'}
              sub={data.longestRun?.agent}
            />
            <Stat label={t('scoreboard.totalWork')} value={fmtDur(data.totalWorkMs)} sub={`${data.totalRuns ?? 0} runs`} />
            {data.totalCostUsd > 0 && <Stat label={t('scoreboard.cost')} value={fmtCost(data.totalCostUsd)} />}
          </div>

          {empty ? (
            <p className="scoreboard__empty">{t('scoreboard.empty')}</p>
          ) : (
            <div className="scoreboard__charts">
              <ConcurrencyChart series={data.concurrency || []} peak={data.peakConcurrency ?? 0} t={t} />
              <ActivityStrip daily={data.daily || []} t={t} />
              {agents.length > 0 && <Leaderboard agents={agents} t={t} />}
            </div>
          )}
        </>
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

// Hero chart — a step-area of how many agents ran simultaneously across the
// window. Directly the "max agents at the same time" question, with its shape.
function ConcurrencyChart({ series, peak, t }) {
  const W = 1000;
  const H = 150;
  const padL = 28;
  const padR = 12;
  const padT = 10;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  if (series.length < 2) {
    return (
      <div className="scoreboard__chart">
        <h4 className="scoreboard__chart-title">{t('scoreboard.concurrency')}</h4>
        <p className="scoreboard__empty">{t('scoreboard.empty')}</p>
      </div>
    );
  }

  const t0 = series[0].ts;
  const t1 = series[series.length - 1].ts;
  const span = Math.max(1, t1 - t0);
  const maxY = Math.max(1, peak);
  const x = (ts) => padL + ((ts - t0) / span) * plotW;
  const y = (lvl) => padT + plotH - (lvl / maxY) * plotH;

  // Step-after path: each point's level holds until the next point.
  let d = `M ${x(t0)} ${padT + plotH}`;
  let prevY = y(series[0].level);
  d += ` L ${x(t0)} ${prevY}`;
  for (let i = 1; i < series.length; i++) {
    const px = x(series[i].ts);
    d += ` L ${px} ${prevY}`; // hold previous level to this x
    prevY = y(series[i].level);
    d += ` L ${px} ${prevY}`; // step to new level
  }
  d += ` L ${x(t1)} ${padT + plotH} Z`;

  // Integer y gridlines (0..maxY), capped so the axis stays legible.
  const ticks = [];
  const stepY = Math.max(1, Math.ceil(maxY / 4));
  for (let v = 0; v <= maxY; v += stepY) ticks.push(v);

  return (
    <div className="scoreboard__chart">
      <h4 className="scoreboard__chart-title">{t('scoreboard.concurrency')}</h4>
      <svg viewBox={`0 0 ${W} ${H}`} className="scoreboard__svg" role="img" preserveAspectRatio="none">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} className="scoreboard__grid" />
            <text x={padL - 6} y={y(v) + 4} textAnchor="end" className="scoreboard__svg-axis">{v}</text>
          </g>
        ))}
        <path d={d} className="scoreboard__area" />
        <text x={padL} y={H - 6} className="scoreboard__svg-axis">{fmtClock(t0)}</text>
        <text x={W - padR} y={H - 6} textAnchor="end" className="scoreboard__svg-axis">{fmtClock(t1)}</text>
      </svg>
    </div>
  );
}

// 7-day activity — prompts sent per calendar day (work time in the tooltip).
function ActivityStrip({ daily, t }) {
  const maxP = Math.max(1, ...daily.map((d) => d.prompts));
  return (
    <div className="scoreboard__chart">
      <h4 className="scoreboard__chart-title">{t('scoreboard.activity')}</h4>
      <div className="scoreboard__days">
        {daily.map((d) => {
          const day = new Date(d.date);
          const wd = day.toLocaleDateString([], { weekday: 'short' });
          const dn = day.getDate();
          return (
            <div key={d.date} className="scoreboard__day" title={`${d.prompts} ${t('scoreboard.prompts').toLowerCase()} · ${fmtDur(d.workMs)}`}>
              <span className="scoreboard__day-count">{d.prompts || ''}</span>
              <div className="scoreboard__day-track">
                <div className="scoreboard__day-bar" style={{ height: `${(d.prompts / maxP) * 100}%` }} />
              </div>
              <span className="scoreboard__day-label">{wd}<br />{dn}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Per-agent leaderboard — runs · total work · longest · last used, ranked by
// work time (replaces v1's misleading work/idle bars).
function Leaderboard({ agents, t }) {
  return (
    <div className="scoreboard__chart">
      <h4 className="scoreboard__chart-title">{t('scoreboard.agents')}</h4>
      <table className="scoreboard__table">
        <thead>
          <tr>
            <th>{t('scoreboard.colAgent')}</th>
            <th className="scoreboard__num">{t('scoreboard.colRuns')}</th>
            <th className="scoreboard__num">{t('scoreboard.colWork')}</th>
            <th className="scoreboard__num">{t('scoreboard.colLongest')}</th>
            <th className="scoreboard__num">{t('scoreboard.colLast')}</th>
          </tr>
        </thead>
        <tbody>
          {agents.map((a) => (
            <tr key={a.agent}>
              <td className="scoreboard__agent" title={a.agent}>{a.agent}</td>
              <td className="scoreboard__num">{a.runs}</td>
              <td className="scoreboard__num">{fmtDur(a.workMs)}</td>
              <td className="scoreboard__num">{fmtDur(a.longestMs)}</td>
              <td className="scoreboard__num">{fmtClock(a.lastUsed)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
