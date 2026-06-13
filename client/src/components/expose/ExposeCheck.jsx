import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiGet } from '../../api/client';
import { useChat } from '../../context/ChatContext';
import { useRepo } from '../../context/RepoContext';
import { useT } from '../../i18n/LanguageContext';
import './expose.css';

// Pull the main bundle filename (e.g. assets/index-a1b2c3.js) out of an HTML
// string or a live document, so we can compare what the browser actually
// rendered against the server's current build (plans/expose-freshness.md).
const BUNDLE_RE = /assets\/[\w.-]+\.js/;

function bundleFromHtml(html) {
  const m = html.match(BUNDLE_RE);
  return m ? m[0] : null;
}

function bundleFromDoc(doc) {
  for (const s of doc.querySelectorAll('script[src]')) {
    const m = (s.getAttribute('src') || '').match(BUNDLE_RE);
    if (m) return m[0];
  }
  return null;
}

// The Exposure check panel (plans/product-onboarding.md, slice 1): runs the
// stack-agnostic checklist against the selected project's local product and
// shows each rule pass/fail with the exact fix. Slice 3 adds a client-side
// freshness check (plans/expose-freshness.md): the server checklist probes
// 127.0.0.1 and is blind to what THIS browser rendered, so a stale/blank
// cached embed reads as "all green". Read-only — it only probes.
export default function ExposeCheck({ onReloadEmbed }) {
  const { t } = useT();
  const navigate = useNavigate();
  const { prefillProjectChat } = useChat();
  const { current } = useRepo();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // { state: 'idle'|'checking'|'ok'|'stale'|'na', live, server, blank }
  const [fresh, setFresh] = useState({ state: 'idle' });

  // Client-side freshness: compare the live iframe's loaded bundle against the
  // server's current build, and notice an empty #root. The iframe is a
  // same-origin sibling (/api/localview/…), so its contentDocument is readable.
  const checkFreshness = useCallback(async () => {
    const id = current?.id;
    if (!id) {
      setFresh({ state: 'na' });
      return;
    }
    setFresh({ state: 'checking' });

    let server = null;
    try {
      const res = await fetch(`/api/localview/${id}/?_=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) server = bundleFromHtml(await res.text());
    } catch {
      // server unreachable here is already covered by the server checklist
    }

    let live = null;
    let blank = null;
    let readable = false;
    try {
      const doc = document.querySelector('iframe.product-frame')?.contentDocument;
      if (doc) {
        readable = true;
        live = bundleFromDoc(doc);
        const root = doc.getElementById('root');
        blank = root ? root.children.length === 0 : null;
      }
    } catch {
      readable = false; // cross-origin or not yet loaded — can't judge
    }

    // Can't read the live embed or the server build → nothing to compare.
    if (!server || !readable || live == null) {
      setFresh({ state: 'na' });
      return;
    }
    const stale = live !== server;
    if (!stale && blank !== true) {
      setFresh({ state: 'ok' });
    } else {
      setFresh({ state: 'stale', live, server, blank: blank === true });
    }
  }, [current?.id]);

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
    checkFreshness();
  }, [t, checkFreshness]);

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

      {/* Client-side freshness row — a browser-cache warning, NOT a contract
          failure, so it's styled distinctly from the ✗ rows above. */}
      {fresh.state === 'ok' && (
        <ul className="expose__list expose__list--client">
          <li className="expose__row is-ok">
            <span className="expose__icon" aria-hidden="true">✓</span>
            <span className="expose__main">
              <span className="expose__label">{t('expose.freshOk')}</span>
            </span>
          </li>
        </ul>
      )}
      {fresh.state === 'stale' && (
        <ul className="expose__list expose__list--client">
          <li className="expose__row is-stale">
            <span className="expose__icon" aria-hidden="true">⚠</span>
            <span className="expose__main">
              <span className="expose__label">{t('expose.freshStale')}</span>
              <span className="expose__detail">
                {fresh.blank
                  ? t('expose.freshBlankDetail', { server: fresh.server })
                  : t('expose.freshStaleDetail', { live: fresh.live, server: fresh.server })}
              </span>
              {onReloadEmbed && (
                <button
                  type="button"
                  className="expose__btn expose__btn--reload"
                  onClick={onReloadEmbed}
                >
                  {t('expose.reloadEmbed')}
                </button>
              )}
            </span>
          </li>
        </ul>
      )}

      <p className="expose__guide">{t('expose.guideNote')}</p>
    </div>
  );
}
