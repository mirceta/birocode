import { useNavigate } from 'react-router-dom';
import { useDock } from '../context/DockContext';
import { useFeature } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';
import './dashboard.css';

// Agent dashboard (plans/agent-dashboard.md, slice 1) — a grid overview of
// every dock agent at once. This is a new VIEW over DockContext, not new
// plumbing: it reads the same agent list the Agents tab does, and Maximize
// reuses the existing open-agent flow (setActiveTab + /studio).
export default function Dashboard() {
  const { t } = useT();
  const { tabs, activeTabId, setActiveTab } = useDock();
  const navigate = useNavigate();
  const visible = useFeature('agentDashboard');

  if (!visible) return null;

  function handleMaximize(id) {
    setActiveTab(id);
    navigate('/studio');
  }

  return (
    <div className="dash">
      <div className="dash__header">
        <h2 className="dash__title">{t('dashboard.title')}</h2>
      </div>

      {tabs.length === 0 ? (
        <p className="dash__empty">{t('dashboard.empty')}</p>
      ) : (
        <ul className="dash__grid">
          {tabs.map((tab) => (
            <li
              key={tab.id}
              className={`dash-cell dash-cell--${tab.status}${tab.id === activeTabId ? ' dash-cell--active' : ''}`}
              data-colored={tab.color ? 'true' : undefined}
              style={tab.color ? { '--agent-color': tab.color } : undefined}
            >
              <div className="dash-cell__head">
                <span className="dash-cell__dot" />
                <span className="dash-cell__name">{tab.repoName}</span>
              </div>
              <span className="dash-cell__status">
                {t(`agents.status.${tab.status}`)}
              </span>
              <button
                type="button"
                className="dash-cell__maximize"
                onClick={() => handleMaximize(tab.id)}
              >
                {t('dashboard.maximize')}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
