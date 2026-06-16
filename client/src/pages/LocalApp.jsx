import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiPost } from '../api/client';
import ProductFrame from '../components/app/ProductFrame';
import ExposeCheck from '../components/expose/ExposeCheck';
import { useChat } from '../context/ChatContext';
import { useRepo } from '../context/RepoContext';
import { useT } from '../i18n/LanguageContext';
import './localapp.css';

// The Local tab (plans/local-app-tab.md): iframes the current project's
// Product directly at <ui-hostname>:<localPort> — LAN-only, no /preview/
// machinery, nothing forwarded to the internet. The port lives on the repo
// entry (backend-synced); each project owns its own.
export default function LocalApp() {
  const { t } = useT();
  const navigate = useNavigate();
  const { prefillProjectChat } = useChat();
  const { current, repos, reloadRepos } = useRepo();
  const [editing, setEditing] = useState(false);
  const [portDraft, setPortDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [bust, setBust] = useState(0);
  const [checking, setChecking] = useState(false);

  const port = current?.localPort || null;
  // Embed the harness's OWN reverse proxy, not the port directly
  // (plans/local-app-proxy.md): same-origin so it works over the internet
  // behind the login, with no mixed-content/IPv6 trap. The trailing slash is
  // load-bearing — the product's relative asset/API URLs resolve under it. The
  // `?_=<n>` cache-bust token (plans/expose-freshness.md) is bumped by Refresh
  // and the Exposure check's Reload-embed action so a refresh truly forces a
  // fresh document fetch; relative `./assets/…` still resolve under the slash.
  const url = port && current
    ? `/api/localview/${current.id}/${bust ? `?_=${bust}` : ''}`
    : null;

  // Slice 3 (plans/serving-model-clarity.md): in the setup state (this repo has
  // no port yet), embed the Exposure Helper itself — served through the self
  // repo's localview path — and point it at THIS repo (?repo=) so every agent
  // gets the guided contract walkthrough for their OWN product before exposing
  // it. The helper checks the active repo, not the harness. If there is no self
  // repo to serve it from (or its localview path isn't the helper, e.g. an
  // operator port override), ProductFrame degrades to the empty state and we
  // keep the static how-to below.
  const selfRepo = repos.find((r) => r.isSelf);
  const helperUrl = selfRepo && current ? `/api/localview/${selfRepo.id}/?repo=${current.id}` : null;

  // Force the embed to re-fetch the current build (not the browser's cached
  // copy): bump the cache-bust token AND remount the iframe.
  function reloadEmbed() {
    setBust(Date.now());
    setReloadKey((k) => k + 1);
  }

  // Leave edit mode / close the check when switching projects.
  useEffect(() => {
    setEditing(false);
    setError('');
    setChecking(false);
  }, [current?.id]);

  // One-click "Fix with an agent" from the embedded Exposure Helper
  // (exposer/, plans/serving-model-clarity.md, slice 2). The helper runs inside
  // the same-origin /api/localview proxy iframe and posts its fix prompt up;
  // we drop it into the project chat and switch to the agent — the same path
  // ExposeCheck.jsx uses. Same-origin guard: ignore messages from any other
  // origin, and only act on our own message shape.
  useEffect(() => {
    function onMessage(e) {
      if (e.origin !== window.location.origin) return;
      const data = e.data;
      if (!data || data.type !== 'claudeweb:expose-fix' || typeof data.prompt !== 'string') return;
      if (!data.prompt) return;
      prefillProjectChat(data.prompt);
      navigate('/studio');
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [prefillProjectChat, navigate]);

  async function savePort(e) {
    e.preventDefault();
    const value = parseInt(portDraft, 10);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      setError(t('localapp.portInvalid'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiPost(`/repos/${current.id}/localport`, { port: value });
      await reloadRepos();
      setEditing(false);
    } catch {
      setError(t('localapp.saveError'));
    } finally {
      setSaving(false);
    }
  }

  if (!current) {
    return <div className="localapp"><p className="localapp__none">{t('localapp.noProject')}</p></div>;
  }

  const showForm = editing || !port;

  return (
    <div className="localapp">
      <div className="localapp__bar">
        <span className="localapp__name" title={current.path}>{current.name}</span>
        {port && !showForm && (
          <>
            <a className="localapp__url" href={url} target="_blank" rel="noreferrer" title={url}>
              :{port}
            </a>
            <button type="button" className="localapp__btn" onClick={() => { setPortDraft(String(port)); setEditing(true); }}>
              {t('localapp.changePort')}
            </button>
            <button type="button" className="localapp__btn" onClick={reloadEmbed}>
              {t('apptab.refresh')}
            </button>
            <button
              type="button"
              className={`localapp__btn${checking ? ' localapp__btn--on' : ''}`}
              onClick={() => setChecking((c) => !c)}
            >
              {t('expose.verify')}
            </button>
          </>
        )}
        <span className="localapp__hint">{t('localapp.servedHint')}</span>
      </div>

      {checking && port && !showForm && <ExposeCheck onReloadEmbed={reloadEmbed} />}

      {showForm ? (
        <div className="localapp__setup">
          <form className="localapp__form" onSubmit={savePort}>
            <h2 className="localapp__form-title">{t('localapp.formTitle')}</h2>
            <p className="localapp__form-body">{t('localapp.formBody', { name: current.name })}</p>
            <div className="localapp__form-row">
              <input
                className="localapp__port-input"
                type="number"
                min="1"
                max="65535"
                placeholder={t('localapp.portPlaceholder')}
                value={portDraft}
                onChange={(e) => setPortDraft(e.target.value)}
              />
              <button type="submit" className="localapp__btn localapp__btn--primary" disabled={saving || !portDraft.trim()}>
                {saving ? t('localapp.saving') : t('localapp.save')}
              </button>
              {port && (
                <button type="button" className="localapp__btn" onClick={() => setEditing(false)}>
                  {t('localapp.cancel')}
                </button>
              )}
            </div>
            {error && <p className="localapp__error" role="alert">{error}</p>}
          </form>

          {/* The guided onboarding: embed the Exposure Helper pointed at THIS
              repo so the agent walks the embed contract (and one-click fixes it)
              before exposing — the served product doubling as the live reference.
              Falls back to the static how-to when the helper can't be served. */}
          {helperUrl ? (
            <section className="localapp__helper">
              <h3 className="localapp__how-title">{t('localapp.helperTitle')}</h3>
              <p className="localapp__how-intro">{t('localapp.helperIntro', { name: current.name })}</p>
              <div className="localapp__helper-frame">
                <ProductFrame url={helperUrl} />
              </div>
            </section>
          ) : (
            /* How to make an arbitrary web app embeddable here: point an agent in
               this (Claude Web) repo at the app and have it reconfigure it — the
               same one-port/relative-URL setup the proxy needs. */
            <section className="localapp__how">
              <h3 className="localapp__how-title">{t('localapp.howTitle')}</h3>
              <p className="localapp__how-intro">{t('localapp.howIntro')}</p>
              <ol className="localapp__how-steps">
                <li>{t('localapp.howStep1')}</li>
                <li>{t('localapp.howStep2')}</li>
                <li>{t('localapp.howStep3')}</li>
              </ol>
              <p className="localapp__how-note">{t('localapp.howNote')}</p>
            </section>
          )}
        </div>
      ) : (
        <div className="localapp__body">
          <ProductFrame url={url} port={port} reloadKey={reloadKey} />
        </div>
      )}
    </div>
  );
}
