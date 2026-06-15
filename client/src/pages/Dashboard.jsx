import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useDock } from '../context/DockContext';
import { useT } from '../i18n/LanguageContext';
import GitStatusSummary from '../components/git/GitStatusSummary';
import PinnedAgent from '../components/dashboard/PinnedAgent';
import CopyPath from '../components/dashboard/CopyPath';
import ImportantStar from '../components/dashboard/ImportantStar';
import WaitingBadge from '../components/dashboard/WaitingBadge';
import WaitingOnField from '../components/dashboard/WaitingOnField';
import IdeasPanel from '../components/ideas/IdeasPanel';
import Scoreboard from '../components/dashboard/Scoreboard';
import './dashboard.css';

// The dashboard has three layouts (plans/agent-dashboard.md): summary "cards"
// (status + activity + git, cheap), the "wall of phones" — each agent's live
// Chat rendered in place — and "hot", a mix that renders hot agents (recently
// used by me) as phones and cold ones as cards. The choice is per device.
const VIEW_KEY = 'claudeweb_dash_view';
function readView() {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return v === 'phones' || v === 'hot' ? v : 'cards';
  } catch {
    return 'cards';
  }
}

// In "hot" mode, an agent renders as a phone when I've messaged it within the
// last 30 min (recency tiers fresh/recent/mid); older/never-used agents render
// as cheap cards. Same cutoff used for the recency border (recencyTier).
function isHotTier(tier) {
  return tier === 'fresh' || tier === 'recent' || tier === 'mid';
}

// Is this repo's Local-tab app actually serving (plans/dock-local-app.md)? We
// probe the harness's own same-origin reverse proxy (/api/localview/{repoId}/,
// plans/local-app-proxy.md) so the auth cookie rides along and a 502 from a dead
// product reads as offline — the same liveness contract ProductFrame uses.
async function probeLocal(repoId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`/api/localview/${repoId}/`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

// Dock size is a per-device "bigger/smaller" stepper: an index into SIZE_STEPS
// that scales the square cells' width cap (height follows via aspect-ratio).
// Default is the middle step (1.0 = the original 340/460px caps).
const SIZE_KEY = 'claudeweb_dash_size';
const SIZE_STEPS = [0.7, 0.85, 1, 1.2, 1.45];
const SIZE_DEFAULT = 2;
function clampSize(i) {
  return Math.min(SIZE_STEPS.length - 1, Math.max(0, i));
}
function readSize() {
  try {
    const i = parseInt(localStorage.getItem(SIZE_KEY), 10);
    return Number.isNaN(i) ? SIZE_DEFAULT : clampSize(i);
  } catch {
    return SIZE_DEFAULT;
  }
}

// Content zoom (plans/dashboard-zoom.md): scales the text + controls rendered
// INSIDE each dock (the embedded chat), distinct from the window-size stepper
// above. A CSS-`zoom` factor, remembered per device.
const ZOOM_KEY = 'claudeweb_dash_content_zoom';
const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;
function clampZoom(z) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
}
function readZoom() {
  try {
    const z = parseFloat(localStorage.getItem(ZOOM_KEY));
    return Number.isNaN(z) ? 1 : clampZoom(z);
  } catch {
    return 1;
  }
}

