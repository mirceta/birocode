import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  const visible = useFeature('agentDock');

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
        <button
          type="button"
          className="agents__new"
          onClick={() => setPickerOpen(!pickerOpen)}
        >
          {t('agents.new')}
        </button>
      </div>

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
