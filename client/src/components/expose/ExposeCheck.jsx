import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../../api/client';
import { useChat } from '../../context/ChatContext';
import { useT } from '../../i18n/LanguageContext';
import './expose.css';

// The Exposure check panel (plans/product-onboarding.md, slice 1): runs the
// stack-agnostic checklist against the selected project's local product and
// shows each rule pass/fail with the exact fix. Read-only — it only probes.
export default function ExposeCheck() {
  const { t } = useT();
  const navigate = useNavigate();
  const { prefillProjectChat } = useChat();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const run = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await apiGet('/expose/check'));
    } catch {
      setError(t('expose.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    run();
  }, [run]);

  const checks = data?.checks || [];
  const okCount = checks.filter((c) => c.ok).length;
  const allOk = checks.length > 0 && okCount === checks.length;
  const fixPrompt = data?.fixPrompt || '';

  function fixWithAgent() {
    if (!fixPrompt) return;
    prefillProjectChat(fixPrompt);
    navigate('/studio');
  }

  return (
    <div className="expose">
      <div className="expose__head">
        <span className={`expose__summary ${loading ? '' : allOk ? 'is-ok' : 'is-warn'}`}>
          {loading
            ? t('expose.running')
            : allOk
              ? t('expose.allGood')
              : t('expose.someFail', { ok: okCount, total: checks.length })}
        </span>
        {!loading && !allOk && fixPrompt && (
          <button type="button" className="expose__btn expose__btn--fix" onClick={fixWithAgent}>
            {t('expose.fixWithAgent')}
          </button>
        )}
        <button type="button" className="expose__btn" onClick={run} disabled={loading}>
          {t('expose.rerun')}
        </button>
      </div>

      {error && <p className="expose__error" role="alert">{error}</p>}

      <ul className="expose__list">
        {checks.map((c) => (
          <li key={c.key} className={`expose__row ${c.ok ? 'is-ok' : 'is-fail'}`}>
            <span className="expose__icon" aria-hidden="true">{c.ok ? '✓' : '✗'}</span>
            <span className="expose__main">
              <span className="expose__label">{c.label}</span>
              {c.detail && <span className="expose__detail">{c.detail}</span>}
              {!c.ok && c.fix && <span className="expose__fix">→ {c.fix}</span>}
            </span>
          </li>
        ))}
      </ul>

      <p className="expose__guide">{t('expose.guideNote')}</p>
    </div>
  );
}