// Expandable Ideas dock (plans/ideas-arch-plan.md): the pinned-left dock can be
// widened (≥2×) so the architectural-plan doc has room. Remembered per device.
const IDEAS_WIDE_KEY = 'claudeweb_dash_ideas_wide';
function readIdeasWide() {
  try {
    return localStorage.getItem(IDEAS_WIDE_KEY) === '1';
  } catch {
    return false;
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
  const { tabs: dockTabs, activeTabId, setActiveTab, updateTab, repos } = useDock();
  // Only agents toggled "show on dashboard" in the Agents tab (default on).
  const tabs = useMemo(() => dockTabs.filter((tab) => tab.dashboard !== false), [dockTabs]);
  // repoId -> filesystem path, for the path line on each dock.
  const repoPath = useCallback(
    (repoId) => repos.find((r) => r.id === repoId)?.path || '',
    [repos],
  );
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
  // "Bigger/smaller" dock size, stepped and remembered per device.
  const [sizeIdx, setSizeIdx] = useState(readSize);
  function stepSize(delta) {
    setSizeIdx((prev) => {
      const next = clampSize(prev + delta);
      try {
        localStorage.setItem(SIZE_KEY, String(next));
      } catch {
        /* private mode — fall back to in-memory only */
      }
      return next;
    });
  }
  // Content zoom for what's rendered INSIDE the docks (the embedded chat),
  // remembered per device. Distinct from the window-size stepper above.
  const [contentZoom, setContentZoom] = useState(readZoom);
  function stepZoom(delta) {
    setContentZoom((prev) => {
      const next = clampZoom(prev + delta);
      try {
        localStorage.setItem(ZOOM_KEY, String(next));
      } catch {
        /* private mode — fall back to in-memory only */
      }
      return next;
    });
  }

  // Wide/narrow Ideas dock (room for the architectural plan), remembered.
  const [ideasWide, setIdeasWide] = useState(readIdeasWide);
  function toggleIdeasWide() {
    setIdeasWide((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(IDEAS_WIDE_KEY, next ? '1' : '0');
      } catch {
        /* private mode — fall back to in-memory only */
      }
      return next;
    });
  }
  // { [tabId]: { status, activity } } — fresher than the dock list, view-local.
  const [live, setLive] = useState({});
  // { [repoId]: /git/status payload } — branch + ahead/behind, like the Agents
  // tab. Fetched once when the overlay opens (git state moves slowly).
  const [gitInfo, setGitInfo] = useState({});
  // { [repoId]: true } while a per-dock refresh is in flight (spinner + guard).
  const [gitBusy, setGitBusy] = useState({});
  // { [repoId]: { port, online } } — whether the agent's Local-tab app is being
  // served (plans/dock-local-app.md). Only repos with a localPort are probed.
  const [localInfo, setLocalInfo] = useState({});
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // Lay agents out in a grid that approximates a square (columns = ⌈√n⌉) rather
  // than one long row: 4 → 2×2, 6 → 3×2, 10 → 4×3.
  const columns = Math.max(1, Math.ceil(Math.sqrt(tabs.length)));

  // Recency tiers are derived against "now"; recomputed each render. The 5s poll
  // re-renders via setLive, so the borders age without a separate timer.
  const now = Date.now();

  // Order (plans/important-agents.md): agents flagged "important" are pinned at
  // the FRONT in their stable dock order — the recency "rearrangement" rule does
  // NOT apply to them, so they never shuffle amongst themselves. The unimportant
  // agents follow, still ordered by "hotness" — most recently used first
  // (live[id].at), refreshed by the same poll. So marking an agent important
  // parks it at the head of the pack; the churn stays below it.
  const orderedTabs = useMemo(() => {
    const important = tabs.filter((t) => t.important);
    const rest = tabs
      .filter((t) => !t.important)
      .sort((a, b) => (live[b.id]?.at || 0) - (live[a.id]?.at || 0));
    return [...important, ...rest];
  }, [tabs, live]);

  // Toggle the important mark; optimistic + backend-synced like color/dashboard.
  const toggleImportant = useCallback(
    (id) => {
      const tab = tabsRef.current.find((t) => t.id === id);
      updateTab(id, { important: !tab?.important });
    },
    [updateTab],
  );

  // "Waiting on another agent" mark (plans/agent-waiting.md): a toggle plus an
  // optional free-text "which agent" name, both backend-synced like the rest.
  const toggleWaiting = useCallback(
    (id) => {
      const tab = tabsRef.current.find((t) => t.id === id);
      updateTab(id, { waiting: !tab?.waiting });
    },
    [updateTab],
  );

  const setWaitingOn = useCallback(
    (id, text) => updateTab(id, { waitingOn: text }),
    [updateTab],
  );

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

  // Local-app serving state per agent repo (plans/dock-local-app.md). The port
  // lives on the repo entry (like the Local tab); only repos that assigned one
  // are probed. `localKey` is a stable string of repoId:port pairs so the poll
  // only restarts when the set of ports actually changes, not every render.
  const localPorts = useMemo(() => {
    const out = {};
    for (const repoId of new Set(tabs.map((tab) => tab.repoId))) {
      const port = repos.find((r) => r.id === repoId)?.localPort;
      if (port) out[repoId] = port;
    }
    return out;
  }, [tabs, repos]);
  const localKey = Object.entries(localPorts)
    .map(([id, port]) => `${id}:${port}`)
    .join(',');
  useEffect(() => {
    if (!localKey) {
      setLocalInfo({});
      return undefined;
    }
    let cancelled = false;
    const ports = Object.fromEntries(localKey.split(',').map((p) => p.split(':')));
    async function probeAll() {
      const pairs = await Promise.all(
        Object.entries(ports).map(async ([repoId, port]) => [
          repoId,
          { port: Number(port), online: await probeLocal(repoId) },
        ]),
      );
      if (!cancelled) setLocalInfo(Object.fromEntries(pairs));
    }
    probeAll();
    const timer = setInterval(probeAll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [localKey]);

  // Per-dock refresh: re-fetch one repo's git status, hitting origin (fetch=true)
  // like the Git tab's refresh so the origin-relative rows actually update.
  const refreshGit = useCallback(async (repoId) => {
    if (!repoId) return;
    setGitBusy((prev) => ({ ...prev, [repoId]: true }));
    try {
      const status = await apiGet('/git/status?fetch=true', { repoId });
      if (status.branch && status.branch !== 'unknown') {
        setGitInfo((prev) => ({ ...prev, [repoId]: status }));
      }
    } catch {
      /* transient error / not a git repo — keep the last good status */
    } finally {
      setGitBusy((prev) => ({ ...prev, [repoId]: false }));
    }
  }, []);

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
          <div className="dash__size" role="group" aria-label={t('dashboard.size')}>
            <button
              type="button"
              className="dash__size-btn"
              onClick={() => stepSize(-1)}
              disabled={sizeIdx <= 0}
              aria-label={t('dashboard.sizeSmaller')}
            >
              &minus;
            </button>
            <button
              type="button"
              className="dash__size-btn"
              onClick={() => stepSize(1)}
              disabled={sizeIdx >= SIZE_STEPS.length - 1}
              aria-label={t('dashboard.sizeBigger')}
            >
              +
            </button>
          </div>
        )}
        {tabs.length > 0 && (
          <div className="dash__zoom" role="group" aria-label={t('dashboard.zoom')}>
            <button
              type="button"
              className="dash__zoom-btn"
              onClick={() => stepZoom(-ZOOM_STEP)}
              disabled={contentZoom <= ZOOM_MIN}
              aria-label={t('dashboard.zoomOut')}
              title={t('dashboard.zoomOut')}
            >
              A&minus;
            </button>
            <button
              type="button"
              className="dash__zoom-btn"
              onClick={() => stepZoom(ZOOM_STEP)}
              disabled={contentZoom >= ZOOM_MAX}
              aria-label={t('dashboard.zoomIn')}
              title={t('dashboard.zoomIn')}
            >
              A+
            </button>
          </div>
        )}
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
            <button
              type="button"
              role="tab"
              aria-selected={view === 'hot'}
              className={`dash__view${view === 'hot' ? ' dash__view--on' : ''}`}
              onClick={() => chooseView('hot')}
            >
              {t('dashboard.viewHot')}
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

      <div className="dash__body">
        <aside className={`dash__ideas${ideasWide ? ' dash__ideas--wide' : ''}`}>
          <div className="dash__ideas-head">
            <span className="dash__ideas-title">💡 {t('nav.ideas')}</span>
            <button
              type="button"
              className="dash__ideas-expand"
              onClick={toggleIdeasWide}
              aria-pressed={ideasWide}
              title={ideasWide ? t('dashboard.ideasNarrow') : t('dashboard.ideasWide')}
            >
              {ideasWide ? '⇤' : '⇥'}
            </button>
          </div>
          <IdeasPanel />
        </aside>
        <div className="dash__main">
      <Scoreboard />
      {tabs.length === 0 ? (
        <p className="dash__empty">{t('dashboard.empty')}</p>
      ) : (
        <ul
          className={`dash__grid${view !== 'cards' ? ' dash__grid--phones' : ''}`}
          style={{
            // All layouts cap their columns so cells stay square (height tracks
            // width via aspect-ratio) and centred, instead of stretching into wide
            // rectangles. Phones (and the mixed "hot" view, which can hold phones)
            // get a larger cap since they render live chats.
            gridTemplateColumns:
              view === 'cards'
                ? `repeat(${columns}, minmax(0, ${Math.round(340 * SIZE_STEPS[sizeIdx])}px))`
                : `repeat(${columns}, minmax(0, ${Math.round(460 * SIZE_STEPS[sizeIdx])}px))`,
          }}
        >
          {orderedTabs.map((tab) => {
            const info = live[tab.id];
            const status = info?.status || tab.status;
            const recency = recencyTier(info?.at, now);
            // Phones view: always a phone. Hot view: phone iff hot. Cards: never.
            const asPhone = view === 'phones' || (view === 'hot' && isHotTier(recency));
            if (asPhone) {
              return (
                <li key={tab.id} className="dash__phone-cell">
                  <PinnedAgent
                    tab={tab}
                    status={status}
                    recency={recency}
                    contentZoom={contentZoom}
                    repoPath={repoPath(tab.repoId)}
                    localApp={localInfo[tab.repoId]}
                    git={gitInfo[tab.repoId]}
                    gitRefreshing={!!gitBusy[tab.repoId]}
                    onRefreshGit={() => refreshGit(tab.repoId)}
                    onMaximize={handleOpen}
                    onToggleImportant={toggleImportant}
                    onToggleWaiting={toggleWaiting}
                    onSetWaitingOn={setWaitingOn}
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
                  className={`dash-cell dash-cell--${status}${tab.id === activeTabId ? ' dash-cell--active' : ''}${tab.important ? ' dash-cell--important' : ''}${tab.waiting ? ' dash-cell--waiting' : ''}`}
                  data-colored={tab.color ? 'true' : undefined}
                  data-recency={recency}
                  style={tab.color ? { '--agent-color': tab.color } : undefined}
                  onClick={() => handleOpen(tab.id)}
                >
                  <span className="dash-cell__head">
                    <span className="dash-cell__dot" />
                    <span className="dash-cell__name">{tab.repoName}</span>
                    <ImportantStar
                      important={!!tab.important}
                      onToggle={() => toggleImportant(tab.id)}
                      className="dash-cell__important"
                    />
                    <WaitingBadge
                      waiting={!!tab.waiting}
                      onToggle={() => toggleWaiting(tab.id)}
                      className="dash-cell__waiting"
                    />
                  </span>
                  {repoPath(tab.repoId) && (
                    <CopyPath path={repoPath(tab.repoId)} className="dash-cell__path" />
                  )}
                  <span className="dash-cell__status">
                    {t(`agents.status.${status}`)}
                  </span>
                  {git && <GitStatusSummary status={git} compact />}
                  <span className="dash-cell__activity">
                    {activity || t('dashboard.noActivity')}
                  </span>
                </button>
                {tab.waiting && (
                  <WaitingOnField
                    value={tab.waitingOn}
                    onCommit={(text) => setWaitingOn(tab.id, text)}
                    className="dash-cell__waiting-on"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
        </div>
      </div>
    </div>
  );
}
