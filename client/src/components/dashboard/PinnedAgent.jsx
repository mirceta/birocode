import { useState } from 'react';
import Chat from '../../pages/Chat';
import { apiPost } from '../../api/client';
import { useChatFor } from '../../context/ChatContext';
import { useT } from '../../i18n/LanguageContext';
import { useFeature } from '../../context/UiModeContext';
import GitStatusSummary from '../git/GitStatusSummary';
import { deriveGitActions, pullMainPath } from '../git/gitActions';
import ProductFrame from '../app/ProductFrame';
import FilesBrowser from '../files/FilesBrowser';
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

  // Files tab on the dock (plans/agent-dock-files-tab.md): a third screen the
  // phone can show — the SAME browse-and-view surface as the routed Files tab
  // (tree · viewer · pins · live poll · doc-links), scoped to THIS agent's repo.
  // It is a sibling of the Builder/Ask lanes and the local-app buttons: picking
  // it swaps phone__screen to the FilesBrowser; picking a lane or app swaps back.
  // Gated on the filesDock feature (Advanced by default).
  const filesOn = useFeature('filesDock');
  const [showFiles, setShowFiles] = useState(false);

  // Inward-sync git actions in the dock's git row (plans/dock-git-actions.md):
  // the SAME merge / pull-main / pull-branch actions as the Git tab, scoped to
  // THIS dock's repo via repoId → X-Repo-Id, reusing the Git tab's act() flow
  // (disable while acting, refresh status when done). Push is intentionally
  // omitted — publishing stays a deliberate Git-tab action.
  const showGitActions = useFeature('dockGitActions');
  const [gitActing, setGitActing] = useState(''); // which action is in flight
  const [gitActMsg, setGitActMsg] = useState(null); // { ok, text }
  const ga = git ? deriveGitActions(git) : null;

  const runGitAction = async (name, path) => {
    setGitActing(name);
    setGitActMsg(null);
    try {
      const r = await apiPost(path, undefined, { repoId: tab.repoId });
      setGitActMsg({ ok: true, text: r.updated ? t('git.actUpdated') : t('git.actNoop') });
    } catch (err) {
      let text = err.message;
      try {
        text = JSON.parse(err.message).error || text;
      } catch { /* raw text */ }
      setGitActMsg({ ok: false, text });
    } finally {
      setGitActing('');
      onRefreshGit?.(); // re-fetch this dock's status (hits origin) like the Git tab
    }
  };

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
          aria-selected={!isAsk && !showFiles}
          className={`phone__lane${!isAsk && !showFiles ? ' phone__lane--on' : ''}`}
          onClick={() => {
            setShowFiles(false);
            setLaneView('builder');
          }}
        >
          {t('chat.laneBuilder')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isAsk && !showFiles}
          className={`phone__lane${isAsk && !showFiles ? ' phone__lane--on' : ''}`}
          title={t('chat.askHint')}
          onClick={() => {
            setShowFiles(false);
            setLaneView('ask');
          }}
        >
          {t('chat.tabAsk')}
        </button>
        {filesOn && (
          <button
            type="button"
            role="tab"
            aria-selected={showFiles}
            className={`phone__lane${showFiles ? ' phone__lane--on' : ''}`}
            title={t('files.tabHint')}
            onClick={() => {
              setOpenAppId(null);
              setShowFiles(true);
            }}
          >
            {t('files.tab')}
          </button>
        )}
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
              onClick={() => {
                setShowFiles(false);
                setOpenAppId((cur) => (cur === a.id ? null : a.id));
              }}
              title={`:${a.port}${a.kind === 'harness' ? ' · harness' : ''}`}
            >
              {a.name}{a.kind === 'repo' && <span className="phone__app-port"> :{a.port}</span>}
            </button>
          ))}
        </div>
      )}
      {git && (
        <div className="phone__git">
          <div className="phone__git-top">
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
          {showGitActions && ga && (
            <div className="phone__git-actions" role="group" aria-label={t('dashboard.gitActions')}>
              {!ga.onBase && (
                <button
                  type="button"
                  className="phone__git-action"
                  disabled={!ga.canMerge || !!gitActing || gitRefreshing}
                  onClick={() => runGitAction('merge', '/git/merge-base')}
                >
                  {gitActing === 'merge'
                    ? t('dashboard.gitActing')
                    : t('dashboard.gitMerge', { base: ga.base || 'main' })}
                </button>
              )}
              <button
                type="button"
                className="phone__git-action"
                disabled={!ga.canPullMain || !!gitActing || gitRefreshing}
                onClick={() => runGitAction('pullMain', pullMainPath(ga.onBase))}
              >
                {gitActing === 'pullMain'
                  ? t('dashboard.gitActing')
                  : t('dashboard.gitPullMain', { base: ga.base || 'main' })}
              </button>
              {!ga.onBase && (
                <button
                  type="button"
                  className="phone__git-action"
                  disabled={!ga.canPullBranch || !!gitActing || gitRefreshing}
                  onClick={() => runGitAction('pullBranch', '/git/pull-current')}
                >
                  {gitActing === 'pullBranch'
                    ? t('dashboard.gitActing')
                    : t('dashboard.gitPullBranch')}
                </button>
              )}
            </div>
          )}
          {showGitActions && ga?.busy && (
            <div className="phone__git-hint">{t('git.actBusy')}</div>
          )}
          {gitActMsg && (
            <div
              className={`phone__git-msg phone__git-msg--${gitActMsg.ok ? 'ok' : 'err'}`}
              role="status"
            >
              {gitActMsg.text}
            </div>
          )}
        </div>
      )}
      <div className="phone__screen" style={contentZoom !== 1 ? { zoom: contentZoom } : undefined}>
        {showFiles ? (
          <FilesBrowser repoId={tab.repoId} />
        ) : openApp ? (
          <ProductFrame url={`/api/localview/${tab.repoId}/app/${openApp.id}/`} port={openApp.port} />
        ) : (
          <Chat chat={chat} embedded stashTabId={tab.id} />
        )}
      </div>
    </div>
  );
}
