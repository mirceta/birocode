import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { useFeature } from '../../context/UiModeContext';
import { useT } from '../../i18n/LanguageContext';
import './flagsFooter.css';

const POLL_MS = 15000;

// Agent-flags footer (docs/loop-driven-agent-convention.md, "Non-blocking
// flags"): every FLAG: line a driven agent left in a reply, pinned at the very
// bottom of the studio shell until the human dismisses it — the "so we don't
// forget" surface. Renders nothing while the ledger is empty, so Basic users
// and flag-free sessions pay no chrome. Fixed-positioned like the bottom nav:
// aboveNav shifts it up one nav-height so the two never overlap.
export default function FlagsFooter({ aboveNav = false }) {
  const enabled = useFeature('flagsFooter');
  const { t } = useT();
  const [flags, setFlags] = useState([]);

  const refresh = useCallback(() => {
    if (document.hidden) return;
    apiGet('/flags')
      .then((r) => setFlags(r.flags || []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [enabled, refresh]);

  const dismiss = (id) => {
    apiPost(`/flags/${id}/dismiss`, {})
      .then((r) => setFlags(r.flags || []))
      .catch(() => refresh());
  };

  if (!enabled || flags.length === 0) return null;

  return (
    <footer
      className={`flags-footer${aboveNav ? ' flags-footer--above-nav' : ''}`}
      aria-label={t('flags.title')}
    >
      <span className="flags-footer__badge" title={t('flags.title')}>
        ⚑ {flags.length}
      </span>
      <div className="flags-footer__list">
        {flags.map((f) => (
          <span key={f.id} className="flags-footer__item">
            <span className="flags-footer__repo">{f.repoName}</span>
            <span className="flags-footer__text" title={f.text}>{f.text}</span>
            <button
              type="button"
              className="flags-footer__dismiss"
              onClick={() => dismiss(f.id)}
              aria-label={t('flags.dismiss')}
              title={t('flags.dismiss')}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    </footer>
  );
}
