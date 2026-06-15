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
  localApp,
  git,
  gitRefreshing = false,
  onRefreshGit,
  onMaximize,
  onToggleImportant,
  onToggleWaiting,
  onSetWaitingOn,
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

  // Slice 2 (plans/dock-local-app.md): the local-app row is the affordance that
  // reveals the product IN the dock. Clicking it swaps phone__screen from the
  // chat to ProductFrame (the same iframe + liveness the Local tab uses), and
  // back. Off by default so the wall stays light — the iframe only mounts once
  // revealed. Gated like the Local tab (localAppTab) and only when a port exists.
  const canLocalApp = useFeature('localAppTab');
  const [showApp, setShowApp] = useState(false);
  const localPort = localApp?.port;
  const localState = !localPort ? 'none' : localApp.online ? 'serving' : 'offline';
  const canReveal = canLocalApp && !!localPort;
  // If the port disappears (probe drops it), fall back to the chat view.
  const appOpen = showApp && canReveal;

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
      {/* Local-tab app serving state (plans/dock-local-app.md): a dedicated row
          above the git section saying whether this agent serves a local app.
          Configured-but-dead reads "offline"; no localPort reads "no local app".
          Slice 2: when a port exists, the row is a toggle that reveals/hides the
          product inside the dock (phone__screen ↔ ProductFrame). */}
      {(() => {
        const text =
          localState === 'serving'
            ? t('dashboard.localServing', { port: localPort })
            : localState === 'offline'
              ? t('dashboard.localOffline', { port: localPort })
              : t('dashboard.localNone');
        const cls = `phone__local phone__local--${localState}${appOpen ? ' phone__local--open' : ''}`;
        const inner = (
          <>
            <span className="phone__local-dot" />
            <span className="phone__local-label">{t('dashboard.localApp')}</span>
            <span className="phone__local-text">{text}</span>
            {canReveal && (
              <span className="phone__local-caret" aria-hidden="true">
                {appOpen ? '▾' : '▸'}
              </span>
            )}
          </>
        );
        return canReveal ? (
          <button
            type="button"
            className={cls}
            onClick={() => setShowApp((v) => !v)}
            aria-pressed={appOpen}
            title={appOpen ? t('dashboard.localHide') : t('dashboard.localShow')}
          >
            {inner}
          </button>
        ) : (
          <div className={cls}>{inner}</div>
        );
      })()}
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
        {appOpen ? (
          <ProductFrame url={`/api/localview/${tab.repoId}/`} port={localPort} />
        ) : (
          <Chat chat={chat} embedded />
        )}
      </div>
    </div>
  );
}
