import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, apiPost, apiPostText, apiDelete } from '../../api/client';
import { useRepo } from '../../context/RepoContext';

// Shared Discover-Local-Apps state for one dock's repo (openspec
// discover-apps-panel, D1). Extracted mechanically from PinnedAgent.jsx so the
// dock's two buttons (Discover spinner, panel opener) and the DiscoverAppsPanel
// overlay render from ONE state — one poll, one snapshot — instead of each
// duplicating the fetch/poll machinery.
//
// Discovery is BACKEND-OWNED (openspec discover-local-apps-resilient): the scan is
// a per-repo server job, so a refresh mid-scan never cancels it. On mount /
// repo-change we GET .../discover/status to reattach (spinner if running,
// result/error if it finished while we were away); Discover hits the start-or-join
// endpoint then polls status at the dock cadence (5s) until terminal.
export default function useLocalAppDiscovery({ repoId, enabled }) {
  const [discovery, setDiscovery] = useState(null); // { status, apps?, error?, cachedAt?, fromCache? } | null
  const discovering = discovery?.status === 'running';
  const pollRef = useRef(null);

  // Register a discovered app as a real local app, closing the loop with the Local
  // tab's name+port form (POST /repos/{id}/localapps). Registered-ness itself is
  // derived by the CALLER from its localApps prop, so a freshly-registered row
  // flips on its own once reloadRepos refreshes the dock's app list.
  const { reloadRepos } = useRepo();
  const [registering, setRegistering] = useState(null); // port currently being registered
  const [registerErr, setRegisterErr] = useState(null); // { port, text } | null

  // Run / Check (openspec discover-local-apps-run-controls): start a discovered app
  // and confirm it came up. "running" is computed LIVE by the backend per fetch
  // (port liveness), so Check is simply "re-fetch status".
  const [running, setRunning] = useState(null); // port currently being launched
  const [runErr, setRunErr] = useState(null); // { port, text } | null
  const [checking, setChecking] = useState(false);

  // Per-row cache delete (openspec discover-apps-panel, D5).
  const [deleting, setDeleting] = useState(null); // port currently being deleted
  const [deleteErr, setDeleteErr] = useState(null); // { port, text } | null

  // Lifecycle actions (openspec local-app-lifecycle-controls): stop / restart /
  // rebuild by port, plus the build-command backfill. Commands are resolved
  // server-side from the cached findings — only the port travels.
  const [stopping, setStopping] = useState(null); // port currently being stopped
  const [stopErr, setStopErr] = useState(null); // { port, text } | null
  const [restarting, setRestarting] = useState(null); // port currently being restarted
  const [restartErr, setRestartErr] = useState(null); // { port, text } | null
  const [rebuilding, setRebuilding] = useState(null); // port whose rebuild POST is in flight
  const [rebuildErr, setRebuildErr] = useState(null); // { port, text } | null
  const [backfilling, setBackfilling] = useState(false); // backfill POST in flight
  const [backfillNote, setBackfillNote] = useState(null); // 'no-cache' | 'none-missing' | error text

  // Import of another agent's findings (openspec import-discovery-findings).
  const [importing, setImporting] = useState(false);
  const [importErr, setImportErr] = useState(null); // text | null

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
  const fetchStatus = useCallback(async (probe = false) => {
    try {
      const path = probe
        ? '/local-apps/discover/status?probe=true'
        : '/local-apps/discover/status';
      const r = await apiGet(path, { repoId });
      setDiscovery(r);
      if (r.status !== 'running') stopPoll();
      return r;
    } catch {
      stopPoll();
      return null;
    }
  }, [repoId]);

  const startPoll = useCallback(() => {
    if (pollRef.current) return;
    pollRef.current = setInterval(fetchStatus, 5000); // dock cadence
  }, [fetchStatus]);

  // Reattach on mount / repo-change: observe a running scan (spinner + poll) or
  // pick up a result/error that landed while this dock was away — without starting
  // a new scan. Idle (no recent job) just renders the bare buttons.
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    setDiscovery(null);
    (async () => {
      const r = await fetchStatus();
      if (alive && r?.status === 'running') startPoll();
    })();
    return () => {
      alive = false;
      stopPoll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, repoId, fetchStatus]);

  const parseErr = (err) => {
    let text = err.message;
    try {
      text = JSON.parse(err.message).error || text;
    } catch { /* raw text */ }
    return text;
  };

  const discover = async () => {
    setRegisterErr(null);
    try {
      // Start-or-join: X-Repo-Id = this dock's repo, so the server scans only that
      // repo. Returns the current job state immediately; we drive off server state
      // and poll until terminal, so a refresh mid-scan re-derives it.
      const r = await apiGet('/local-apps/discover', { repoId });
      setDiscovery(r);
      if (r.status === 'running') startPoll();
    } catch (err) {
      setDiscovery({ status: 'error', error: parseErr(err) });
    }
  };

  // Load the persisted discovery from disk WITHOUT running an agent (openspec
  // cache-discovered-local-apps). Same result shape as a live scan so register /
  // Run / Check rows render identically; a miss returns status:"no-cache" so the
  // panel can prompt to run Discover. No scan to poll — just show the snapshot.
  const loadCache = async () => {
    setRegisterErr(null);
    stopPoll();
    try {
      const r = await apiGet('/local-apps/cache', { repoId });
      setDiscovery(r);
    } catch (err) {
      setDiscovery({ status: 'error', error: parseErr(err) });
    }
  };

  // Re-fetch the discovery status, which recomputes each app's live `running` flag
  // (the backend reads port liveness per fetch). Does NOT start a new scan.
  const checkRunning = useCallback(async () => {
    setChecking(true);
    try {
      await fetchStatus(true); // probe → emits a check event to the console
    } finally {
      setChecking(false);
    }
  }, [fetchStatus]);

  // Passive re-read of the current snapshot (running dots, rebuild states) — the
  // panel drives this on its own cadence while it is open, so rebuild completion
  // and externally started/stopped apps show up without a user click. No probe:
  // never floods the event log.
  const refreshStatus = useCallback(async () => {
    if (discovery?.status === 'running' || !discovery?.apps) return;
    await fetchStatus(false);
  }, [discovery?.status, !!discovery?.apps, fetchStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stop a running cached app: the server resolves the port's live owner
  // (PID) and kills the process tree, guarded repo-scoped + never-the-harness.
  const stopApp = async (app) => {
    setStopping(app.port);
    setStopErr(null);
    try {
      await apiPost('/local-apps/stop', { port: app.port }, { repoId });
      setTimeout(() => { checkRunning(); }, 800);
    } catch (err) {
      setStopErr({ port: app.port, text: parseErr(err) });
    } finally {
      setStopping(null);
    }
  };

  // Restart = server-side stop → wait-for-port-free → detached launch. The call
  // is synchronous up to ~10s, then we re-check so the dot reflects the relaunch.
  const restartApp = async (app) => {
    setRestarting(app.port);
    setRestartErr(null);
    try {
      await apiPost('/local-apps/restart', { port: app.port }, { repoId });
      setTimeout(() => { checkRunning(); }, 1500);
    } catch (err) {
      setRestartErr({ port: app.port, text: parseErr(err) });
    } finally {
      setRestarting(null);
    }
  };

  // Rebuild = start-or-join a backend-owned build job; progress/outcome ride the
  // per-row `rebuild` state in the status snapshot, so we just nudge a refresh —
  // the panel's open-cadence poll carries the rest until the job lands.
  const rebuildApp = async (app) => {
    setRebuilding(app.port);
    setRebuildErr(null);
    try {
      await apiPost('/local-apps/rebuild', { port: app.port }, { repoId });
      setTimeout(() => { fetchStatus(false); }, 500);
    } catch (err) {
      setRebuildErr({ port: app.port, text: parseErr(err) });
    } finally {
      setRebuilding(null);
    }
  };

  // Build-command backfill (openspec local-app-lifecycle-controls, D6): targeted
  // agent ask for the cached findings missing a buildCommand. Nothing-to-do
  // outcomes come back synchronously (no agent call); a started job's state rides
  // `backfill` in the status snapshot.
  const backfillBuildCommands = async () => {
    setBackfilling(true);
    setBackfillNote(null);
    try {
      const r = await apiPost('/local-apps/backfill-build-commands', {}, { repoId });
      if (r.status === 'nothing-to-do') setBackfillNote(r.reason);
      else setTimeout(() => { fetchStatus(false); }, 500);
    } catch (err) {
      setBackfillNote(parseErr(err));
    } finally {
      setBackfilling(false);
    }
  };

  // Start a discovered app, then re-check its running state after a short grace so
  // the row's dot flips on once the server is listening. The server resolves the
  // command from its own scan result by port — we only send the port.
  const runApp = async (app) => {
    setRunning(app.port);
    setRunErr(null);
    try {
      await apiPost('/local-apps/run', { port: app.port }, { repoId });
      setTimeout(() => { checkRunning(); }, 1500);
    } catch (err) {
      setRunErr({ port: app.port, text: parseErr(err) });
    } finally {
      setRunning(null);
    }
  };

  const registerApp = async (app) => {
    setRegistering(app.port);
    setRegisterErr(null);
    try {
      // The endpoint resolves the repo by URL id, not X-Repo-Id — same call the
      // Local tab's add-app form makes.
      await apiPost(`/repos/${repoId}/localapps`, { name: app.name, port: app.port });
      await reloadRepos(); // refreshes repos → the dock's localApps prop → row flips to registered
    } catch (err) {
      setRegisterErr({ port: app.port, text: parseErr(err) });
    } finally {
      setRegistering(null);
    }
  };

  // Delete ONE cached finding (openspec discover-apps-panel): under the union
  // cache a rescan never drops a record, so this is the only removal path. The
  // endpoint edits the cache + in-memory job and returns the updated snapshot,
  // which we apply directly — no second fetch.
  const deleteCached = async (app) => {
    setDeleting(app.port);
    setDeleteErr(null);
    try {
      const r = await apiDelete(`/local-apps/cache/${app.port}`, { repoId });
      setDiscovery(r);
    } catch (err) {
      setDeleteErr({ port: app.port, text: parseErr(err) });
    } finally {
      setDeleting(null);
    }
  };

  // Import findings another agent produced (openspec import-discovery-findings):
  // POST the operator's pasted JSON AS-IS — the server is the one validator (bare
  // array or {apps:[...]}, all-or-nothing) — and apply the returned merged
  // snapshot, same pattern as deleteCached. Returns true on success so the panel
  // can close its import area.
  const importFindings = async (text) => {
    setImporting(true);
    setImportErr(null);
    try {
      const r = await apiPostText('/local-apps/cache/import', text, { repoId });
      setDiscovery(r);
      return true;
    } catch (err) {
      setImportErr(parseErr(err));
      return false;
    } finally {
      setImporting(false);
    }
  };

  return {
    discovery,
    discovering,
    discover,
    loadCache,
    refreshStatus,
    checkRunning,
    checking,
    runApp,
    running,
    runErr,
    stopApp,
    stopping,
    stopErr,
    restartApp,
    restarting,
    restartErr,
    rebuildApp,
    rebuilding,
    rebuildErr,
    backfillBuildCommands,
    backfilling,
    backfillNote,
    registerApp,
    registering,
    registerErr,
    deleteCached,
    deleting,
    deleteErr,
    importFindings,
    importing,
    importErr,
  };
}
