import { useEffect, useState } from 'react';
import { apiPost } from '../api/client';
import ProductFrame from '../components/app/ProductFrame';
import ExposeCheck from '../components/expose/ExposeCheck';
import { useRepo } from '../context/RepoContext';
import { useT } from '../i18n/LanguageContext';
import './localapp.css';

// The Local tab (plans/local-app-tab.md): iframes the current project's
// Product directly at <ui-hostname>:<localPort> — LAN-only, no /preview/
// machinery, nothing forwarded to the internet. The port lives on the repo
// entry (backend-synced); each project owns its own.
export default function LocalApp() {
  const { t } = useT();
  const { current, reloadRepos } = useRepo();
  const [editing, setEditing] = useState(false);
  const [portDraft, setPortDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [checking, setChecking] = useState(false);

  const port = current?.localPort || null;
  // Embed the harness's OWN reverse proxy, not the port directly
  // (plans/local-app-proxy.md): same-origin so it works over the internet
  // behind the login, with no mixed-content/IPv6 trap. The trailing slash is
  // load-bearing — the product's relative asset/API URLs resolve under it.
  const url = port && current ? `/api/localview/${current.id}/` : null;

  // Leave edit mode / close the check when switching projects.
  useEffect(() => {
    setEditing(false);
    setError('');
    setChecking(false);
  }, [current?.id]);

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
            <button type="button" className="localapp__btn" onClick={() => setReloadKey((k) => k + 1)}>
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

      {checking && port && !showForm && <ExposeCheck />}

      {showForm ? (
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
      ) : (
        <div className="localapp__body">
          <ProductFrame url={url} port={port} reloadKey={reloadKey} />
        </div>
      )}
    </div>
  );
}
