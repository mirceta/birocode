import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet, apiPost } from '../api/client';
import { useDock } from '../context/DockContext';
import { useFeature } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';
import './agents.css';

// Agents tab — conversation list for concurrent agent sessions.
// Replaces the old Dock strip (Advanced Mode only, gated by 'agentDock').
export default function Agents() {
  const { t } = useT();
  const { tabs, activeTabId, setActiveTab, closeTab, openTab, repos } = useDock();
  const [pickerOpen, setPickerOpen] = useState(false);
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

  // Same explicit wording as the Git tab, condensed to one line per compare.
  function syncLines(s) {
    const lines = [];
    if (s.baseBranch) {
      const parts = [];
      if (s.baseAhead > 0)
        parts.push(t(s.baseAhead === 1 ? 'git.baseAheadOne' : 'git.baseAhead', { n: s.baseAhead, base: s.baseBranch }));
      if (s.baseBehind > 0)
        parts.push(t(s.baseBehind === 1 ? 'git.baseBehindOne' : 'git.baseBehind', { n: s.baseBehind, base: s.baseBranch }));
      if (parts.length === 0) parts.push(t('git.baseInSync', { base: s.baseBranch }));
      lines.push({ key: 'base', text: parts.join(' · ') });
    }
    if (!s.upstream) {
      lines.push({ key: 'origin', text: t('git.noUpstream'), warn: true });
    } else {
      const parts = [];
      if (s.ahead > 0)
        parts.push(t(s.ahead === 1 ? 'git.aheadOne' : 'git.ahead', { n: s.ahead }));
      if (s.behind > 0)
        parts.push(t(s.behind === 1 ? 'git.behindOne' : 'git.behind', { n: s.behind }));
      if (parts.length === 0) parts.push(t('git.inSync'));
      lines.push({ key: 'origin', text: parts.join(' · ') });
    }
    return lines;
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

      <ul className="agents__list">
        {tabs.map((tab) => (
          <li key={tab.id}>
            <button
              type="button"
              className={`agent-card agent-card--${tab.status}${tab.id === activeTabId ? ' agent-card--active' : ''}`}
              onClick={() => handleOpen(tab.id)}
            >
              <span className="agent-card__dot" />
              <span className="agent-card__body">
                <span className="agent-card__name">{tab.repoName}</span>
                {info[tab.repoId] && (
                  <span className="agent-card__branch">
                    <span aria-hidden="true">⎇</span> {info[tab.repoId].branch}
                  </span>
                )}
                {info[tab.repoId] && syncLines(info[tab.repoId]).map((line) => (
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
