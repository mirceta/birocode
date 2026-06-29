import { useState, useEffect, useRef, useCallback } from 'react';
import Chat from '../../pages/Chat';
import { apiGet, apiPost } from '../../api/client';
import { useChatFor } from '../../context/ChatContext';
import { useRepo } from '../../context/RepoContext';
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

  // Event Console lane (openspec agent-dock-event-console): a sibling screen that
  // shows the per-repo log of harness-owned background operations (discovery / run
  // / check). Like Files, picking it swaps phone__screen to <EventConsole>; picking
  // a lane / app swaps back. Gated on the eventConsole feature (Advanced default).
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

  // "Discover local apps" (openspec discover-local-apps + discover-local-apps-resilient):
  // a read-only agent scan of THIS dock's repo for self-serving local-app exposures,
  // returning a typed { name, port } list. Discovery is now BACKEND-OWNED: the scan
  // is a per-repo server job, so a refresh mid-scan no longer cancels it or loses the
  // result. We drive the UI from server state instead of fire-and-forget local state —
  // on mount/repo-change we GET .../discover/status to reattach (spinner if running,
  // result/error if it finished while we were away), and the Discover button hits the
  // start-or-join endpoint then polls status at the dock cadence until terminal.
  // Single repo per click (the dock's), scoped by X-Repo-Id. Advanced-mode only.
  const canDiscover = useFeature('localAppDiscovery');
  const [discovery, setDiscovery] = useState(null); // { status, apps?, error? } | null
  const discovering = discovery?.status === 'running';
  const pollRef = useRef(null);

  // Register a discovered app as a real local app, closing the loop with the Local
  // tab's name+port form (POST /repos/{id}/localapps). A discovered row whose port
  // already matches a registered app shows "✓ Registered" instead of a button — that
  // state is derived from the localApps prop, so a freshly-registered row flips on
  // its own once reloadRepos refreshes the dock's app list (and switcher above).
  const { reloadRepos } = useRepo();
  const [registering, setRegistering] = useState(null); // port currently being registered
  const [registerErr, setRegisterErr] = useState(null); // { port, text } | null
  const registeredPorts = new Set((localApps || []).map((a) => a.port));

  // Run / Check (openspec discover-local-apps-run-controls): start a discovered app
  // and confirm it came up. "running" is computed LIVE by the backend per fetch (port
  // liveness), so Check is simply "re-fetch status". Run posts the app's port — the
  // server launches the command the SCAN extracted (never a client-supplied string) —
  // then we re-check after a short grace so the row's running dot reflects reality.
  const [running, setRunning] = useState(null); // port currently being launched
  const [runErr, setRunErr] = useState(null); // { port, text } | null
  const [checking, setChecking] = useState(false);

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

  const registerApp = async (app) => {
    setRegistering(app.port);
    setRegisterErr(null);
    try {
      // The endpoint resolves the repo by URL id, not X-Repo-Id — same call the
      // Local tab's add-app form makes.
      await apiPost(`/repos/${tab.repoId}/localapps`, { name: app.name, port: app.port });
      await reloadRepos(); // refreshes repos → this dock's localApps prop → row flips to registered
    } catch (err) {
      let text = err.message;
      try {
        text = JSON.parse(err.message).error || text;
      } catch { /* raw text */ }
      setRegisterErr({ port: app.port, text });
    } finally {
      setRegistering(null);
    }
  };

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

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  // Read the server's current job state for this dock's repo. Stops polling once
  // the job is no longer running (done/error/idle), so a finished scan settles.
  // `probe` marks an explicit user "Check running" (or the post-Run auto-check) so
  // the backend emits a check event to the Event Console; the background poll omits
  // it so the log isn't flooded (openspec agent-dock-event-console).
  const fetchDiscoverStatus = useCallback(async (probe = false) => {
    try {
      const path = probe
        ? '/local-apps/discover/status?probe=true'
        : '/local-apps/discover/status';
      const r = await apiGet(path, { repoId: tab.repoId });
      setDiscovery(r);
      if (r.status !== 'running') stopPoll();
      return r;
    } catch {
      stopPoll();
      return null;
    }
  }, [tab.repoId]);

  const startPoll = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(fetchDiscoverStatus, 5000); // dock cadence
  };

  // Reattach on mount / repo-change: observe a running scan (show spinner + poll)
  // or pick up a result/error that landed while this dock was away — without
  // starting a new scan. Idle (no recent job) just renders the bare button.
  useEffect(() => {
    if (!canDiscover) return undefined;
    let alive = true;
    setDiscovery(null);
    (async () => {
      const r = await fetchDiscoverStatus();
      if (alive && r?.status === 'running') startPoll();
    })();
    return () => {
      alive = false;
      stopPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDiscover, tab.repoId, fetchDiscoverStatus]);

  const discover = async () => {
    setRegisterErr(null);
    try {
      // Start-or-join: X-Repo-Id = this dock's repo, so the server scans only that
      // repo. Returns the current job state immediately; we drive off server state
      // and poll until terminal, so a refresh mid-scan re-derives it.
      const r = await apiGet('/local-apps/discover', { repoId: tab.repoId });
      setDiscovery(r);
      if (r.status === 'running') startPoll();
    } catch (err) {
      let text = err.message;
      try {
        text = JSON.parse(err.message).error || text;
      } catch { /* raw text */ }
      setDiscovery({ status: 'error', error: text });
    }
  };

  // Re-fetch the discovery status, which recomputes each app's live `running` flag
  // (the backend reads port liveness per fetch). Reuses the reattach path — does NOT
  // start a new scan. Defined after fetchDiscoverStatus so the dep is in scope.
  const checkRunning = useCallback(async () => {
    setChecking(true);
    try {
      await fetchDiscoverStatus(true); // probe → emits a check event to the console
    } finally {
      setChecking(false);
    }
  }, [fetchDiscoverStatus]);

  // Start a discovered app, then re-check its running state after a short grace so
  // the row's dot flips on once the server is listening. The server resolves the
  // command from its own scan result by port — we only send the port.
  const runApp = async (app) => {
    setRunning(app.port);
    setRunErr(null);
    try {
      await apiPost('/local-apps/run', { port: app.port }, { repoId: tab.repoId });
      setTimeout(() => { checkRunning(); }, 1500);
    } catch (err) {
      let text = err.message;
      try {
        text = JSON.parse(err.message).error || text;
      } catch { /* raw text */ }
      setRunErr({ port: app.port, text });
    } finally {
      setRunning(null);
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
      {/* Discover local apps (openspec discover-local-apps): one read-only agent
          scan of THIS dock's repo → typed { name, port } list. Chat-context
          furniture like the git block; hidden while Files / a local app is open. */}
      {canDiscover && !showFiles && !openApp && !showConsole && (
        <div className="phone__discover">
          <button
            type="button"
            className="phone__discover-btn"
            onClick={discover}
            disabled={discovering}
            title={t('dashboard.discoverHint')}
          >
            {discovering ? t('dashboard.discovering') : `🛰️ ${t('dashboard.discoverLocalApps')}`}
          </button>
          {discovery?.error && (
            <div className="phone__discover-msg phone__discover-msg--err" role="status">
              {t('dashboard.discoverError', { error: discovery.error })}
            </div>
          )}
          {discovery?.apps && (discovery.apps.length === 0 ? (
            <div className="phone__discover-msg" role="status">{t('dashboard.discoverNone')}</div>
          ) : (
            <>
              <ul className="phone__discover-list">
                {discovery.apps.map((a, i) => {
                  const isRegistered = registeredPorts.has(a.port);
                  const busy = registering === a.port;
                  const isRunning = !!a.running;
                  const launching = running === a.port;
                  return (
                    <li key={i} title={a.evidence || a.folder || ''}>
                      <span
                        className={`phone__discover-dot${isRunning ? ' phone__discover-dot--on' : ''}`}
                        title={isRunning ? t('dashboard.discoverRunning') : t('dashboard.discoverNotRunning')}
                        aria-label={isRunning ? t('dashboard.discoverRunning') : t('dashboard.discoverNotRunning')}
                      />
                      <span className="phone__discover-name">{a.name}</span>
                      <span className="phone__discover-port">:{a.port}</span>
                      <span className="phone__discover-actions">
                        {!isRunning && (
                          <button
                            type="button"
                            className="phone__discover-run"
                            onClick={() => runApp(a)}
                            disabled={launching || !a.startCommand}
                            title={a.startCommand
                              ? t('dashboard.discoverRunHint', { command: a.startCommand })
                              : t('dashboard.discoverNoCommand')}
                          >
                            {launching ? t('dashboard.discoverRunning') : `▶ ${t('dashboard.discoverRun')}`}
                          </button>
                        )}
                        {isRegistered ? (
                          <span className="phone__discover-reg" title={t('dashboard.discoverRegistered')}>
                            ✓ {t('dashboard.discoverRegistered')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            className="phone__discover-add"
                            onClick={() => registerApp(a)}
                            disabled={busy}
                          >
                            {busy ? t('dashboard.discoverRegistering') : t('dashboard.discoverRegister')}
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <button
                type="button"
                className="phone__discover-check"
                onClick={checkRunning}
                disabled={checking}
              >
                {checking ? t('dashboard.discoverChecking') : `🔄 ${t('dashboard.discoverCheck')}`}
              </button>
              {runErr && (
                <div className="phone__discover-msg phone__discover-msg--err" role="status">
                  {t('dashboard.discoverRunError', { error: runErr.text })}
                </div>
              )}
            </>
          ))}
          {registerErr && (
            <div className="phone__discover-msg phone__discover-msg--err" role="status">
              {t('dashboard.discoverRegisterError', { error: registerErr.text })}
            </div>
          )}
        </div>
      )}
      {/* Ask for understanding (openspec add-ask-for-understanding): the second
          agentic button — fork the conversation → build the Understanding app.
          Sibling of Discover; reuses the .phone__discover furniture styling. Hidden
          while Files / a local app / the Console is open; disabled until the builder
          lane has a conversation. */}
      {canUnderstand && !showFiles && !openApp && !showConsole && (
        <div className="phone__discover phone__understanding">
          <button
            type="button"
            className="phone__discover-btn"
            onClick={askUnderstanding}
            disabled={understandingBusy || !tab.sessionId}
            title={tab.sessionId ? t('dashboard.understandingHint') : t('dashboard.understandingDisabled')}
          >
            {understandingBusy ? t('dashboard.understandingAsking') : `🧠 ${t('dashboard.understanding')}`}
          </button>
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
              <DockIdentityRows commitIdentity={git.commitIdentity} repoId={tab.repoId} />
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
          <ProductFrame url={`/api/localview/${tab.repoId}/app/${openApp.id}/`} port={openApp.port} />
        ) : (
          <Chat
            chat={chat}
            embedded
            stashTabId={tab.id}
            chatMaximized={maximized}
            toggleChatMaximized={toggleChatMaximized}
          />
        )}
      </div>
    </div>
  );
}
