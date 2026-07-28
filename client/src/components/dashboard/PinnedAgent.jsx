import { useState, useEffect, useRef, useCallback } from 'react';
import Chat from '../../pages/Chat';
import { apiGet, apiPost } from '../../api/client';
import { useChatFor } from '../../context/ChatContext';
import { useT } from '../../i18n/LanguageContext';
import { useFeature } from '../../context/UiModeContext';
import GitStatusSummary from '../git/GitStatusSummary';
import DockIdentityRows from './DockIdentityRows';
import { deriveGitActions, pullMainPath } from '../git/gitActions';
import ProductFrame from '../app/ProductFrame';
import FilesBrowser from '../files/FilesBrowser';
import EventConsole from './EventConsole';
import CopyPath from './CopyPath';
import ImportantStar from './ImportantStar';
import WideToggle from './WideToggle';
import WaitingBadge from './WaitingBadge';
import WaitingOnField from './WaitingOnField';
import DependsOnPicker from './DependsOnPicker';
import useLocalAppDiscovery from './useLocalAppDiscovery';
import DiscoverAppsPanel from './DiscoverAppsPanel';

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
  onToggleWide,
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
  // default-app toggle. Clicking an app shows ProductFrame at
  // /api/localview/{repoId}/app/{appId}/ over the chat's bar and messages (the
  // composer stays below it — see altViewActive); clicking the active one
  // returns to the full chat. One app at a time, off by default so the wall stays
  // light (a frame only mounts once an app is picked). Gated like the Local tab.
  const canLocalApp = useFeature('localAppTab');
  const apps = canLocalApp ? (localApps || []) : [];
  const [openAppId, setOpenAppId] = useState(null);
  const openApp = apps.find((a) => a.id === openAppId) || null;

  // Files tab on the dock (plans/agent-dock-files-tab.md): a third screen the
  // phone can show — the SAME browse-and-view surface as the routed Files tab
  // (tree · viewer · pins · live poll · doc-links), scoped to THIS agent's repo.
  // It is a sibling of the Builder/Ask lanes and the local-app buttons: picking
  // it shows the FilesBrowser over the chat (composer stays below); picking a
  // lane or app swaps back. Gated on the filesDock feature (Advanced by default).
  const filesOn = useFeature('filesDock');
  const [showFiles, setShowFiles] = useState(false);

  // Event Console lane (openspec agent-dock-event-console): a sibling screen that
  // shows the per-repo log of harness-owned background operations (discovery / run
  // / check). Like Files, picking it shows <EventConsole> over the chat (composer
  // stays below); picking a lane / app swaps back. Gated on the eventConsole
  // feature (Advanced default).
  const consoleOn = useFeature('eventConsole');
  const [showConsole, setShowConsole] = useState(false);

  // Maximize chat to fill the dock (openspec add-maximize-chat-dock): an ephemeral,
  // per-dock toggle that collapses the non-chat chrome (bar, lanes, apps, git,
  // discover) so the embedded chat gets the dock's full height. State lives here
  // because this component owns the .phone__* chrome being hidden; the toggle is
  // passed down into <Chat> so its button can sit in the chat toolbar. Not
  // persisted — resets to normal on reload. Only meaningful while the chat lane is
  // showing (not Files / a local app), so we gate the modifier on that.
  const [chatMaximized, setChatMaximized] = useState(false);
  const toggleChatMaximized = () => setChatMaximized((v) => !v);
  const chatShowing = !showFiles && !openApp && !showConsole;
  const maximized = chatMaximized && chatShowing;
  // Any alternate view open? (openspec local-app-overlay-keep-composer) The view
  // no longer REPLACES the chat in phone__screen — it renders above one shared
  // <Chat embedded composerOnly>, so the composer stays usable and the chat
  // never remounts when opening/closing/switching views.
  const altViewActive = !chatShowing;

  // "Discover local apps" (openspec discover-apps-panel): the dock keeps exactly
  // TWO affordances — a Discover button (shows the scan's running state) and an
  // opener for the DiscoverAppsPanel overlay, which hosts everything else
  // (findings with register / Run / Check / delete, cache state, job state). All
  // discovery state lives in the shared useLocalAppDiscovery hook so the dock
  // button's spinner and the panel render from ONE server-driven state (backend-
  // owned scan, reattach on mount/repo-change, 5s poll — see the hook).
  // Advanced-mode only.
  const canDiscover = useFeature('localAppDiscovery');
  const disc = useLocalAppDiscovery({ repoId: tab.repoId, enabled: canDiscover });
  const [showDiscoverPanel, setShowDiscoverPanel] = useState(false);

  // "Ask for understanding" (openspec add-ask-for-understanding): the second, more
  // advanced agentic dock button. It FORKS this dock's builder conversation into
  // Claude Monitor (snapshot-resume) and has the forked agent build the repo's
  // Understanding app explaining the latest reply — so it never touches the live
  // chat. Like Discover, the run is backend-owned (survives a refresh): we POST
  // /understanding/ask, then poll /understanding/status until terminal, and reattach
  // to a running job on mount/repo-change. Disabled until the builder lane has a
  // conversation (a sessionId). Advanced-mode only; progress also shows in the
  // Console lane (op="understanding").
  const canUnderstand = useFeature('understandingAgent');
  const [understanding, setUnderstanding] = useState(null); // { status, error? } | null
  const understandingBusy = understanding?.status === 'running';
  const uPollRef = useRef(null);

  // Auto-understanding (openspec auto-understanding-after-turn): a per-repo,
  // SERVER-persisted flag — when on, the backend starts the same understanding
  // run by itself at the end of every completed builder turn (it fires with no
  // browser attached, which is the point). The dock only views/flips the flag;
  // same capability gate as the Ask button. Optimistic flip, reverted on error.
  const [autoUnderstanding, setAutoUnderstanding] = useState(false);

  // Inward-sync git actions in the dock's git row (plans/dock-git-actions.md):
  // the SAME merge / pull-main / pull-branch actions as the Git tab, scoped to
  // THIS dock's repo via repoId → X-Repo-Id, reusing the Git tab's act() flow
  // (disable while acting, refresh status when done). Push is intentionally
  // omitted — publishing stays a deliberate Git-tab action.
  const showGitActions = useFeature('dockGitActions');
  // Identity rows (openspec add-git-identity-surface): who this repo commits as +
  // which GitHub account it pushes as. Advanced-only.
  const showIdentityRows = useFeature('gitIdentityRows');
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

  // --- Ask for understanding: backend-owned run, same start/poll/reattach shape as
  // Discover but for the snapshot-resume build (openspec add-ask-for-understanding).
  const stopUPoll = () => {
    if (uPollRef.current) {
      clearInterval(uPollRef.current);
      uPollRef.current = null;
    }
  };

  const fetchUnderstandingStatus = useCallback(async () => {
    try {
      const r = await apiGet('/understanding/status', { repoId: tab.repoId });
      setUnderstanding(r);
      if (r.status !== 'running') stopUPoll();
      return r;
    } catch {
      stopUPoll();
      return null;
    }
  }, [tab.repoId]);

  const startUPoll = () => {
    if (uPollRef.current) return;
    uPollRef.current = setInterval(fetchUnderstandingStatus, 5000); // dock cadence
  };

  // Reattach on mount / repo-change: pick up a running build (spinner + poll) or a
  // result/error that landed while this dock was away — without starting a new run.
  useEffect(() => {
    if (!canUnderstand) return undefined;
    let alive = true;
    setUnderstanding(null);
    (async () => {
      const r = await fetchUnderstandingStatus();
      if (alive && r?.status === 'running') startUPoll();
    })();
    return () => {
      alive = false;
      stopUPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUnderstand, tab.repoId, fetchUnderstandingStatus]);

  // Load the persisted auto flag on mount / repo-change.
  useEffect(() => {
    if (!canUnderstand) return undefined;
    let alive = true;
    setAutoUnderstanding(false);
    (async () => {
      try {
        const r = await apiGet('/understanding/auto', { repoId: tab.repoId });
        if (alive) setAutoUnderstanding(!!r.enabled);
      } catch { /* leave off; the toggle just shows the default */ }
    })();
    return () => { alive = false; };
  }, [canUnderstand, tab.repoId]);

  const toggleAutoUnderstanding = async () => {
    const next = !autoUnderstanding;
    setAutoUnderstanding(next);
    try {
      await apiPost('/understanding/auto', { enabled: next }, { repoId: tab.repoId });
    } catch {
      setAutoUnderstanding(!next); // revert the optimistic flip
    }
  };

  // Poll nudge: when THIS dock watches its builder turn finish while auto is on,
  // the backend is starting (or has started) an auto-run — look for it shortly
  // after so the spinner/result appears without a manual refresh. Short grace
  // because the client can see the chat's "done" a beat before the server-side
  // trigger enqueues the job.
  const prevStatusRef = useRef(status);
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (!canUnderstand || !autoUnderstanding || isAsk) return undefined;
    if (prev !== 'running' || status !== 'done') return undefined;
    const timer = setTimeout(async () => {
      const r = await fetchUnderstandingStatus();
      if (r?.status === 'running') startUPoll();
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, canUnderstand, autoUnderstanding, isAsk, fetchUnderstandingStatus]);

  const askUnderstanding = async () => {
    try {
      // Start-or-join, scoped to this dock's repo (X-Repo-Id); body carries the
      // builder lane's sessionId. Drive off server state and poll until terminal.
      const r = await apiPost('/understanding/ask', { sessionId: tab.sessionId }, { repoId: tab.repoId });
      setUnderstanding(r);
      if (r.status === 'running') startUPoll();
    } catch (err) {
      let text = err.message;
      try {
        text = JSON.parse(err.message).error || text;
      } catch { /* raw text */ }
      setUnderstanding({ status: 'error', error: text });
    }
  };

  return (
    <div
      className={`phone phone--${status}${tab.important ? ' phone--important' : ''}${tab.waiting ? ' phone--waiting' : ''}${tab.stash?.length ? ' phone--queued' : ''}${maximized ? ' phone--chat-max' : ''}`}
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
        <WideToggle
          wide={!!tab.wide}
          onToggle={() => onToggleWide?.(tab.id)}
          className="phone__wide"
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
          aria-selected={!isAsk && !showFiles && !showConsole}
          className={`phone__lane${!isAsk && !showFiles && !showConsole ? ' phone__lane--on' : ''}`}
          onClick={() => {
            setShowFiles(false);
            setShowConsole(false);
            setLaneView('builder');
          }}
        >
          {t('chat.laneBuilder')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={isAsk && !showFiles && !showConsole}
          className={`phone__lane${isAsk && !showFiles && !showConsole ? ' phone__lane--on' : ''}`}
          title={t('chat.askHint')}
          onClick={() => {
            setShowFiles(false);
            setShowConsole(false);
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
              setShowConsole(false);
              setShowFiles(true);
            }}
          >
            {t('files.tab')}
          </button>
        )}
        {consoleOn && (
          <button
            type="button"
            role="tab"
            aria-selected={showConsole}
            className={`phone__lane${showConsole ? ' phone__lane--on' : ''}`}
            title={t('console.hint')}
            onClick={() => {
              setOpenAppId(null);
              setShowFiles(false);
              setShowConsole(true);
            }}
          >
            {t('console.tab')}
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
                setShowConsole(false);
                setOpenAppId((cur) => (cur === a.id ? null : a.id));
              }}
              title={`:${a.port}${a.kind === 'harness' ? ' · harness' : ''}`}
            >
              {a.name}{a.kind === 'repo' && <span className="phone__app-port"> :{a.port}</span>}
            </button>
          ))}
        </div>
      )}
      {/* Discover local apps (openspec discover-apps-panel): the dock's ONLY two
          affordances — run a scan, open the panel. Findings, cache state, and all
          per-row actions live in the DiscoverAppsPanel overlay below. Chat-context
          furniture like the git block; hidden while Files / a local app is open. */}
      {canDiscover && !showFiles && !openApp && !showConsole && (
        <div className="phone__discover">
          <div className="phone__discover-buttons">
            <button
              type="button"
              className="phone__discover-btn"
              onClick={disc.discover}
              disabled={disc.discovering}
              title={t('dashboard.discoverHint')}
            >
              {disc.discovering ? t('dashboard.discovering') : `🛰️ ${t('dashboard.discoverLocalApps')}`}
            </button>
            <button
              type="button"
              className="phone__discover-btn phone__discover-btn--panel"
              onClick={() => setShowDiscoverPanel(true)}
              title={t('dashboard.discoverPanelOpenHint')}
            >
              {`📋 ${t('dashboard.discoverPanelOpen')}`}
            </button>
          </div>
        </div>
      )}
      {/* Ask for understanding (openspec add-ask-for-understanding): the second
          agentic button — fork the conversation → build the Understanding app.
          Sibling of Discover; reuses the .phone__discover furniture styling. Hidden
          while Files / a local app / the Console is open; disabled until the builder
          lane has a conversation. */}
      {canUnderstand && !showFiles && !openApp && !showConsole && (
        <div className="phone__discover phone__understanding">
          <div className="phone__understanding-row">
            <button
              type="button"
              className="phone__discover-btn"
              onClick={askUnderstanding}
              disabled={understandingBusy || !tab.sessionId}
              title={tab.sessionId ? t('dashboard.understandingHint') : t('dashboard.understandingDisabled')}
            >
              {understandingBusy ? t('dashboard.understandingAsking') : `🧠 ${t('dashboard.understanding')}`}
            </button>
            {/* Auto-mode toggle (openspec auto-understanding-after-turn): views/flips
                the repo's SERVER-persisted flag — the backend re-runs understanding
                by itself after every completed builder turn, browser or not. */}
            <label
              className={`phone__understanding-auto${autoUnderstanding ? ' phone__understanding-auto--on' : ''}`}
              title={t('dashboard.understandingAutoHint')}
            >
              <input
                type="checkbox"
                checked={autoUnderstanding}
                onChange={toggleAutoUnderstanding}
              />
              {t('dashboard.understandingAuto')}
            </label>
          </div>
          {understanding?.status === 'done' && (
            <div className="phone__discover-msg" role="status">
              {t('dashboard.understandingDone')}
            </div>
          )}
          {understanding?.status === 'error' && (
            <div className="phone__discover-msg phone__discover-msg--err" role="status">
              {t('dashboard.understandingError', { error: understanding.error })}
            </div>
          )}
        </div>
      )}
      {/* The git block is chat-context furniture; hide it while the Files tab OR
          a local app is open so that surface gets the full dock height (not just
          the strip below git) — plans/agent-dock-files-tab.md (Files) and
          plans/dock-local-app-full-height.md (local app). */}
      {git && !showFiles && !openApp && !showConsole && (
        <div className="phone__git">
          <div className="phone__git-top">
            <GitStatusSummary status={git} compact />
            {showIdentityRows && (
              <DockIdentityRows
                commitIdentity={git.commitIdentity}
                repoId={tab.repoId}
                onSaved={onRefreshGit}
              />
            )}
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
        {showConsole ? (
          <EventConsole repoId={tab.repoId} />
        ) : showFiles ? (
          <FilesBrowser repoId={tab.repoId} />
        ) : openApp ? (
          // Hosted keep-alive frame (openspec local-app-state-preserve): keyed
          // per (dock, app), so closing the app view / switching dock views
          // only unregisters the slot — the live frame waits for the reopen.
          <ProductFrame
            url={`/api/localview/${tab.repoId}/app/${openApp.id}/`}
            port={openApp.port}
            zoomable
            frameKey={`dock:${tab.id}:${tab.repoId}:${openApp.id}`}
            frameMeta={{ kind: 'dock', dockId: tab.id, repoId: tab.repoId, appId: openApp.id }}
          />
        ) : null}
        <Chat
          chat={chat}
          embedded
          composerOnly={altViewActive}
          stashTabId={tab.id}
          chatMaximized={maximized}
          toggleChatMaximized={toggleChatMaximized}
        />
      </div>
      {/* Discover Local Apps panel (openspec discover-apps-panel): a dock-contained
          overlay (the .phone is position:relative), so the repo context stays
          implicit — no routing, no global modal. Renders from the SAME hook state
          as the Discover button above. */}
      {canDiscover && showDiscoverPanel && (
        <DiscoverAppsPanel
          disc={disc}
          localApps={localApps}
          onClose={() => setShowDiscoverPanel(false)}
        />
      )}
    </div>
  );
}
