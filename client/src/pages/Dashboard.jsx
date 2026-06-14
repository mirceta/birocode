import { useNavigate } from 'react-router-dom';
import { useDock } from '../context/DockContext';
import { useT } from '../i18n/LanguageContext';
import './dashboard.css';

// Agent dashboard (plans/agent-dashboard.md) — a full-screen grid overview of
// every dock agent, opened from the top bar (not a tab). This is a new VIEW
// over DockContext, not new plumbing: it reads the same agent list the Agents
// tab does, and clicking a cell reuses the existing open-agent flow
// (setActiveTab + /studio), then closes the overlay.
export default function Dashboard({ onClose }) {
  const { t } = useT();
  const { tabs, activeTabId, setActiveTab } = useDock();
  const navigate = useNavigate();

  function handleOpen(id) {
    setActiveTab(id);
    navigate('/studio');
    onClose?.();
  }

  return (
    <div className="dash">
      <div className="dash__header">
        <h2 className="dash__title">{t('dashboard.title')}</h2>
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
        <ul className="dash__grid">
          {tabs.map((tab) => (
            <li key={tab.id}>
              <button
                type="button"
                className={`dash-cell dash-cell--${tab.status}${tab.id === activeTabId ? ' dash-cell--active' : ''}`}
                data-colored={tab.color ? 'true' : undefined}
                style={tab.color ? { '--agent-color': tab.color } : undefined}
                onClick={() => handleOpen(tab.id)}
              >
                <span className="dash-cell__head">
                  <span className="dash-cell__dot" />
                  <span className="dash-cell__name">{tab.repoName}</span>
                </span>
                <span className="dash-cell__status">
                  {t(`agents.status.${tab.status}`)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
