import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/LanguageContext';
import { copyText } from '../../lib/copyText';
import { apiGet } from '../../api/client';

// Local-app kinds shown in the panel's activity section (openspec
// local-app-lifecycle-controls, D8) — the same RepoEventLog feed the dock's
// Event Console reads, filtered to what this panel's actions emit.
const ACTIVITY_OPS = new Set(['run', 'stop', 'restart', 'rebuild', 'backfill', 'check', 'cache']);
const ACTIVITY_SHOWN = 30;

// Discover Local Apps panel (openspec discover-apps-panel): an overlay on one
// agent dock hosting everything about the feature that used to crowd the dock
// inline — the discovered/cached findings with per-row register / Run / Check /
// delete, the job state of an in-flight scan, and the cache state (latest scan +
// per-row last-discovered age, since under the union cache rows can come from
// different scans). The dock keeps only two buttons: Discover and this panel's
// opener. State lives in the shared useLocalAppDiscovery hook (passed in as
// `disc`), so a scan started from the dock button is visible here live — and one
// watched here keeps its spinner on the dock button. Opening/closing the panel is
// passive: no scan, no repo mutation, no registration.
export default function DiscoverAppsPanel({ disc, localApps, repoId, onClose }) {
  const { t } = useT();
  const {
    discovery,
    discovering,
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
  } = disc;

  const registeredPorts = new Set((localApps || []).map((a) => a.port));

  // Import area (openspec import-discovery-findings): paste-first, with a .json
  // file picker that only fills the same textarea (read client-side) — submitting
  // always sends the textarea's text, so what the operator sees is what the server
  // validates. Closed on success; the error text stays inside the area otherwise.
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const fileRef = useRef(null);

  const submitImport = async () => {
    if (await importFindings(importText)) {
      setImportOpen(false);
      setImportText('');
    }
  };

  // Export area (openspec local-apps-cache-export-import): the current findings
  // list as JSON in EXACTLY the shape ParseImport accepts, so a copy from this
  // machine pastes straight into another machine's Import. Explicit field
  // whitelist — must stay in sync with LocalAppFinding (name/port/folder/
  // evidence/startCommand/buildCommand); machine-local projections (running,
  // discoveredAt, rebuild) must never ride along.
  const [exportOpen, setExportOpen] = useState(false);
  const [exportCopied, setExportCopied] = useState(false);
  const [exportManual, setExportManual] = useState(false);
  const exportRef = useRef(null);

  const exportJson = JSON.stringify(
    {
      apps: (discovery?.apps || []).map(({ name, port, folder, evidence, startCommand, buildCommand }) => ({
        name,
        port,
        folder,
        evidence,
        ...(startCommand != null ? { startCommand } : {}),
        ...(buildCommand != null ? { buildCommand } : {}),
      })),
    },
    null,
    2,
  );

  // While the panel is open, passively re-read the snapshot at the dock cadence
  // (openspec local-app-lifecycle-controls): running dots stay live and rebuild /
  // backfill job states land without a click. The hook's refreshStatus no-ops
  // until a snapshot with apps exists (so the idle→auto-loadCache handshake
  // below is never raced) and never emits probe events.
  useEffect(() => {
    // Hidden tab = no polling (openspec reduce-connection-appetite).
    const id = setInterval(() => { if (!document.hidden) refreshStatus(); }, 5000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  // Activity section (openspec local-app-lifecycle-controls, D8): the repo event
  // log filtered to local-app kinds, newest first, fetched by sequence watermark
  // on the same open-panel cadence — so a clicked action's phases appear within
  // one tick, and history from before the panel opened (server-side log) shows
  // too. Rendered newest-first, capped for display.
  const [activity, setActivity] = useState([]);
  const activitySeq = useRef(0);
  useEffect(() => {
    if (!repoId) return undefined;
    let alive = true;
    activitySeq.current = 0;
    setActivity([]);
    const pull = async () => {
      try {
        const r = await apiGet(`/repos/${repoId}/events?after=${activitySeq.current}`, { repoId });
        if (!alive || !r?.events?.length) return;
        activitySeq.current = r.lastSeq ?? activitySeq.current;
        const fresh = r.events.filter((e) => ACTIVITY_OPS.has(e.op));
        if (fresh.length) {
          setActivity((prev) => [...fresh.reverse(), ...prev].slice(0, ACTIVITY_SHOWN));
        }
      } catch { /* feed is advisory — never break the panel */ }
    };
    pull();
    // Hidden tab = no polling (openspec reduce-connection-appetite).
    const id = setInterval(() => { if (!document.hidden) pull(); }, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [repoId]);

  // A clicked action should show up in the feed within a beat, not a full tick:
  // nudge the watermark fetch shortly after any lifecycle mutation returns.
  const prevBusy = useRef(false);
  const anyBusy = !!(running || stopping || restarting || rebuilding || backfilling || checking);
  useEffect(() => {
    const wasBusy = prevBusy.current;
    prevBusy.current = anyBusy;
    if (!wasBusy || anyBusy) return undefined;
    const timer = setTimeout(async () => {
      try {
        const r = await apiGet(`/repos/${repoId}/events?after=${activitySeq.current}`, { repoId });
        if (r?.events?.length) {
          activitySeq.current = r.lastSeq ?? activitySeq.current;
          const fresh = r.events.filter((e) => ACTIVITY_OPS.has(e.op));
          if (fresh.length) setActivity((prev) => [...fresh.reverse(), ...prev].slice(0, ACTIVITY_SHOWN));
        }
      } catch { /* advisory */ }
    }, 400);
    return () => clearTimeout(timer);
  }, [anyBusy, repoId]);

  // Per-row expandable rebuild output.
  const [outputPort, setOutputPort] = useState(null);

  const toggleExport = () => {
    setExportOpen((v) => !v);
    setImportOpen(false);
    setExportManual(false);
  };

  const toggleImport = () => {
    setImportOpen((v) => !v);
    setExportOpen(false);
  };

  const copyExport = async () => {
    if (await copyText(exportJson)) {
      setExportManual(false);
      setExportCopied(true);
      setTimeout(() => setExportCopied(false), 1200);
    } else {
      // No clipboard (plain-HTTP phone): hand the user the Ctrl+C path instead
      // of an error — the JSON is right there, pre-selected.
      exportRef.current?.focus();
      exportRef.current?.select();
      setExportManual(true);
    }
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    if (file) setImportText(await file.text());
    e.target.value = ''; // re-picking the same file must re-fire onChange
  };

  // Opening with no recent job (idle — e.g. after a harness restart) auto-loads
  // the cache: a passive disk read, so the panel shows the cached apps (or the
  // explicit no-cache guidance) instead of a dead state. Never fires over a
  // running scan or a landed result.
  const isIdle = discovery?.status === 'idle';
  useEffect(() => {
    if (isIdle) loadCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isIdle]);

  // Compact relative age for a row's last-discovered time; the full timestamp
  // rides on the tooltip.
  const ageLabel = (iso) => {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return t('dashboard.discoverAgeNow');
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 48) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  const latestScan = discovery?.cachedAt || discovery?.finishedAt;

  return (
    <div className="phone__discover-panel" role="dialog" aria-label={t('dashboard.discoverPanelTitle')}>
      <div className="phone__discover-panel-head">
        <span className="phone__discover-panel-title">{t('dashboard.discoverPanelTitle')}</span>
        <button
          type="button"
          className="phone__discover-panel-close"
          onClick={onClose}
          title={t('dashboard.discoverPanelClose')}
          aria-label={t('dashboard.discoverPanelClose')}
        >
          ×
        </button>
      </div>
      <div className="phone__discover-panel-body">
        <div className="phone__discover-buttons">
          {/* Load the saved list from disk without spending an agent scan; the
              dock's Discover button stays the way to re-run the agent. */}
          <button
            type="button"
            className="phone__discover-btn phone__discover-btn--cache"
            onClick={loadCache}
            disabled={discovering}
            title={t('dashboard.loadCacheHint')}
          >
            {`💾 ${t('dashboard.loadCache')}`}
          </button>
          <button
            type="button"
            className="phone__discover-btn"
            onClick={checkRunning}
            disabled={checking || discovering}
            title={t('dashboard.discoverCheck')}
          >
            {checking ? t('dashboard.discoverChecking') : `🔄 ${t('dashboard.discoverCheck')}`}
          </button>
          <button
            type="button"
            className="phone__discover-btn"
            onClick={toggleImport}
            title={t('dashboard.discoverImportHint')}
          >
            {`📥 ${t('dashboard.discoverImport')}`}
          </button>
          <button
            type="button"
            className="phone__discover-btn"
            onClick={toggleExport}
            disabled={!discovery?.apps?.length}
            title={t('dashboard.discoverExportHint')}
          >
            {`📤 ${t('dashboard.discoverExport')}`}
          </button>
          {/* Build-command backfill (openspec local-app-lifecycle-controls, D6):
              targeted agent ask for cached rows missing a buildCommand. Disabled
              with a hint when nothing is missing — the endpoint's nothing-to-do
              path never invokes the agent anyway. */}
          <button
            type="button"
            className="phone__discover-btn"
            onClick={backfillBuildCommands}
            disabled={backfilling || discovery?.backfill?.status === 'running' || !discovery?.apps?.length}
            title={t('dashboard.discoverBackfillHint')}
          >
            {backfilling || discovery?.backfill?.status === 'running'
              ? t('dashboard.discoverBackfilling')
              : `🔧 ${t('dashboard.discoverBackfill')}`}
          </button>
        </div>
        {backfillNote && (
          <div className="phone__discover-msg" role="status">
            {backfillNote === 'no-cache' ? t('dashboard.discoverBackfillNoCache')
              : backfillNote === 'none-missing' ? t('dashboard.discoverBackfillNoneMissing')
                : t('dashboard.discoverBackfillError', { error: backfillNote })}
          </div>
        )}
        {discovery?.backfill && !backfillNote && (
          <div
            className={`phone__discover-msg${discovery.backfill.status === 'error' ? ' phone__discover-msg--err' : ''}`}
            role="status"
          >
            {discovery.backfill.status === 'running' ? t('dashboard.discoverBackfillRunning')
              : discovery.backfill.status === 'error' ? t('dashboard.discoverBackfillError', { error: discovery.backfill.error })
                : t('dashboard.discoverBackfillDone', {
                  filled: discovery.backfill.filled ?? 0,
                  asked: discovery.backfill.asked,
                })}
          </div>
        )}
        {exportOpen && (
          <div className="phone__discover-import">
            <textarea
              ref={exportRef}
              className="phone__discover-import-text phone__discover-export-text"
              value={exportJson}
              readOnly
              rows={8}
              spellCheck={false}
              onFocus={(e) => e.target.select()}
              aria-label={t('dashboard.discoverExport')}
            />
            <div className="phone__discover-import-actions">
              <button
                type="button"
                className="phone__discover-btn phone__discover-btn--cache"
                onClick={copyExport}
              >
                {exportCopied ? `✓ ${t('dashboard.discoverExportCopied')}` : `📋 ${t('dashboard.discoverExportCopy')}`}
              </button>
              <button
                type="button"
                className="phone__discover-btn"
                onClick={() => { setExportOpen(false); setExportManual(false); }}
              >
                {t('dashboard.discoverExportClose')}
              </button>
            </div>
            {exportManual && (
              <div className="phone__discover-msg" role="status">
                {t('dashboard.discoverExportManual')}
              </div>
            )}
          </div>
        )}
        {importOpen && (
          <div className="phone__discover-import">
            <textarea
              className="phone__discover-import-text"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={t('dashboard.discoverImportPlaceholder')}
              rows={5}
              spellCheck={false}
            />
            <div className="phone__discover-import-actions">
              <button
                type="button"
                className="phone__discover-btn"
                onClick={() => fileRef.current?.click()}
                title={t('dashboard.discoverImportFileHint')}
              >
                {t('dashboard.discoverImportFile')}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                onChange={pickFile}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="phone__discover-btn phone__discover-btn--cache"
                onClick={submitImport}
                disabled={importing || !importText.trim()}
              >
                {importing ? t('dashboard.discoverImporting') : t('dashboard.discoverImportSubmit')}
              </button>
              <button
                type="button"
                className="phone__discover-btn"
                onClick={() => { setImportOpen(false); }}
              >
                {t('dashboard.discoverImportCancel')}
              </button>
            </div>
            {importErr && (
              <div className="phone__discover-msg phone__discover-msg--err" role="status">
                {t('dashboard.discoverImportError', { error: importErr })}
              </div>
            )}
          </div>
        )}
        {discovering && (
          <div className="phone__discover-msg" role="status">{t('dashboard.discovering')}</div>
        )}
        {discovery?.status === 'no-cache' && (
          <div className="phone__discover-msg" role="status">{t('dashboard.discoverNoCache')}</div>
        )}
        {latestScan && discovery?.apps && (
          <div className="phone__discover-msg phone__discover-msg--cache" role="status">
            {t('dashboard.discoverLatestScan', { when: new Date(latestScan).toLocaleString() })}
          </div>
        )}
        {discovery?.error && (
          <div className="phone__discover-msg phone__discover-msg--err" role="status">
            {t('dashboard.discoverError', { error: discovery.error })}
          </div>
        )}
        {discovery?.apps && (discovery.apps.length === 0 ? (
          <div className="phone__discover-msg" role="status">{t('dashboard.discoverNone')}</div>
        ) : (
          <ul className="phone__discover-list">
            {discovery.apps.map((a, i) => {
              const isRegistered = registeredPorts.has(a.port);
              const busy = registering === a.port;
              const isRunning = !!a.running;
              const launching = running === a.port;
              const removing = deleting === a.port;
              // Lifecycle affordances (openspec local-app-lifecycle-controls):
              // Stop needs `running`, Restart needs a start command, Rebuild
              // needs a build command — unavailable = disabled, never failing.
              const isStopping = stopping === a.port;
              const isRestarting = restarting === a.port;
              const rebuildBusy = rebuilding === a.port || a.rebuild?.status === 'running';
              return (
                <li key={i} title={a.evidence || a.folder || ''}>
                  <span
                    className={`phone__discover-dot${isRunning ? ' phone__discover-dot--on' : ''}`}
                    title={isRunning ? t('dashboard.discoverRunning') : t('dashboard.discoverNotRunning')}
                    aria-label={isRunning ? t('dashboard.discoverRunning') : t('dashboard.discoverNotRunning')}
                  />
                  <span className="phone__discover-name">{a.name}</span>
                  <span className="phone__discover-port">:{a.port}</span>
                  {a.discoveredAt && (
                    <span
                      className="phone__discover-age"
                      title={t('dashboard.discoverAgeHint', { when: new Date(a.discoveredAt).toLocaleString() })}
                    >
                      {ageLabel(a.discoveredAt)}
                    </span>
                  )}
                  {a.rebuild && (
                    <button
                      type="button"
                      className={`phone__discover-buildchip phone__discover-buildchip--${a.rebuild.status}`}
                      onClick={() => setOutputPort(outputPort === a.port ? null : a.port)}
                      title={t('dashboard.discoverRebuildOutputHint')}
                    >
                      {a.rebuild.status === 'running' ? `⏳ ${t('dashboard.discoverRebuildBuilding')}`
                        : a.rebuild.status === 'succeeded' ? `✓ ${t('dashboard.discoverRebuildOk')}`
                          : `✗ ${t('dashboard.discoverRebuildFailed', { code: a.rebuild.exitCode ?? '?' })}`}
                    </button>
                  )}
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
                    {isRunning && (
                      <button
                        type="button"
                        className="phone__discover-stop"
                        onClick={() => stopApp(a)}
                        disabled={isStopping}
                        title={t('dashboard.discoverStopHint')}
                      >
                        {isStopping ? t('dashboard.discoverStopping') : `⏹ ${t('dashboard.discoverStop')}`}
                      </button>
                    )}
                    <button
                      type="button"
                      className="phone__discover-restart"
                      onClick={() => restartApp(a)}
                      disabled={isRestarting || !a.startCommand}
                      title={a.startCommand
                        ? t('dashboard.discoverRestartHint', { command: a.startCommand })
                        : t('dashboard.discoverNoCommand')}
                    >
                      {isRestarting ? t('dashboard.discoverRestarting') : `🔁 ${t('dashboard.discoverRestart')}`}
                    </button>
                    <button
                      type="button"
                      className="phone__discover-rebuild"
                      onClick={() => rebuildApp(a)}
                      disabled={rebuildBusy || !a.buildCommand}
                      title={a.buildCommand
                        ? t('dashboard.discoverRebuildHint', { command: a.buildCommand })
                        : t('dashboard.discoverNoBuildCommand')}
                    >
                      {rebuildBusy ? t('dashboard.discoverRebuilding') : `🔨 ${t('dashboard.discoverRebuild')}`}
                    </button>
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
                    <button
                      type="button"
                      className="phone__discover-del"
                      onClick={() => deleteCached(a)}
                      disabled={removing}
                      title={t('dashboard.discoverDeleteHint')}
                      aria-label={t('dashboard.discoverDelete')}
                    >
                      🗑
                    </button>
                  </span>
                  {outputPort === a.port && a.rebuild && (
                    <pre className="phone__discover-buildout">
                      {a.rebuild.output || t('dashboard.discoverRebuildNoOutput')}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
        ))}
        {runErr && (
          <div className="phone__discover-msg phone__discover-msg--err" role="status">
            {t('dashboard.discoverRunError', { error: runErr.text })}
          </div>
        )}
        {stopErr && (
          <div className="phone__discover-msg phone__discover-msg--err" role="status">
            {t('dashboard.discoverStopError', { error: stopErr.text })}
          </div>
        )}
        {restartErr && (
          <div className="phone__discover-msg phone__discover-msg--err" role="status">
            {t('dashboard.discoverRestartError', { error: restartErr.text })}
          </div>
        )}
        {rebuildErr && (
          <div className="phone__discover-msg phone__discover-msg--err" role="status">
            {t('dashboard.discoverRebuildError', { error: rebuildErr.text })}
          </div>
        )}
        {registerErr && (
          <div className="phone__discover-msg phone__discover-msg--err" role="status">
            {t('dashboard.discoverRegisterError', { error: registerErr.text })}
          </div>
        )}
        {deleteErr && (
          <div className="phone__discover-msg phone__discover-msg--err" role="status">
            {t('dashboard.discoverDeleteError', { error: deleteErr.text })}
          </div>
        )}
        {/* Activity section (openspec local-app-lifecycle-controls, D8): the
            operator's "did my click actually do anything?" answer, in-panel —
            each action's phase events off the repo event log, newest first.
            Server-side log, so history from before this panel opened shows too. */}
        <div className="phone__discover-activity" data-testid="discover-activity">
          <div className="phone__discover-activity-title">{t('dashboard.discoverActivity')}</div>
          {activity.length === 0 ? (
            <div className="phone__discover-msg" role="status">{t('dashboard.discoverActivityEmpty')}</div>
          ) : (
            <ul className="phone__discover-activity-list">
              {activity.map((e) => (
                <li key={e.seq} className={`phone__discover-activity-item phone__discover-activity-item--${e.phase}`}>
                  <span className="phone__discover-activity-time">
                    {new Date(e.at).toLocaleTimeString()}
                  </span>
                  <span className="phone__discover-activity-phase" aria-label={e.phase}>
                    {e.phase === 'error' ? '✗' : e.phase === 'done' ? '✓' : '…'}
                  </span>
                  <span className="phone__discover-activity-label">{e.title}</span>
                  <span className="phone__discover-activity-detail">{e.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
