import { useEffect } from 'react';
import { useT } from '../../i18n/LanguageContext';

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
export default function DiscoverAppsPanel({ disc, localApps, onClose }) {
  const { t } = useT();
  const {
    discovery,
    discovering,
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
  } = disc;

  const registeredPorts = new Set((localApps || []).map((a) => a.port));

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
        </div>
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
      </div>
    </div>
  );
}
