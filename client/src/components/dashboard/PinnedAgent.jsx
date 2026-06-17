import { useState } from 'react';
import Chat from '../../pages/Chat';
import { useChatFor } from '../../context/ChatContext';
import { useT } from '../../i18n/LanguageContext';
import { useFeature } from '../../context/UiModeContext';
import GitStatusSummary from '../git/GitStatusSummary';
import ProductFrame from '../app/ProductFrame';
import CopyPath from './CopyPath';
import ImportantStar from './ImportantStar';
import WaitingBadge from './WaitingBadge';
import WaitingOnField from './WaitingOnField';
import DependsOnPicker from './DependsOnPicker';

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
  localApps,
  git,
  gitRefreshing = false,
  onRefreshGit,
  onMaximize,
  onToggleImportant,
  onToggleWaiting,
  onSetWaitingOn,
  dependsOn,
  dependsCandidates = [],
  onSetDependsOn,
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

  // Per-app switcher (plans/dock-multi-local-app.md): one button per local app the
  // repo defines (mirrors the Local tab), instead of dock-local-app's single
  // default-app toggle. Clicking an app swaps phone__screen from the chat to
  // ProductFrame at /api/localview/{repoId}/app/{appId}/; clicking the active one
  // returns to the chat. One app at a time, off by default so the wall stays light
  // (a frame only mounts once an app is picked). Gated like the Local tab.
  const canLocalApp = useFeature('localAppTab');
  const apps = canLocalApp ? (localApps || []) : [];
  const [openAppId, setOpenAppId] = useState(null);
  const openApp = apps.find((a) => a.id === openAppId) || null;

  return (
    <div
      className={`phone phone--${status}${tab.important ? ' phone--important' : ''}${tab.waiting ? ' phone--waiting' : ''}`}
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
        <WaitingBadge
          waiting={!!tab.waiting}
          onToggle={() => onToggleWaiting?.(tab.id)}
          className="phone__waiting"
        />
      </button>
      {tab.waiting && (
        <WaitingOnField
          value={tab.waitingOn}
          onCommit={(text) => onSetWaitingOn?.(tab.id, text)}
          className="phone__waiting-on"
        />
      )}
      {onSetDependsOn && dependsCandidates.length > 0 && (
        <DependsOnPicker
          value={dependsOn}
          candidates={dependsCandidates}
          onChange={(primaryId) => onSetDependsOn(tab.id, primaryId)}
          className="phone__depends"
        />
      )}
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
      {/* Local-app switcher (plans/dock-multi-local-app.md): one button per local
          app the repo defines (incl. the always-on Understanding app), mirroring the
          Local tab. The active app renders in phone__screen; clicking it again — or
          picking another — toggles back to chat / switches. */}
      {apps.length > 0 && (
        <div className="phone__apps" role="tablist" aria-label={t('dashboard.localApps')}>
          {apps.map((a) => (
            <button
              key={a.id}
              type="button"
              role="tab"
              aria-selected={a.id === openAppId}
              className={`phone__app${a.id === openAppId ? ' phone__app--on' : ''}`}
              onClick={() => setOpenAppId((cur) => (cur === a.id ? null : a.id))}
              title={`:${a.port}${a.kind === 'harness' ? ' · harness' : ''}`}
            >
              {a.name}{a.kind === 'repo' && <span className="phone__app-port"> :{a.port}</span>}
            </button>
          ))}
        </div>
      )}
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
        {openApp ? (
          <ProductFrame url={`/api/localview/${tab.repoId}/app/${openApp.id}/`} port={openApp.port} />
        ) : (
          <Chat chat={chat} embedded stashTabId={tab.id} />
        )}
      </div>
    </div>
  );
}
