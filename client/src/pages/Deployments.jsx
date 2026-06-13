import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost } from '../api/client';
import ErrorBanner from '../components/shared/ErrorBanner';
import { useT } from '../i18n/LanguageContext';
import './deployments.css';

// Deployments tab, slice 1 (plans/deployments-tab.md): what's live, the
// armed-rollback countdown with Keep-it / Roll-back-now, and deploy history.
// Read-mostly; the only writes are disarm and (typed-confirm) rollback.
function fmt(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function countdown(secs) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Deployments() {
  const { t } = useT();
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [secsLeft, setSecsLeft] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiGet('/deploy/status');
      setStatus(data);
      setSecsLeft(data?.rollback?.secondsLeft ?? 0);
      setError('');
    } catch {
      setError(t('deploy.loadError'));
    }
  }, [t]);

  // Poll while open + on visibility so a deploy from elsewhere shows up.
  useEffect(() => {
    load();
    const id = setInterval(load, 5000);
    const onVis = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load]);

  // Local 1s tick for a smooth countdown between polls.
  const armed = status?.rollback?.armed;
  const tickRef = useRef(null);
  useEffect(() => {
    if (!armed) return undefined;
    tickRef.current = setInterval(() => setSecsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(tickRef.current);
  }, [armed]);

  async function keep() {
    setBusy('keep');
    try {
      await apiPost('/deploy/keep');
      await load();
    } catch {
      setError(t('deploy.keepError'));
    } finally {
      setBusy('');
    }
  }

  async function rollback() {
    setBusy('rollback');
    try {
      await apiPost('/deploy/rollback', { confirm: confirmText });
      setConfirming(false);
      setConfirmText('');
      await load();
    } catch {
      setError(t('deploy.rollbackError'));
    } finally {
      setBusy('');
    }
  }

  const live = status?.live;

  return (
    <div className="deploys">
      {error && <ErrorBanner message={error} />}

      {/* Live now */}
      <section className="deploy-card">
        <h2 className="deploy-card__title">{t('deploy.liveTitle')}</h2>
        {live ? (
          <>
            <div className="deploy-live__commit">
              <code>{live.commit}</code> {live.subject}
            </div>
            <div className="deploy-live__meta">
              <span>{t('deploy.deployedAt', { at: fmt(live.at) })}</span>
              <span className={`deploy-badge ${live.containsOriginMain ? 'is-ok' : 'is-warn'}`}>
                {live.containsOriginMain ? t('deploy.containsMain') : t('deploy.missingMain')}
              </span>
              {live.rolledBackSince && <span className="deploy-badge is-warn">{t('deploy.rolledBack')}</span>}
              {!live.healthOk && <span className="deploy-badge is-warn">{t('deploy.unhealthy')}</span>}
            </div>
          </>
        ) : (
          <p className="deploys__muted">{t('deploy.noLedger')}</p>
        )}
      </section>

      {/* Armed rollback */}
      <section className={`deploy-card ${armed ? 'deploy-card--armed' : ''}`}>
        <h2 className="deploy-card__title">{t('deploy.rollbackTitle')}</h2>
        {armed ? (
          <>
            <p className="deploy-armed__line">
              {t('deploy.firesIn')} <strong className="deploy-armed__clock">{countdown(secsLeft)}</strong>
            </p>
            <div className="deploy-armed__actions">
              <button type="button" className="deploy-btn deploy-btn--primary" onClick={keep} disabled={busy === 'keep'}>
                {busy === 'keep' ? t('deploy.keeping') : t('deploy.keepIt')}
              </button>
              {!confirming ? (
                <button type="button" className="deploy-btn deploy-btn--danger" onClick={() => setConfirming(true)}>
                  {t('deploy.rollbackNow')}
                </button>
              ) : (
                <span className="deploy-confirm">
                  <input
                    className="deploy-confirm__input"
                    placeholder={t('deploy.confirmPlaceholder')}
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    autoFocus
                  />
                  <button
                    type="button"
                    className="deploy-btn deploy-btn--danger"
                    onClick={rollback}
                    disabled={confirmText !== 'ROLLBACK' || busy === 'rollback'}
                  >
                    {busy === 'rollback' ? t('deploy.rollingBack') : t('deploy.confirmRollback')}
                  </button>
                  <button type="button" className="deploy-btn" onClick={() => { setConfirming(false); setConfirmText(''); }}>
                    {t('common.cancel')}
                  </button>
                </span>
              )}
            </div>
          </>
        ) : (
          <p className="deploys__muted">{t('deploy.notArmed')}</p>
        )}
      </section>

      {/* History */}
      <section className="deploy-card">
        <h2 className="deploy-card__title">{t('deploy.historyTitle')}</h2>
        {status?.history?.length ? (
          <ul className="deploy-history">
            {status.history.map((h, i) => (
              <li key={i} className={`deploy-history__row ${h.event === 'rollback' ? 'is-rollback' : ''}`}>
                <span className="deploy-history__icon" aria-hidden="true">{h.event === 'rollback' ? '↩' : '▲'}</span>
                <span className="deploy-history__main">
                  {h.event === 'rollback' ? (
                    t('deploy.rolledBackEntry')
                  ) : (
                    <>
                      <code>{h.commit}</code> {h.subject}
                    </>
                  )}
                </span>
                {h.event === 'deploy' && (
                  <span className={`deploy-dot ${h.healthOk ? 'is-ok' : 'is-warn'}`} title={h.healthOk ? 'healthy' : 'unhealthy'} />
                )}
                <span className="deploy-history__time">{fmt(h.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="deploys__muted">{t('deploy.noHistory')}</p>
        )}
      </section>
    </div>
  );
}
