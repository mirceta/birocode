import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet } from '../../api/client';
import { useFeature } from '../../context/UiModeContext';
import { useT } from '../../i18n/LanguageContext';
import './agent-audit-panel.css';

// Agentic-call audit trail on the dashboard (openspec add-agent-audit-trail).
// A read-only, collapsible dock panel — same drag-layout chrome as
// AutopilotPanel — listing every recorded agentic feature call newest-first
// (feature, repo, actor, started, outcome/duration) with feature / repo /
// outcome filters. Deliberately NO edit or delete affordances: the store is
// append-only and the web may only read it.
//
// Polling: 5s while any call is running (same cadence as the dock buttons) so
// an in-flight run's outcome lands promptly; a slow idle tick otherwise so a
// run started from another device still shows up without a manual refresh.
const POLL_FAST_MS = 5000;
const POLL_IDLE_MS = 30000;
const FETCH_LIMIT = 200;
const COLLAPSED_KEY = 'claudeweb_dash_agentaudit_collapsed';

const FEATURES = ['discover-local-apps', 'ask-for-understanding'];
const OUTCOMES = ['running', 'done', 'error', 'canceled', 'interrupted'];
const FEATURE_ICON = {
  'discover-local-apps': '🛰️',
  'ask-for-understanding': '🧠',
};

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function featureLabel(t, feature) {
  if (feature === 'discover-local-apps') return t('audit.feature.discover');
  if (feature === 'ask-for-understanding') return t('audit.feature.understanding');
  return feature; // a future feature id renders as-is rather than hiding
}

function formatStarted(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === now.toDateString()
    ? time
    : `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

function formatDuration(ms) {
  if (ms == null) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

export default function AgentAuditPanel({ dragHandle = null }) {
  const on = useFeature('agenticAudit');
  const { t } = useT();
  const [calls, setCalls] = useState(null); // null = not loaded yet
  const [failed, setFailed] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [fFeature, setFFeature] = useState('');
  const [fRepo, setFRepo] = useState('');
  const [fOutcome, setFOutcome] = useState('');
  const timer = useRef(null);

  // One unfiltered fetch feeds both the table and the filter dropdowns; the
  // filters are applied client-side so changing one never refetches.
  const load = useCallback(async () => {
    try {
      const data = await apiGet(`/agentic-audit?limit=${FETCH_LIMIT}`);
      setCalls(data?.calls ?? []);
      setFailed(false);
      return data?.calls ?? [];
    } catch {
      // Keep the last good list; surface the failure only if we never loaded.
      setFailed(true);
      return null;
    }
  }, []);

  // setTimeout chain (not a fixed interval) so the cadence can switch between
  // fast (something running) and idle after every fetch.
  useEffect(() => {
    if (!on) return undefined;
    let alive = true;
    async function tick() {
      const list = await load();
      if (!alive) return;
      const anyRunning = (list ?? []).some((c) => c.outcome === 'running');
      timer.current = setTimeout(tick, anyRunning ? POLL_FAST_MS : POLL_IDLE_MS);
    }
    tick();
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, [on, load]);

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

  const repoOptions = useMemo(() => {
    const names = new Set((calls ?? []).map((c) => c.repoName).filter(Boolean));
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [calls]);

  const visible = useMemo(
    () =>
      (calls ?? []).filter(
        (c) =>
          (!fFeature || c.feature === fFeature) &&
          (!fRepo || c.repoName === fRepo) &&
          (!fOutcome || c.outcome === fOutcome),
      ),
    [calls, fFeature, fRepo, fOutcome],
  );

  if (!on) return null;

  const runningCount = (calls ?? []).filter((c) => c.outcome === 'running').length;

  return (
    <section className="aa-panel">
      <div className="aa-panel__bar">
        {dragHandle}
        <button
          type="button"
          className="aa-panel__toggle"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          title={collapsed ? t('audit.expand') : t('audit.collapse')}
        >
          <span className={`aa-panel__chev${collapsed ? ' is-collapsed' : ''}`}>▾</span>
          <span className="aa-panel__title">🧾 {t('audit.title')}</span>
        </button>
        <span className="aa-panel__summary">
          {calls === null ? (
            t('audit.loading')
          ) : (
            <>
              {t('audit.callCount', { n: calls.length })}
              {runningCount > 0 && (
                <>
                  {' · '}
                  <b className="aa-panel__running">{t('audit.runningCount', { n: runningCount })}</b>
                </>
              )}
            </>
          )}
        </span>
      </div>

      {!collapsed && (
        <div className="aa-panel__body">
          <div className="aa-panel__filters">
            <select
              value={fFeature}
              onChange={(e) => setFFeature(e.target.value)}
              aria-label={t('audit.colFeature')}
            >
              <option value="">{t('audit.allFeatures')}</option>
              {FEATURES.map((f) => (
                <option key={f} value={f}>
                  {featureLabel(t, f)}
                </option>
              ))}
            </select>
            <select value={fRepo} onChange={(e) => setFRepo(e.target.value)} aria-label={t('audit.colRepo')}>
              <option value="">{t('audit.allRepos')}</option>
              {repoOptions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <select
              value={fOutcome}
              onChange={(e) => setFOutcome(e.target.value)}
              aria-label={t('audit.colOutcome')}
            >
              <option value="">{t('audit.allOutcomes')}</option>
              {OUTCOMES.map((o) => (
                <option key={o} value={o}>
                  {t(`audit.outcome.${o}`)}
                </option>
              ))}
            </select>
          </div>

          {failed && calls === null ? (
            <div className="aa-panel__empty">{t('audit.loadError')}</div>
          ) : calls === null ? (
            <div className="aa-panel__empty">{t('audit.loading')}</div>
          ) : visible.length === 0 ? (
            <div className="aa-panel__empty">{t('audit.empty')}</div>
          ) : (
            <table className="aa-table">
              <thead>
                <tr>
                  <th>{t('audit.colFeature')}</th>
                  <th>{t('audit.colRepo')}</th>
                  <th>{t('audit.colActor')}</th>
                  <th>{t('audit.colStarted')}</th>
                  <th>{t('audit.colOutcome')}</th>
                  <th>{t('audit.colDuration')}</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => (
                  <tr key={c.callId}>
                    <td>
                      <span aria-hidden="true">{FEATURE_ICON[c.feature] ?? '🤖'}</span>{' '}
                      {featureLabel(t, c.feature)}
                    </td>
                    <td>{c.repoName || c.repoId}</td>
                    <td title={c.ip}>{c.actor}</td>
                    <td>{formatStarted(c.startedAt)}</td>
                    <td>
                      {/* An error's trimmed summary rides the chip tooltip. */}
                      <span className={`aa-chip aa-chip--${c.outcome}`} title={c.error || undefined}>
                        {t(`audit.outcome.${c.outcome}`)}
                      </span>
                    </td>
                    <td>{formatDuration(c.durationMs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
