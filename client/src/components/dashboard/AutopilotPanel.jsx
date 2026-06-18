import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet } from '../../api/client';
import { useFeature } from '../../context/UiModeContext';
import AutopilotConsole from '../autopilot/AutopilotConsole';
import '../../pages/autopilot.css';
import './autopilot-panel.css';

// Autopilot on the agent dashboard (plans/autopilot-to-harness.md). A draggable,
// resizable, collapsible dock that embeds the FULL AutopilotConsole — the exact
// same detailed surface (agents · prompts · intercepts · history · audit) as the
// routed Autopilot tab, so the dashboard view and the (mobile-first) tab are
// identical, not two drifting copies. The dock adds its own header: a title and
// a live one-line summary (armed / "N need you" / mode) that stays useful even
// when collapsed — which is why it keeps a lightweight poll of its own.
const POLL_MS = 4000;
const COLLAPSED_KEY = 'claudeweb_dash_autopilot_collapsed';
// Per-device saved size of the dock (plans/autopilot-to-harness.md): the default
// width is deliberately compact, so let the operator drag it bigger/smaller and
// remember it. Mirrors how the drag layout persists {x,y} positions.
const SIZE_KEY = 'claudeweb_dash_autopilot_size';
const MIN_W = 320;
const MIN_H = 160;

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

function readSize() {
  try {
    const raw = localStorage.getItem(SIZE_KEY);
    const v = raw ? JSON.parse(raw) : null;
    if (v && typeof v === 'object' && (v.w || v.h)) return v;
  } catch {
    /* private mode / malformed */
  }
  return null;
}

// `dragHandle` (optional) is the ⠿ grip the dashboard injects in free-drag mode
// so this dock joins the 2D layout like Ideas/agents; it lives in the dock's
// header bar. Omitted (null) in grid mode.
export default function AutopilotPanel({ dragHandle = null }) {
  const on = useFeature('autopilotTab');
  const [data, setData] = useState(null);
  // The whole /api/autopilot surface is fenced by the operator gate (default
  // off); a 403 means "the host hasn't enabled autopilot", not a failure — show
  // that honestly instead of a misleading "on · none waiting" (matches the tab).
  const [gated, setGated] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const timer = useRef(null);

  // Drag-to-resize the dock (bottom-right grip). Size is remembered per device;
  // double-clicking the grip clears it back to the responsive default.
  const [size, setSize] = useState(readSize);
  const sectionRef = useRef(null);
  const resizeRef = useRef(null);

  function startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    const rect = sectionRef.current?.getBoundingClientRect();
    resizeRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseW: rect?.width ?? MIN_W,
      baseH: rect?.height ?? MIN_H,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function moveResize(e) {
    const r = resizeRef.current;
    if (!r) return;
    const maxW = Math.round(window.innerWidth * 0.95);
    const maxH = Math.round(window.innerHeight * 0.9);
    const w = Math.max(MIN_W, Math.min(maxW, Math.round(r.baseW + (e.clientX - r.startX))));
    const h = Math.max(MIN_H, Math.min(maxH, Math.round(r.baseH + (e.clientY - r.startY))));
    setSize({ w, h });
  }

  function endResize() {
    if (!resizeRef.current) return;
    resizeRef.current = null;
    setSize((s) => {
      if (s) {
        try {
          localStorage.setItem(SIZE_KEY, JSON.stringify(s));
        } catch {
          /* private mode — in-memory only */
        }
      }
      return s;
    });
  }

  function resetSize() {
    setSize(null);
    try {
      localStorage.removeItem(SIZE_KEY);
    } catch {
      /* private mode */
    }
  }

  const load = useCallback(async () => {
    try {
      setData(await apiGet('/autopilot'));
      setGated(false);
    } catch (e) {
      // 403 = operator gate is off; reflect it. Other errors: keep last good
      // state and retry next tick.
      if (e?.status === 403) setGated(true);
    }
  }, []);

  useEffect(() => {
    if (!on) return undefined;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
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

  if (!on) return null;

  const agents = data?.agents ?? [];
  const enabled = data?.enabled ?? true;
  const autoAdvance = data?.autoAdvance ?? false;
  const armed = agents.filter((a) => a.armed).length;
  const needs = agents.filter((a) => a.decision === 'escalate').length;

  // Width sticks in both states; height only when expanded (collapsed = just the
  // header bar, so a fixed height would leave dead space). A pinned height also
  // lifts the default max-height cap (.is-sized) so the operator can go taller.
  const heightApplied = !!(size?.h && !collapsed);
  const sizeStyle = size
    ? { width: size.w, ...(heightApplied ? { height: size.h } : {}) }
    : undefined;

  return (
    <section
      ref={sectionRef}
      className={`ap-panel ap-panel--dock${heightApplied ? ' is-sized' : ''}`}
      style={sizeStyle}
    >
      <div className="ap-panel__bar">
        {dragHandle}
        <button
          type="button"
          className="ap-panel__toggle"
          onClick={toggleCollapsed}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand autopilot' : 'Collapse autopilot'}
        >
          <span className={`ap-panel__chev${collapsed ? ' is-collapsed' : ''}`}>▾</span>
          <span className="ap-panel__title">🛞 Autopilot</span>
        </button>
        <span className="ap-panel__summary">
          {gated ? (
            <span className="ap-muted">off · turned off by operator</span>
          ) : enabled ? (
            <>
              {armed} armed
              {' · '}
              {needs > 0 ? <b className="ap-panel__needs">{needs} need you</b> : <span className="ap-muted">none waiting</span>}
              {' · '}
              <span className="ap-muted">{autoAdvance ? 'auto-advance' : 'suggest-only'}</span>
            </>
          ) : (
            <span className="ap-muted">killed · all manual</span>
          )}
        </span>
      </div>

      {!collapsed && (
        <div className="ap-panel__body">
          {/* The full console — same surface as the routed tab. It runs its own
              poll + gate handling; the dock's header summary above uses the
              dock's lightweight poll so it stays live even while collapsed. */}
          <AutopilotConsole embedded />
        </div>
      )}

      {!collapsed && (
        <span
          className="ap-panel__resize"
          role="separator"
          aria-label="Resize autopilot panel"
          title="Drag to resize · double-click to reset"
          onPointerDown={startResize}
          onPointerMove={moveResize}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onDoubleClick={resetSize}
        />
      )}
    </section>
  );
}
