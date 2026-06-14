import Chat from '../../pages/Chat';
import { useChatFor } from '../../context/ChatContext';
import { useT } from '../../i18n/LanguageContext';
import GitStatusSummary from '../git/GitStatusSummary';

// One "phone" in the Agent Dashboard's wall of phones (plans/agent-dashboard.md):
// a single agent's live Chat view, pinned to that agent's repo regardless of
// which dock tab is active. useChatFor drives one background conversation by
// key; <Chat embedded> renders it without the app-level chrome.
//
// The header is the maximize affordance — tapping it opens this agent in the
// full /studio view (the same flow as a dashboard card / Agents-tab row).
export default function PinnedAgent({ tab, status, recency, repoPath, git, onMaximize }) {
  const { t } = useT();
  const chat = useChatFor({
    key: tab.id,
    repoId: tab.repoId,
    tabId: tab.id,
    sessionId: tab.sessionId,
  });

  return (
    <div
      className={`phone phone--${status}`}
      data-colored={tab.color ? 'true' : undefined}
      data-recency={recency}
      style={tab.color ? { '--agent-color': tab.color } : undefined}
    >
      <button
        type="button"
        className="phone__bar"
        onClick={() => onMaximize(tab.id)}
        title={t('dashboard.maximize')}
      >
        <span className="phone__dot" />
        <span className="phone__name">{tab.repoName}</span>
        {repoPath && <span className="phone__path">{repoPath}</span>}
        <span className="phone__status">{t(`agents.status.${status}`)}</span>
      </button>
      {git && (
        <div className="phone__git">
          <GitStatusSummary status={git} compact />
        </div>
      )}
      <div className="phone__screen">
        <Chat chat={chat} embedded />
      </div>
    </div>
  );
}
