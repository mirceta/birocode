import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useDock } from '../context/DockContext';
import { useT } from '../i18n/LanguageContext';
import { syncLines } from '../lib/gitSync';
import PinnedAgent from '../components/dashboard/PinnedAgent';
import './dashboard.css';

// The dashboard has two layouts (plans/agent-dashboard.md): summary "cards"
// (status + activity + git, cheap) and the "wall of phones" — each agent's
// live Chat rendered in place. The choice is remembered per device.
const VIEW_KEY = 'claudeweb_dash_view';
function readView() {
  try {
    return localStorage.getItem(VIEW_KEY) === 'phones' ? 'phones' : 'cards';
  } catch {
    return 'cards';
  }
}

// Slice 2 liveness (plans/agent-dashboard.md) — while the overlay is open,
// poll the cheap snapshot endpoints on a timer and keep the result LOCAL to
// this view (no DockContext writes, no per-cell SSE):
//   GET /api/runs  -> per-repo { status, sessionId } (in-memory snapshot)
//   GET /api/sessions/{id}/messages (repo-scoped) -> transcript; last line is
//     the agent's "what's it doing".
const POLL_MS = 5000;
// Enough text to fill the cell's clamped activity area without shipping whole
// messages into the DOM.
const ACTIVITY_MAX = 500;

function oneLine(text) {
  return text.replace(/\s+/g, ' ').trim().slice(0, ACTIVITY_MAX);
}

// Newest assistant line if any, else the newest message (e.g. a just-sent
// prompt while the agent is still running). Iterates from the end to avoid
// copying the whole transcript each poll.
function latestActivity(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i]?.role === 'assistant' && messages[i]?.text) {
      return oneLine(messages[i].text);
    }
  }
  const last = messages[messages.length - 1];
  return last?.text ? oneLine(last.text) : '';
}

// Timestamp (ms) of the last message *I* sent in this transcript — the basis
// for the recency border. Iterates from the end and stops at the first user
// message that carries a timestamp.
function lastUserAt(messages) {
  if (!Array.isArray(messages)) return 0;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role === 'user' && m?.timestamp) {
      const t = Date.parse(m.timestamp);
      if (!Number.isNaN(t)) return t;
    }
  }
  return 0;
}

// Map "how long ago I last wrote" to a border tier (plans/agent-dashboard.md):
//   <1min green · <5min bright green · 5–30min blue · 30–60min purple · >1hr none.
// Returns undefined for >1hr / never, so no data-recency attribute is set.
function recencyTier(at, now) {
  if (!at) return undefined;
  const min = (now - at) / 60000;
  if (min < 0) return undefined;
  if (min < 1) return 'fresh';
  if (min < 5) return 'recent';
  if (min < 30) return 'mid';
  if (min < 60) return 'old';
  return undefined;
}

