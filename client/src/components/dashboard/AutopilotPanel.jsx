import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { useFeature } from '../../context/UiModeContext';
import '../../pages/autopilot.css';
import './autopilot-panel.css';

// Autopilot as a first-class dashboard section (plans/autopilot-to-harness.md,
// Part 2 — box-level cross-agent operation). A collapsible panel pinned above the
// agent docks (like Scoreboard) that surfaces the loop across ALL agents at once:
// the global enable / auto-advance / threshold / kill controls, the risky-action
// deny-list, and a compact per-agent status + arm list with a "needs you" rollup.
// Reuses the harness Autopilot tab's API (/api/autopilot) and its ap-* styles;
// the tab stays the detailed surface (intercepts / history / audit / prompts).
const POLL_MS = 4000;
const COLLAPSED_KEY = 'claudeweb_dash_autopilot_collapsed';

const BADGE = {
  suggestion: { cls: 'sugg', label: 'suggestion' },
  sent: { cls: 'sent', label: 'sent' },
  escalate: { cls: 'esc', label: 'needs you' },
  running: { cls: 'run', label: 'running' },
  idle: { cls: 'idle', label: 'idle' },
  paused: { cls: 'idle', label: 'paused' },
  off: { cls: 'off', label: 'off' },
};

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

export default function AutopilotPanel() {
  const on = useFeature('autopilotTab');
  const [data, setData] = useState(null);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      setData(await apiGet('/autopilot'));
    } catch {
      /* keep last good state; retry next tick */
    }
  }, []);

  useEffect(() => {
    if (!on) return undefined;
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [on, load]);

  const mutate = useCallback(async (body) => {
    try {
      setData(await apiPost('/autopilot/config', body)); // returns fresh state
    } catch {
      /* ignore; next poll reconciles */
    }
  }, []);

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
  const threshold = data?.threshold ?? 0.85;
  const denyList = data?.denyList ?? [];
  const armed = agents.filter((a) => a.armed).length;
  const needs = agents.filter((a) => a.decision === 'escalate').length;

  return (
    <section className="ap-panel">
      <div className="ap-panel__bar">
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
          {enabled ? (
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
          <div className="ap-bar">
            <button
              className={`ap-switch ${enabled ? 'on' : ''}`}
              onClick={() => mutate({ enabled: !enabled })}
              title="Global kill switch — affects every agent"
            >
              <span className="ap-switch__knob" />
            </button>
            <b>Autopilot</b>
            <span className="ap-muted">{enabled ? 'on · armed agents only' : 'killed · all manual'}</span>

            <span className="ap-bar__sep" />
            <button
              className={`ap-switch ${autoAdvance ? 'on ap-switch--hot' : ''}`}
              onClick={() => mutate({ autoAdvance: !autoAdvance })}
              disabled={!enabled}
              title="Auto-advance: actually send confident, non-risky prompts"
            >
              <span className="ap-switch__knob" />
            </button>
            <b>Auto-advance</b>
            <span className="ap-muted">{autoAdvance ? 'sending for you' : 'suggest-only'}</span>

            <span className="ap-bar__spacer" />
            <span className="ap-thresh">
              confidence ≥ <b>{threshold.toFixed(2)}</b>
              <button onClick={() => mutate({ threshold: +(threshold - 0.05).toFixed(2) })} disabled={threshold <= 0.5}>−</button>
              <button onClick={() => mutate({ threshold: +(threshold + 0.05).toFixed(2) })} disabled={threshold >= 0.99}>+</button>
            </span>
          </div>

          <div className="ap-deny">
            Always escalates:{' '}
            {denyList.length
              ? denyList.map((d, i) => <code key={i}>{d}</code>)
              : <span className="ap-muted">—</span>}
          </div>

          <ul className="ap-agents">
            {agents.map((a) => {
              const b = BADGE[a.decision] ?? BADGE.idle;
              return (
                <li key={a.repoId} className={`ap-agent ${a.decision === 'escalate' ? 'is-esc' : ''} ${a.armed ? '' : 'is-off'}`}>
                  <span className={`ap-state st-${b.cls}`}>{b.label}</span>
                  <span className="ap-agent__id">{a.repoName}</span>
                  <span className="ap-agent__pred">
                    {a.decision === 'suggestion' && (
                      <>→ <code>{a.label}</code> <span className="ap-conf">{a.confidence.toFixed(2)}</span></>
                    )}
                    {a.decision === 'escalate' && <span className="ap-muted">{a.reason}</span>}
                    {a.decision === 'running' && <span className="ap-muted">agent is running…</span>}
                    {(a.decision === 'idle' || a.decision === 'paused' || a.decision === 'off') && (
                      <span className="ap-muted">{a.reason || (a.armed ? '' : 'not armed')}</span>
                    )}
                  </span>
                  <button
                    className={`ap-mini ${a.armed ? 'on' : ''}`}
                    onClick={() => mutate({ repoId: a.repoId, armed: !a.armed })}
                  >
                    {a.armed ? 'Disarm' : 'Arm'}
                  </button>
                </li>
              );
            })}
            {agents.length === 0 && <li className="autopilot__empty">No agents yet.</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
