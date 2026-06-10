import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDock } from '../context/DockContext';
import { useFeature } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';
import './dock.css';

export default function Dock() {
  const { t } = useT();
  const { tabs, activeTabId, setActiveTab, closeTab, openTab, repos } = useDock();
  const [pickerOpen, setPickerOpen] = useState(false);
  const navigate = useNavigate();
  const visible = useFeature('agentDock');

  if (!visible) return null;

  function handleTabClick(id) {
    setActiveTab(id);
    navigate('/studio');
  }

  function handleClose(e, id) {
    e.stopPropagation();
    closeTab(id);
  }

  function handleAddTab(repoId, repoName) {
    openTab(repoId, repoName);
    setPickerOpen(false);
    navigate('/studio');
  }

  const statusClass = (s) =>
    s === 'running' ? 'dock-tab--running'
    : s === 'error' ? 'dock-tab--error'
    : s === 'done' ? 'dock-tab--done'
    : '';

  return (
    <div className="dock">
      <div className="dock__tabs">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`dock-tab ${statusClass(tab.status)}${tab.id === activeTabId ? ' dock-tab--active' : ''}`}
            onClick={() => handleTabClick(tab.id)}
          >
            <span className="dock-tab__dot" />
            <span className="dock-tab__name">{tab.repoName}</span>
            <span
              className="dock-tab__close"
              onClick={(e) => handleClose(e, tab.id)}
              aria-label={t('common.close')}
            >
              &times;
            </span>
          </button>
        ))}
        <button
          type="button"
          className="dock__add"
          onClick={() => setPickerOpen(!pickerOpen)}
          aria-label="Add agent tab"
        >
          +
        </button>
      </div>

      {pickerOpen && (
        <>
          <div className="dock-picker-backdrop" onClick={() => setPickerOpen(false)} />
          <div className="dock-picker">
            <div className="dock-picker__title">{t('repo.label')}</div>
            {repos.map((r) => (
              <button
                key={r.id}
                type="button"
                className="dock-picker__item"
                onClick={() => handleAddTab(r.id, r.name)}
              >
                {r.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