// Agent dashboard (plans/agent-dashboard.md) — a full-screen grid overview of
// every dock agent, opened from the top bar (not a tab). This is a new VIEW
// over DockContext, not new plumbing: it reads the same agent list the Agents
// tab does, and clicking a cell reuses the existing open-agent flow
// (setActiveTab + /studio), then closes the overlay.
export default function Dashboard({ onClose }) {
  const { t } = useT();
  const { tabs: dockTabs, activeTabId, setActiveTab, repos } = useDock();
  // Only agents toggled "show on dashboard" in the Agents tab (default on).
  const tabs = useMemo(() => dockTabs.filter((tab) => tab.dashboard !== false), [dockTabs]);
  const navigate = useNavigate();
  const [view, setView] = useState(readView);
  function chooseView(next) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* private mode — fall back to in-memory only */
    }
  }
  // { [tabId]: { status, activity } } — fresher than the dock list, view-local.
  const [live, setLive] = useState({});
  // { [repoId]: /git/status payload } — branch + ahead/behind, like the Agents
  // tab. Fetched once when the overlay opens (git state moves slowly).
  const [gitInfo, setGitInfo] = useState({});
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // Lay agents out in a grid that approximates a square (columns = ⌈√n⌉) rather
  // than one long row: 4 → 2×2, 6 → 3×2, 10 → 4×3.
  const columns = Math.max(1, Math.ceil(Math.sqrt(tabs.length)));

  // Recency tiers are derived against "now"; recomputed each render. The 5s poll
  // re-renders via setLive, so the borders age without a separate timer.
  const now = Date.now();

  // Poll while the overlay is mounted (i.e. open); the effect's teardown stops
  // it on close. A `busy` guard skips a tick if the previous one is still in
  // flight, so a slow poll can't pile up.
  useEffect(() => {
    let cancelled = false;
    let busy = false;

    async function poll() {
      if (busy) return;
      busy = true;
      try {
        let runs = {};
        try {
          runs = (await apiGet('/runs')) || {};
        } catch {
          /* keep the last good liveness; try again next tick */
        }
        const current = tabsRef.current;
        const pairs = await Promise.all(
          current.map(async (tab) => {
            const run = runs[tab.repoId];
            const status = run?.status || tab.status;
            const sessionId = run?.sessionId || tab.sessionId;
            let activity = '';
            let at = 0;
            if (sessionId) {
              try {
                const messages = await apiGet(`/sessions/${sessionId}/messages`, {
                  repoId: tab.repoId,
                });
                activity = latestActivity(messages);
                at = lastUserAt(messages);
              } catch {
                /* no transcript yet / repo gone — leave activity blank */
              }
            }
            return [tab.id, { status, activity, at }];
          }),
        );
        if (!cancelled) setLive(Object.fromEntries(pairs));
      } finally {
        busy = false;
      }
    }

    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  // Git status per agent repo, mirroring the Agents tab (plans/agents-git-sync.md):
  // one best-effort GET /api/git/status per unique repoId, keyed by repoId.
  // Non-git repos report "unknown" and simply show no git lines.
  const repoIds = [...new Set(tabs.map((tab) => tab.repoId))].join(',');
  const loadGit = useCallback(() => {
    if (!repoIds) return;
    repoIds.split(',').forEach(async (repoId) => {
      try {
        const status = await apiGet('/git/status', { repoId });
        if (status.branch && status.branch !== 'unknown') {
          setGitInfo((prev) => ({ ...prev, [repoId]: status }));
        }
      } catch {
        /* not a git repo, or transient error — show nothing */
      }
    });
  }, [repoIds]);
  useEffect(() => {
    loadGit();
  }, [loadGit]);

  function handleOpen(id) {
    setActiveTab(id);
    navigate('/studio');
    onClose?.();
  }

  return (
    <div className="dash">
      <div className="dash__header">
        <h2 className="dash__title">{t('dashboard.title')}</h2>
        {tabs.length > 0 && (
          <div className="dash__views" role="tablist" aria-label={t('dashboard.title')}>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'cards'}
              className={`dash__view${view === 'cards' ? ' dash__view--on' : ''}`}
              onClick={() => chooseView('cards')}
            >
              {t('dashboard.viewCards')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === 'phones'}
              className={`dash__view${view === 'phones' ? ' dash__view--on' : ''}`}
              onClick={() => chooseView('phones')}
            >
              {t('dashboard.viewPhones')}
            </button>
          </div>
        )}
        <button
          type="button"
          className="dash__close"
          onClick={onClose}
          aria-label={t('dashboard.close')}
        >
          &times;
        </button>
      </div>

      {tabs.length === 0 ? (
        <p className="dash__empty">{t('dashboard.empty')}</p>
      ) : (
        <ul
          className={`dash__grid${view === 'phones' ? ' dash__grid--phones' : ''}`}
          style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
        >
          {tabs.map((tab) => {
            const info = live[tab.id];
            const status = info?.status || tab.status;
            const recency = recencyTier(info?.at, now);
            if (view === 'phones') {
              return (
                <li key={tab.id} className="dash__phone-cell">
                  <PinnedAgent
                    tab={tab}
                    status={status}
                    recency={recency}
                    onMaximize={handleOpen}
                  />
                </li>
              );
            }
            const activity = info?.activity;
            const git = gitInfo[tab.repoId];
            return (
              <li key={tab.id}>
                <button
                  type="button"
                  className={`dash-cell dash-cell--${status}${tab.id === activeTabId ? ' dash-cell--active' : ''}`}
                  data-colored={tab.color ? 'true' : undefined}
                  data-recency={recency}
                  style={tab.color ? { '--agent-color': tab.color } : undefined}
                  onClick={() => handleOpen(tab.id)}
                >
                  <span className="dash-cell__head">
                    <span className="dash-cell__dot" />
                    <span className="dash-cell__name">{tab.repoName}</span>
                  </span>
                  <span className="dash-cell__status">
                    {t(`agents.status.${status}`)}
                  </span>
                  {git && (
                    <span className="dash-cell__branch">
                      <span aria-hidden="true">⎇</span> {git.branch}
                    </span>
                  )}
                  {git && syncLines(t, git).map((line) => (
                    <span
                      key={line.key}
                      className={`dash-cell__sync${line.warn ? ' dash-cell__sync--warn' : ''}`}
                    >
                      {line.text}
                    </span>
                  ))}
                  <span className="dash-cell__activity">
                    {activity || t('dashboard.noActivity')}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
