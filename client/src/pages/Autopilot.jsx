import { useCallback, useEffect, useState } from 'react';
import { apiGet } from '../api/client';
import ErrorBanner from '../components/shared/ErrorBanner';
import { useT } from '../i18n/LanguageContext';
import './autopilot.css';

// Loop-autopilot, Slice 1 (plans/loop-autopilot.md): DISCOVER the routine prompts
// the user keeps re-typing, mined from the transcripts already on disk. Read-only
// — this is the "determine the ~7" step before any classify/auto-advance. The
// later brain turns this confirmed set into the autopilot's label space.
export default function Autopilot() {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState({}); // which rows have their contexts expanded

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet('/autopilot/discover');
      setData(res);
      setError('');
    } catch {
      setError(t('autopilot.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const routines = data?.routines ?? [];

  return (
    <div className="autopilot">
      <header className="autopilot__head">
        <div>
          <h2 className="autopilot__title">{t('autopilot.title')}</h2>
          <p className="autopilot__sub">{t('autopilot.subtitle')}</p>
        </div>
        <button className="autopilot__rescan" onClick={load} disabled={loading}>
          {loading ? t('autopilot.scanning') : t('autopilot.rescan')}
        </button>
      </header>

      {error && <ErrorBanner message={error} />}

      {data && (
        <p className="autopilot__summary">
          {t('autopilot.summary', {
            routines: routines.length,
            sessions: data.sessionsScanned,
            messages: data.userMessagesScanned,
          })}
        </p>
      )}

      {!loading && routines.length === 0 && !error && (
        <p className="autopilot__empty">{t('autopilot.empty')}</p>
      )}

      <ol className="autopilot__list">
        {routines.map((r, i) => (
          <li key={i} className="routine">
            <div className="routine__rank">{i + 1}</div>
            <div className="routine__body">
              <div className="routine__line">
                <span className="routine__text">{r.text}</span>
                <span className="routine__count" title={t('autopilot.countTitle')}>×{r.count}</span>
                {r.matchesCustomPrompt && (
                  <span className="routine__tag" title={t('autopilot.customTitle')}>★ {t('autopilot.custom')}</span>
                )}
              </div>
              <div className="routine__meta">
                {t('autopilot.meta', { sessions: r.sessions, repos: r.repos })}
                {r.sampleContexts?.length > 0 && (
                  <button
                    className="routine__toggle"
                    onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}
                  >
                    {open[i] ? t('autopilot.hideContexts') : t('autopilot.showContexts')}
                  </button>
                )}
              </div>
              {open[i] && r.sampleContexts?.length > 0 && (
                <ul className="routine__contexts">
                  {r.sampleContexts.map((c, j) => (
                    <li key={j} className="routine__context">
                      <span className="routine__context-label">{t('autopilot.after')}</span> {c}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
