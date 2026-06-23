import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import { useDock } from '../context/DockContext';
import { useFeature } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';
import { syncLines } from '../lib/gitSync';
import './agents.css';

// Preset highlight colours for marking agents (plans/agent-color.md). A fixed
// palette keeps the marks fast to pick and visually consistent.
const AGENT_COLORS = ['#ef4444', '#f59e0b', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

// The End User's colour convention, shown as a legend above the list.
// null = no mark (white card).
const LEGEND = [
  { key: 'inactive', color: null },
  { key: 'running', color: '#22c55e' },
  { key: 'deploy', color: '#f59e0b' },
  { key: 'merge', color: '#3b82f6' },
  { key: 'problem', color: '#ef4444' },
];

// Agents tab — conversation list for concurrent agent sessions.
// Replaces the old Dock strip (Advanced Mode only, gated by 'agentDock').
export default function Agents() {
  const { t } = useT();
  const { tabs, activeTabId, setActiveTab, closeTab, openTab, updateTab, repos } = useDock();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [colorPickerFor, setColorPickerFor] = useState(null); // tab id whose palette is open
  const [info, setInfo] = useState({}); // repoId -> /git/status payload
  const [pulling, setPulling] = useState(false);
  const [pullResults, setPullResults] = useState(null); // [{name, ok, updated, baseBranch, error}]
  const navigate = useNavigate();
  const visible = useFeature('agentDock');

  // Git status per tab repo (plans/agent-branch.md, plans/agents-git-sync.md).
  // Best-effort: non-git repos fail the call and simply show no git lines.
  const repoIds = [...new Set(tabs.map((tab) => tab.repoId))].join(',');
  const loadInfo = useCallback(() => {
    if (!repoIds) return;
    repoIds.split(',').forEach(async (repoId) => {
      try {
        const status = await apiGet('/git/status', { repoId });
        // The backend reports "unknown" for non-git repos.
        if (status.branch && status.branch !== 'unknown')
          setInfo((prev) => ({ ...prev, [repoId]: status }));
      } catch {
        /* not a git repo, or transient error — show nothing */
      }
    });
  }, [repoIds]);
  useEffect(() => {
    loadInfo();
  }, [loadInfo]);

  // One tap fast-forwards main/master from origin in every repo that has an
  // agent (plans/agents-git-sync.md — the read-only-git-UI exception).
  async function handlePullMain() {
    setPulling(true);
    setPullResults(null);
    const unique = [...new Map(tabs.map((tab) => [tab.repoId, tab.repoName]))];
    const results = [];
    for (const [repoId, name] of unique) {
      try {
        const r = await apiPost('/git/pull-base', {}, { repoId });
        results.push({ name, ...r });
      } catch {
        results.push({ name, ok: false, error: '' });
      }
    }
    setPullResults(results);
    setPulling(false);
    loadInfo();
  }

  if (!visible) return null;

  function handleOpen(id) {
    setActiveTab(id);
    navigate('/studio');
  }

  function handleClose(e, id) {
    e.stopPropagation();
    closeTab(id);
  }

  function toggleColorPicker(e, id) {
    e.stopPropagation();
    setColorPickerFor((cur) => (cur === id ? null : id));
  }

  function handleSetColor(e, id, color) {
    e.stopPropagation();
    updateTab(id, { color }); // '' clears the mark
    setColorPickerFor(null);
  }

  // Toggle whether this agent appears on the Dashboard (default on). Shared
  // across devices via the backend dock field.
  function handleToggleDashboard(e, id, shown) {
    e.stopPropagation();
    updateTab(id, { dashboard: !shown });
  }

  function handleNewAgent(repoId, repoName) {
    openTab(repoId, repoName);
    setPickerOpen(false);
    navigate('/studio');
  }

  return (
    <div className="agents">
      <div className="agents__header">
        <h2 className="agents__title">{t('agents.title')}</h2>
        {tabs.length > 0 && (
          <button
            type="button"
            className="agents__pull"
            onClick={handlePullMain}
            disabled={pulling}
          >
            {pulling ? t('agents.pulling') : t('agents.pullMain')}
          </button>
        )}
        <button
          type="button"
          className="agents__new"
          onClick={() => setPickerOpen(!pickerOpen)}
        >
          {t('agents.new')}
        </button>
      </div>

      {pullResults && (
        <ul className="agents__pull-results">
          {pullResults.map((r) => (
            <li
              key={r.name}
              className={`agents__pull-result${r.ok ? '' : ' agents__pull-result--error'}`}
            >
              <span className="agents__pull-result-name">{r.name}</span>{' '}
              {r.ok
                ? t(r.updated ? 'agents.pullUpdated' : 'agents.pullUpToDate', { base: r.baseBranch })
                : `${t('agents.pullFailed')}${r.error ? ` — ${r.error}` : ''}`}
            </li>
          ))}
        </ul>
      )}

      {pickerOpen && (
        <div className="agents__picker">
          <div className="agents__picker-title">{t('repo.label')}</div>
          {repos.map((r) => (
            <button
              key={r.id}
              type="button"
              className="agents__picker-item"
              onClick={() => handleNewAgent(r.id, r.name)}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      {tabs.length === 0 && !pickerOpen && (
        <p className="agents__empty">{t('agents.empty')}</p>
      )}

      {tabs.length > 0 && (
        <ul className="agents__legend">
          {LEGEND.map((item) => (
            <li key={item.key} className="agents__legend-item">
              <span
                className={`agents__legend-dot${item.color ? '' : ' agents__legend-dot--none'}`}
                style={item.color ? { background: item.color } : undefined}
              />
              {t(`agents.legend.${item.key}`)}
            </li>
          ))}
        </ul>
      )}

      {colorPickerFor && (
        <div className="agent-color__backdrop" onClick={() => setColorPickerFor(null)} />
      )}

      <ul className="agents__list">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <button
              type="button"
              className={`agent-card agent-card--${tab.status}${tab.id === activeTabId ? ' agent-card--active' : ''}${tab.stash?.length ? ' agent-card--queued' : ''}`}
              data-colored={tab.color ? 'true' : undefined}
              style={tab.color ? { '--agent-color': tab.color } : undefined}
              onClick={() => handleOpen(tab.id)}
            >
              <span className="agent-card__dot" />
              <span className="agent-card__body">
                <span className="agent-card__name">{tab.repoName}</span>
                {repos.find((r) => r.id === tab.repoId)?.path && (
                  <span className="agent-card__path">
                    {repos.find((r) => r.id === tab.repoId).path}
                  </span>
                )}
                {info[tab.repoId] && (
                  <span className="agent-card__branch">
                    <span aria-hidden="true">⎇</span> {info[tab.repoId].branch}
                  </span>
                )}
                {info[tab.repoId] && syncLines(t, info[tab.repoId]).map((line) => (
                  <span
                    key={line.key}
                    className={`agent-card__sync${line.warn ? ' agent-card__sync--warn' : ''}`}
                  >
                    {line.text}
                  </span>
                ))}
                <span className="agent-card__status">
                  {t(`agents.status.${tab.status}`)}
                </span>
              </span>

              <span
                className={`agent-card__dash${tab.dashboard === false ? ' agent-card__dash--off' : ''}`}
                role="button"
                tabIndex={0}
                aria-pressed={tab.dashboard !== false}
                title={t(tab.dashboard === false ? 'agents.dashboard.show' : 'agents.dashboard.hide')}
                aria-label={t(tab.dashboard === false ? 'agents.dashboard.show' : 'agents.dashboard.hide')}
                onClick={(e) => handleToggleDashboard(e, tab.id, tab.dashboard !== false)}
              >
                ▦
              </span>

              <span
                className="agent-card__swatch"
                role="button"
                tabIndex={0}
                aria-label={t('agents.color.label')}
                style={tab.color ? { background: tab.color } : undefined}
                onClick={(e) => toggleColorPicker(e, tab.id)}
              />

              {colorPickerFor === tab.id && (
                <span className="agent-color" onClick={(e) => e.stopPropagation()}>
                  {AGENT_COLORS.map((c) => (
                    <span
                      key={c}
                      className="agent-color__opt"
                      role="button"
                      aria-label={c}
                      style={{ background: c }}
                      onClick={(e) => handleSetColor(e, tab.id, c)}
                    />
                  ))}
                  <span
                    className="agent-color__opt agent-color__opt--clear"
                    role="button"
                    aria-label={t('agents.color.clear')}
                    onClick={(e) => handleSetColor(e, tab.id, '')}
                  >
                    &times;
                  </span>
                </span>
              )}

              <span
                className="agent-card__close"
                onClick={(e) => handleClose(e, tab.id)}
                aria-label={t('common.close')}
              >
                &times;
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
