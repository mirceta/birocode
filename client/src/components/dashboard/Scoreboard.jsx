import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';
import ScoreboardView, { ScoreboardWindows, fmtDur } from './ScoreboardView';
import './scoreboard.css';

// Scoreboard / analytics (plans/scoreboard-analytics.md): a collapsible panel
// pinned above the agent docks. Window-scoped headline stats (today / 7d / all)
// plus three hand-rolled SVG views (no chart lib): concurrency over time, a
// 7-day activity strip, and a per-agent leaderboard. Reads the global
// GET /api/analytics?window=…, folded from the activity.jsonl run ledger, and
// polls while the dashboard overlay is open. Open/closed state is per device.
// The stats + charts themselves live in ScoreboardView (openspec
// fleet-status-panels) so the Fleet Status Scoreboard tab renders them identically
// from a peer's payload; this component owns the fetch, the poll and the collapse.
const POLL_MS = 5000;
const COLLAPSED_KEY = 'claudeweb_scoreboard_collapsed';

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
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
    // Hidden tab = no polling (openspec reduce-connection-appetite).
    const timer = setInterval(() => { if (!document.hidden) load(window); }, POLL_MS);
    return () => clearInterval(timer);
  }, [load, window]);

  if (!data) return null;

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
        {!collapsed && <ScoreboardWindows window={window} onWindow={setWindow} t={t} />}
      </div>

      {!collapsed && <ScoreboardView data={data} window={window} t={t} />}
    </section>
  );
}

