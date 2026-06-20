import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../api/client';
import { useDock } from '../context/DockContext';
import { useFeature } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';
import GitStatusSummary from '../components/git/GitStatusSummary';
import PinnedAgent from '../components/dashboard/PinnedAgent';
import CopyPath from '../components/dashboard/CopyPath';
import ImportantStar from '../components/dashboard/ImportantStar';
import WideToggle from '../components/dashboard/WideToggle';
import DependsOnPicker from '../components/dashboard/DependsOnPicker';
import WaitingBadge from '../components/dashboard/WaitingBadge';
import WaitingOnField from '../components/dashboard/WaitingOnField';
import IdeasPanel from '../components/ideas/IdeasPanel';
import Scoreboard from '../components/dashboard/Scoreboard';
import AutopilotPanel from '../components/dashboard/AutopilotPanel';
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

// Collapsible Ideas dock: fold the whole panel down to just its header bar so it
// gets out of the way. Remembered per device, like the wide/narrow toggle.
const IDEAS_COLLAPSED_KEY = 'claudeweb_dash_ideas_collapsed';
function readIdeasCollapsed() {
  try {
    return localStorage.getItem(IDEAS_COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

// Drag-to-resize the Ideas dock from a bottom-right grip (same UX as the task
// graph / autopilot docks). A saved size overrides the two-step wide/narrow
// toggle; remembered per device, double-click the grip to clear back to it.
const IDEAS_SIZE_KEY = 'claudeweb_dash_ideas_size';
const IDEAS_MIN_W = 260;
const IDEAS_MIN_H = 220;
function readIdeasSize() {
  try {
    const raw = localStorage.getItem(IDEAS_SIZE_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object' && (v.w || v.h)) return v;
  } catch {
    /* private mode / malformed */
  }
  return null;
}

// Free 2D drag layout (plans/dashboard-drag-layout.md): each panel is positioned
// absolutely at a saved {x,y} inside the dashboard canvas. Remembered per device.
// DEFAULT_POS = null means "use the natural flow position" (Ideas left, agents
// right) until the operator drags something.
const DASH_POS_KEY = 'claudeweb_dash_pos';
function readPositions() {
  try {
    const raw = localStorage.getItem(DASH_POS_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object') return v; // { ideas?: {x,y}, agents?: {x,y} }
  } catch {
    /* private mode / malformed */
  }
  return {};
}
function writePositions(v) {
  try {
    localStorage.setItem(DASH_POS_KEY, JSON.stringify(v));
  } catch {
    /* private mode — in-memory only */
  }
}

// Layout mode (plans/dashboard-drag-layout.md): 'free' = drag panels anywhere
// (desktop); 'grid' = panels snap into the responsive flow, ordered with a tap
// (the default on touch/narrow screens, where free drag is unreliable).
const LAYOUT_MODE_KEY = 'claudeweb_dash_layout_mode';
const GRID_SWAP_KEY = 'claudeweb_dash_grid_swapped';
function prefersGrid() {
  try {
    return !!(window.matchMedia && window.matchMedia('(max-width: 700px)').matches);
  } catch {
    return false;
  }
}
function readMode() {
  try {
    const v = localStorage.getItem(LAYOUT_MODE_KEY);
    if (v === 'free' || v === 'grid') return v; // explicit choice wins
  } catch {
    /* private mode */
  }
  return prefersGrid() ? 'grid' : 'free'; // device default
}
function readGridSwapped() {
  try {
    return localStorage.getItem(GRID_SWAP_KEY) === '1';
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

  // Collapse the Ideas dock to its header bar, remembered per device.
  const [ideasCollapsed, setIdeasCollapsed] = useState(readIdeasCollapsed);
  function toggleIdeasCollapsed() {
    setIdeasCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(IDEAS_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        /* private mode — fall back to in-memory only */
      }
      return next;
    });
  }

  // Wide/narrow Ideas dock (room for the architectural plan), remembered.
  const [ideasWide, setIdeasWide] = useState(readIdeasWide);
  function toggleIdeasWide() {
    clearIdeasSize(); // the preset toggle wins over any custom drag size
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

  // Free drag-resize of the Ideas dock from its bottom-right grip.
  const ideasRef = useRef(null);
  const [ideasSize, setIdeasSize] = useState(readIdeasSize);
  const ideasResizeRef = useRef(null);
  function startIdeasResize(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = ideasRef.current?.getBoundingClientRect();
    ideasResizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseW: rect?.width ?? IDEAS_MIN_W,
      baseH: rect?.height ?? IDEAS_MIN_H,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function moveIdeasResize(e) {
    const r = ideasResizeRef.current;
    if (!r) return;
    const maxW = Math.round(window.innerWidth * 0.95);
    const maxH = Math.round(window.innerHeight * 0.9);
    const w = Math.max(IDEAS_MIN_W, Math.min(maxW, Math.round(r.baseW + (e.clientX - r.startX))));
    const h = Math.max(IDEAS_MIN_H, Math.min(maxH, Math.round(r.baseH + (e.clientY - r.startY))));
    setIdeasSize({ w, h });
  }
  function endIdeasResize() {
    if (!ideasResizeRef.current) return;
    ideasResizeRef.current = null;
    setIdeasSize((s) => {
      if (s) {
        try {
          localStorage.setItem(IDEAS_SIZE_KEY, JSON.stringify(s));
        } catch {
          /* private mode — in-memory only */
        }
      }
      return s;
    });
  }
  function clearIdeasSize() {
    setIdeasSize(null);
    try {
      localStorage.removeItem(IDEAS_SIZE_KEY);
    } catch {
      /* private mode */
    }
  }

  // Autopilot mission-control joins the dashboard as a third drag-layout citizen
  // (plans/autopilot-to-harness.md) only when its feature is on; otherwise it's
  // absent and the layout is just Ideas + agents, exactly as before.
  const autopilotOn = useFeature('autopilotTab');
  // The panels the free 2D drag layout manages, in DOM order. Autopilot leads so
  // it sits on top in grid-mode flow. (The task graph used to be a citizen here;
  // it now lives as a tab inside Ideas — plans/ideas-taskgraph-merge.md. Files is
  // NOT a citizen here: it lives as a tab INSIDE each agent dock — see
  // PinnedAgent and plans/agent-dock-files-tab.md.)
  const dragKeys = [
    ...(autopilotOn ? ['autopilot'] : []),
    'ideas',
    'agents',
  ];

  // Free 2D drag layout (plans/dashboard-drag-layout.md): saved {x,y} per panel.
  const [positions, setPositions] = useState(readPositions);
  const bodyRef = useRef(null);
  // Active pointer-drag bookkeeping (ref so move/up don't need re-renders);
  // dragKey state just drives the "lifted" styling.
  const dragRef = useRef(null);
  const [dragKey, setDragKey] = useState(null);
  // Once any panel has been placed, ALL render absolutely (a free canvas).
  const freePlaced = dragKeys.some((k) => positions[k]);

  const posStyle = (key) =>
    positions[key] ? { position: 'absolute', left: positions[key].x, top: positions[key].y } : undefined;

  // Keep a panel inside the canvas, leaving a grabbable strip on every edge.
  function clampPos(key, x, y) {
    const body = bodyRef.current;
    const el = body?.querySelector(`[data-panel="${key}"]`);
    if (!body || !el) return { x: Math.max(0, x), y: Math.max(0, y) };
    const margin = 48;
    const maxX = Math.max(0, body.clientWidth - margin);
    const maxY = Math.max(0, body.clientHeight - margin);
    const minX = -(el.offsetWidth - margin);
    return { x: Math.min(maxX, Math.max(minX, x)), y: Math.min(maxY, Math.max(0, y)) };
  }

  // First drag seeds ALL panels from their current flow offsets, so switching
  // flow→absolute doesn't make anything jump.
  function seededPositions() {
    const body = bodyRef.current;
    if (!body || dragKeys.every((k) => positions[k])) return positions;
    const seed = { ...positions };
    for (const key of dragKeys) {
      if (!seed[key]) {
        const el = body.querySelector(`[data-panel="${key}"]`);
        seed[key] = el ? { x: el.offsetLeft, y: el.offsetTop } : { x: 0, y: 0 };
      }
    }
    return seed;
  }

  function startPanelDrag(key, e) {
    e.preventDefault();
    const seeded = seededPositions();
    const base = seeded[key];
    dragRef.current = { key, startX: e.clientX, startY: e.clientY, baseX: base.x, baseY: base.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setPositions(seeded);
    setDragKey(key);
  }

  function movePanelDrag(e) {
    const d = dragRef.current;
    if (!d) return;
    const next = clampPos(d.key, d.baseX + (e.clientX - d.startX), d.baseY + (e.clientY - d.startY));
    setPositions((prev) => ({ ...prev, [d.key]: next }));
  }

  function endPanelDrag() {
    if (!dragRef.current) return;
    dragRef.current = null;
    setDragKey(null);
    setPositions((prev) => {
      writePositions(prev);
      return prev;
    });
  }

  function resetLayout() {
    setPositions({});
    writePositions({});
  }

  // Layout mode: 'free' drag vs 'grid' snap (plans/dashboard-drag-layout.md).
  const [layoutMode, setLayoutMode] = useState(readMode);
  const free = layoutMode === 'free';
  function toggleMode() {
    setLayoutMode((prev) => {
      const next = prev === 'free' ? 'grid' : 'free';
      try {
        localStorage.setItem(LAYOUT_MODE_KEY, next);
      } catch {
        /* private mode */
      }
      return next;
    });
  }
  // Grid mode order: which panel comes first in the responsive flow. Tap-flip
  // (the ⇄ button) — no dragging needed, so it works on touch.
  const [gridSwapped, setGridSwapped] = useState(readGridSwapped);
  function toggleGridSwap() {
    setGridSwapped((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(GRID_SWAP_KEY, next ? '1' : '0');
      } catch {
        /* private mode */
      }
      return next;
    });
  }
  // A GROWN Ideas dock (drag-sized or the wide preset) can't sit beside the agents
  // in the narrow (720px) dashboard frame — widening its flex track just shoves
  // them onto the line below, and z-index can't help two boxes that never overlap.
  // So in grid mode we lift the grown dock OUT of the flex flow and float it as an
  // absolute overlay (z-index:15) over the agent grid: the agents reclaim the row
  // and the dock paints on top of them. Swapped/free layouts keep their own logic.
  const ideasFloating = !free && !gridSwapped && !ideasCollapsed && (!!ideasSize || ideasWide);
  // The float is anchored to where the agents row starts (just below the
  // full-width Autopilot strip, if present), measured from the live DOM so it
  // tracks Autopilot's height without hardcoding it.
  const [floatTop, setFloatTop] = useState(0);
  useLayoutEffect(() => {
    if (!ideasFloating) return;
    const agentsEl = bodyRef.current?.querySelector('[data-panel="agents"]');
    if (agentsEl) setFloatTop(agentsEl.offsetTop);
  }, [ideasFloating, autopilotOn, ideasSize, ideasWide, gridSwapped, tabs.length]);

  // { [tabId]: { status, activity } } — fresher than the dock list, view-local.
  const [live, setLive] = useState({});
  // { [repoId]: /git/status payload } — branch + ahead/behind, like the Agents
  // tab. Fetched once when the overlay opens (git state moves slowly).
  const [gitInfo, setGitInfo] = useState({});
  // { [repoId]: true } while a per-dock refresh is in flight (spinner + guard).
  const [gitBusy, setGitBusy] = useState({});
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

  // "Depends on" a primary agent (plans/dependent-agents.md): backend-synced
  // like the rest. Empty string clears it.
  const setDependsOn = useCallback(
    (id, primaryId) => updateTab(id, { dependsOn: primaryId }),
    [updateTab],
  );

  // "Wide" — enlarge a dock to two horizontal grid spaces
  // (plans/dock-double-width.md): a toggle, optimistic + backend-synced like
  // important. The span itself is CSS (dash__cell--wide → grid-column: span 2).
  const toggleWide = useCallback(
    (id) => {
      const tab = tabsRef.current.find((t) => t.id === id);
      updateTab(id, { wide: !tab?.wide });
    },
    [updateTab],
  );

  // Fold dependents under their primary for the "together" grouping. A dock is
  // a dependent only when its `dependsOn` points to a visible dock that is
  // itself independent (so we never recurse into chains in this slice); a
  // dangling/self/cyclic link is treated as independent. Built over orderedTabs
  // so dependents keep the dashboard's order under their primary.
  const { primaryOf, dependentsByPrimary } = useMemo(() => {
    const byId = new Map(tabs.map((t) => [t.id, t]));
    const primary = (t) => {
      const p = t.dependsOn;
      if (!p || p === t.id || !byId.has(p)) return null;
      const prim = byId.get(p);
      if (prim.dependsOn && byId.has(prim.dependsOn)) return null; // primary is itself dependent → no recurse
      return p;
    };
    const deps = new Map();
    for (const t of orderedTabs) {
      const p = primary(t);
      if (p) {
        if (!deps.has(p)) deps.set(p, []);
        deps.get(p).push(t);
      }
    }
    return { primaryOf: primary, dependentsByPrimary: deps };
  }, [tabs, orderedTabs]);

  // Candidate primaries for a dock's "depends on" picker: every other agent.
  const candidatesFor = useCallback((tab) => tabs.filter((x) => x.id !== tab.id), [tabs]);

  // Render one dock (phone or card) in a `tag` wrapper. `small` marks a
  // dependent so it renders shrunk inside its "together" group
  // (plans/dependent-agents.md).
  const renderDock = (tab, { tag: Wrapper = 'li', small = false, wide = false } = {}) => {
    const info = live[tab.id];
    const status = info?.status || tab.status;
    const recency = recencyTier(info?.at, now);
    // Phones view: always a phone. Hot view: phone iff hot. Cards: never.
    const asPhone = view === 'phones' || (view === 'hot' && isHotTier(recency));
    // `wide` makes this grid cell span two columns (plans/dock-double-width.md).
    // Only meaningful on a top-level grid child, so the caller opts in (standalone
    // docks pass it; a "together" group carries it on its own <li> instead).
    const wrapClass = [
      asPhone ? 'dash__phone-cell' : '',
      small ? 'dash__dependent' : '',
      wide ? 'dash__cell--wide' : '',
    ]
      .filter(Boolean)
      .join(' ');

    if (asPhone) {
      return (
        <Wrapper key={tab.id} className={wrapClass || undefined}>
          <PinnedAgent
            tab={tab}
            status={status}
            recency={recency}
            contentZoom={contentZoom}
            repoPath={repoPath(tab.repoId)}
            localApps={repos.find((r) => r.id === tab.repoId)?.localApps || []}
            git={gitInfo[tab.repoId]}
            gitRefreshing={!!gitBusy[tab.repoId]}
            onRefreshGit={() => refreshGit(tab.repoId)}
            onMaximize={handleOpen}
            onToggleImportant={toggleImportant}
            onToggleWide={toggleWide}
            onToggleWaiting={toggleWaiting}
            onSetWaitingOn={setWaitingOn}
            dependsOn={tab.dependsOn}
            dependsCandidates={candidatesFor(tab)}
            onSetDependsOn={setDependsOn}
          />
        </Wrapper>
      );
    }
    const activity = info?.activity;
    const git = gitInfo[tab.repoId];
    return (
      <Wrapper key={tab.id} className={wrapClass || undefined}>
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
            <WideToggle
              wide={!!tab.wide}
              onToggle={() => toggleWide(tab.id)}
              className="dash-cell__wide"
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
          <span className="dash-cell__status">{t(`agents.status.${status}`)}</span>
          {git && <GitStatusSummary status={git} compact />}
          <span className="dash-cell__activity">{activity || t('dashboard.noActivity')}</span>
        </button>
        {tab.waiting && (
          <WaitingOnField
            value={tab.waitingOn}
            onCommit={(text) => setWaitingOn(tab.id, text)}
            className="dash-cell__waiting-on"
          />
        )}
        <DependsOnPicker
          value={tab.dependsOn}
          candidates={candidatesFor(tab)}
          onChange={(primaryId) => setDependsOn(tab.id, primaryId)}
          className="dash-cell__depends"
        />
      </Wrapper>
    );
  };

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
          <div className="dash__layout-ctl" role="group" aria-label={t('dashboard.layoutMode')}>
            <button
              type="button"
              className="dash__swap"
              onClick={toggleMode}
              aria-pressed={!free}
              title={free ? t('dashboard.modeToGrid') : t('dashboard.modeToFree')}
              aria-label={free ? t('dashboard.modeToGrid') : t('dashboard.modeToFree')}
            >
              {free ? '⤢' : '▦'}
            </button>
            {free && freePlaced && (
              <button
                type="button"
                className="dash__swap"
                onClick={resetLayout}
                title={t('dashboard.resetLayout')}
                aria-label={t('dashboard.resetLayout')}
              >
                ↺
              </button>
            )}
            {!free && (
              <button
                type="button"
                className={`dash__swap${gridSwapped ? ' dash__swap--on' : ''}`}
                onClick={toggleGridSwap}
                aria-pressed={gridSwapped}
                title={t('dashboard.swapSides')}
                aria-label={t('dashboard.swapSides')}
              >
                ⇄
              </button>
            )}
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

      <div
        ref={bodyRef}
        className={`dash__body${free && freePlaced ? ' dash__body--free' : ''}${!free && gridSwapped ? ' dash__body--swapped' : ''}${dragKey ? ' dash__body--dragging' : ''}`}
      >
        {/* Autopilot mission-control as a drag-layout citizen
            (plans/autopilot-to-harness.md): a dock-styled, free-floating,
            collapsible panel — box-level control over every agent. First child
            so it tops the grid-mode flow; absolutely placed in free mode like
            Ideas/agents. Self-gates on the autopilotTab feature. */}
        {autopilotOn && (
          <section
            data-panel="autopilot"
            className={`dash__auto${dragKey === 'autopilot' ? ' dash__panel--lifted' : ''}`}
            style={free ? posStyle('autopilot') : undefined}
          >
            <AutopilotPanel
              dragHandle={
                free ? (
                  <button
                    type="button"
                    className="dash__drag"
                    onPointerDown={(e) => startPanelDrag('autopilot', e)}
                    onPointerMove={movePanelDrag}
                    onPointerUp={endPanelDrag}
                    onPointerCancel={endPanelDrag}
                    title={t('dashboard.dragPanel')}
                    aria-label={t('dashboard.dragPanel')}
                  >
                    ⠿
                  </button>
                ) : null
              }
            />
          </section>
        )}
        <aside
          ref={ideasRef}
          data-panel="ideas"
          className={`dash__ideas${ideasWide ? ' dash__ideas--wide' : ''}${ideasSize ? ' dash__ideas--sized' : ''}${ideasFloating ? ' dash__ideas--floating' : ''}${ideasCollapsed ? ' dash__ideas--collapsed' : ''}${dragKey === 'ideas' ? ' dash__panel--lifted' : ''}`}
          style={{
            ...(free ? posStyle('ideas') : null),
            // A saved drag-size only applies while expanded; collapsed folds to the header.
            ...(ideasSize && !ideasCollapsed
              ? {
                  width: ideasSize.w,
                  height: ideasSize.h,
                  maxHeight: 'none',
                  // Floating (grid + grown) sizes via width above; otherwise size the flex
                  // track so the dock occupies its width in flow.
                  ...(ideasFloating ? null : { flexBasis: ideasSize.w }),
                }
              : null),
            // Anchor the grid-mode float to the agents-row top (below Autopilot).
            ...(ideasFloating ? { top: floatTop } : null),
          }}
        >
          <div className="dash__ideas-head">
            {free && (
              <button
                type="button"
                className="dash__drag"
                onPointerDown={(e) => startPanelDrag('ideas', e)}
                onPointerMove={movePanelDrag}
                onPointerUp={endPanelDrag}
                onPointerCancel={endPanelDrag}
                title={t('dashboard.dragPanel')}
                aria-label={t('dashboard.dragPanel')}
              >
                ⠿
              </button>
            )}
            <span className="dash__ideas-title">💡 {t('nav.ideas')}</span>
            <button
              type="button"
              className="dash__ideas-expand"
              onClick={toggleIdeasCollapsed}
              aria-pressed={ideasCollapsed}
              title={ideasCollapsed ? t('dashboard.ideasShow') : t('dashboard.ideasCollapse')}
            >
              {ideasCollapsed ? '▸' : '▾'}
            </button>
            {!ideasCollapsed && (
              <button
                type="button"
                className="dash__ideas-expand"
                onClick={toggleIdeasWide}
                aria-pressed={ideasWide}
                title={ideasWide ? t('dashboard.ideasNarrow') : t('dashboard.ideasWide')}
              >
                {ideasWide ? '⇤' : '⇥'}
              </button>
            )}
          </div>
          {!ideasCollapsed && (
            <>
              <IdeasPanel />
              <span
                className="dash__ideas-resize"
                role="separator"
                aria-label="Resize ideas panel"
                title="Drag to resize · double-click to reset"
                onPointerDown={startIdeasResize}
                onPointerMove={moveIdeasResize}
                onPointerUp={endIdeasResize}
                onPointerCancel={endIdeasResize}
                onDoubleClick={clearIdeasSize}
              />
            </>
          )}
        </aside>
        <div
          data-panel="agents"
          className={`dash__main${dragKey === 'agents' ? ' dash__panel--lifted' : ''}`}
          style={free ? posStyle('agents') : undefined}
        >
          {free && (
            <div className="dash__main-head">
              <button
                type="button"
                className="dash__drag"
                onPointerDown={(e) => startPanelDrag('agents', e)}
                onPointerMove={movePanelDrag}
                onPointerUp={endPanelDrag}
                onPointerCancel={endPanelDrag}
                title={t('dashboard.dragPanel')}
                aria-label={t('dashboard.dragPanel')}
              >
                ⠿ <span className="dash__main-head-title">{t('dashboard.title')}</span>
              </button>
            </div>
          )}
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
            // Dependents render INSIDE their primary's "together" group below.
            if (primaryOf(tab)) return null;
            const deps = dependentsByPrimary.get(tab.id) || [];
            // A wide dock spans two columns; for a group, the span rides on the
            // group's own <li> so the whole "together" group widens together.
            if (deps.length === 0) return renderDock(tab, { wide: !!tab.wide });
            // A "together" group: the primary (full size) followed by its
            // dependents (smaller), so the ordering reads at a glance.
            return (
              <li key={`grp-${tab.id}`} className={`dash__group${tab.wide ? ' dash__cell--wide' : ''}`}>
                {renderDock(tab, { tag: 'div' })}
                {deps.map((d) => renderDock(d, { tag: 'div', small: true }))}
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
