import { useState } from 'react';
import Chat from '../../pages/Chat';
import { useChatFor } from '../../context/ChatContext';
import { useT } from '../../i18n/LanguageContext';
import GitStatusSummary from '../git/GitStatusSummary';
import CopyPath from './CopyPath';
import ImportantStar from './ImportantStar';

// One "phone" in the Agent Dashboard's wall of phones (plans/agent-dashboard.md):
// a single agent's live Chat view, pinned to that agent's repo regardless of
// which dock tab is active. useChatFor drives one background conversation by
// key; <Chat embedded> renders it without the app-level chrome.
//
// The header is the maximize affordance — tapping it opens this agent in the
// full /studio view (the same flow as a dashboard card / Agents-tab row).
export default function PinnedAgent({
  tab,
  status,
  recency,
  contentZoom = 1,
  repoPath,
  git,
  gitRefreshing = false,
  onRefreshGit,
  onMaximize,
  onToggleImportant,
}) {
  const { t } = useT();
  // Per-dock lane toggle (plans/repo-ask-chat.md slice 3): each phone can switch
  // its embedded chat between the agent's builder conversation and a read-only
  // Ask side conversation on the SAME repo. The ask lane uses its own key and
  // passes tabId null so it never patches the builder dock's badge/session.
  const [laneView, setLaneView] = useState('builder');
  const isAsk = laneView === 'ask';
  const chat = useChatFor({
    key: isAsk ? `ask:${tab.repoId}` : tab.id,
    repoId: tab.repoId,
    tabId: isAsk ? null : tab.id,
    sessionId: isAsk ? null : tab.sessionId,
    lane: isAsk ? 'ask' : 'builder',
  });

  return (
    <div
      className={`phone phone--${status}${tab.important ? ' phone--important' : ''}`}
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
        {repoPath && <CopyPath path={repoPath} className="phone__path" />}
        <span className="phone__status">{t(`agents.status.${status}`)}</span>
        <ImportantStar
          important={!!tab.important}
          onToggle={() => onToggleImportant?.(tab.id)}
          className="phone__important"
        />
      </button>
      <div className="phone__lanes" role="tablist" aria-label={t('chat.scopesAria')}>
        <button
          type="button"
          role="tab"
          aria-selected={!isAsk}
          className={`phone__lane${!isAsk ? ' phone__lane--on' : ''}`}
          onClick={() => setLaneView('builder')}
        >
          {t('chat.laneBuilder')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isAsk}
          className={`phone__lane${isAsk ? ' phone__lane--on' : ''}`}
          title={t('chat.askHint')}
          onClick={() => setLaneView('ask')}
        >
          {t('chat.tabAsk')}
        </button>
      </div>
      {git && (
        <div className="phone__git">
          <GitStatusSummary status={git} compact />
          {onRefreshGit && (
            <button
              type="button"
              className={`phone__git-refresh${gitRefreshing ? ' is-spinning' : ''}`}
              onClick={onRefreshGit}
              disabled={gitRefreshing}
              title={t('dashboard.refreshGit')}
              aria-label={t('dashboard.refreshGit')}
            >
              ↻
            </button>
          )}
        </div>
      )}
      <div className="phone__screen" style={contentZoom !== 1 ? { zoom: contentZoom } : undefined}>
        <Chat chat={chat} embedded />
      </div>
    </div>
  );
}
