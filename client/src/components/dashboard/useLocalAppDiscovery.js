import { useState, useEffect, useRef, useCallback } from 'react';
import { apiGet, apiPost, apiDelete } from '../../api/client';
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

  return {
    discovery,
    discovering,
    discover,
    loadCache,
    checkRunning,
    checking,
    runApp,
    running,
    runErr,
    registerApp,
    registering,
    registerErr,
    deleteCached,
    deleting,
    deleteErr,
  };
}
