import { useEffect, useState } from 'react';
import { apiPost, apiDelete } from '../api/client';
import ProductFrame from '../components/app/ProductFrame';
import ExposeCheck from '../components/expose/ExposeCheck';
import { useRepo } from '../context/RepoContext';
import { useUiMode } from '../context/UiModeContext';
import { useT } from '../i18n/LanguageContext';
import './localapp.css';

// The Local tab (plans/local-app-tab.md + plans/multiple-local-apps.md): a
// project can expose SEVERAL local apps, each on its own port. A switcher picks
// which to embed; the harness proxies the chosen one at
// /api/localview/{repoId}/app/{appId}/ (same-origin, behind the login).
export default function LocalApp() {
  const { t } = useT();
  const { current, reloadRepos } = useRepo();
  // The Local tab is view-only for Basic (End User) clients — they see the
  // running product, never its authoring/operator plumbing. The capability map
  // promotes `localAppTab` itself to Basic, so the authoring gate keys off the
  // mode directly. (enable-local-tab-in-basic)
  const { isAdvanced: canAuthor } = useUiMode();
  const [selectedId, setSelectedId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [portDraft, setPortDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [bust, setBust] = useState(0);
  const [checking, setChecking] = useState(false);

  const apps = current?.localApps || [];
  // The harness-provided Understanding app is always present; "real" apps are the
  // repo's own products. Onboarding/empty-state keys off the real ones.
  const repoApps = apps.filter((a) => a.kind === 'repo');
  const selected = apps.find((a) => a.id === selectedId) || apps[0] || null;

  // Keep a valid selection as the project / its app list changes; auto-open the
  // add form when the repo has no real app yet (the Understanding app stays
  // viewable behind it via Cancel). The auto-open is an authoring affordance, so
  // it is suppressed in Basic — an End User never sees the add form.
  useEffect(() => {
    setSelectedId(apps[0]?.id || null);
    setAdding(canAuthor && repoApps.length === 0);
    setError('');
    setChecking(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, apps.length, canAuthor]);

  // Embed the harness's OWN reverse proxy, not the port directly
  // (plans/local-app-proxy.md): same-origin so it works over the internet behind
  // the login. The trailing slash is load-bearing — the product's relative asset
  // URLs resolve under it. `?_=<n>` (plans/expose-freshness.md) forces a fresh
  // document fetch on Refresh / Reload-embed.
  const url = selected && current
    ? `/api/localview/${current.id}/app/${selected.id}/${bust ? `?_=${bust}` : ''}`
    : null;

  function reloadEmbed() {
    setBust(Date.now());
    setReloadKey((k) => k + 1);
  }

  async function addApp(e) {
    e.preventDefault();
    const value = parseInt(portDraft, 10);
    if (!Number.isInteger(value) || value < 1 || value > 65535) {
      setError(t('localapp.portInvalid'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiPost(`/repos/${current.id}/localapps`, { name: nameDraft.trim() || null, port: value });
      await reloadRepos();
      setNameDraft('');
      setPortDraft('');
      setAdding(false);
    } catch {
      setError(t('localapp.saveError'));
    } finally {
      setSaving(false);
    }
  }

  async function removeApp(appId) {
    try {
      await apiDelete(`/repos/${current.id}/localapps/${appId}`);
      await reloadRepos();
    } catch {
      setError(t('localapp.saveError'));
    }
  }

  if (!current) {
    return <div className="localapp"><p className="localapp__none">{t('localapp.noProject')}</p></div>;
  }

  // The setup surface shows only while adding (auto-opened when no real app yet);
  // the Understanding app means there's always something to fall back to. Gated
  // to Advanced as a belt-and-suspenders: in Basic nothing can flip `adding`.
  const showForm = adding && canAuthor;
  // Basic, no real app: the always-on Understanding app renders as the fallback;
  // a slim note tells the End User why no product is showing.
  const showBasicEmpty = !canAuthor && repoApps.length === 0;

  return (
    <div className="localapp">
      <div className="localapp__bar">
        <span className="localapp__name" title={current.path}>{current.name}</span>

        {/* App switcher — one chip per app, the active one highlighted. */}
        {apps.length > 0 && (
          <div className="localapp__apps" role="tablist">
            {apps.map((a) => (
              <span key={a.id} className={`localapp__app${a.id === selected?.id ? ' localapp__app--on' : ''}`}>
                <button
                  type="button"
                  className="localapp__app-pick"
                  onClick={() => { setSelectedId(a.id); setChecking(false); }}
                  title={`:${a.port}${a.kind === 'harness' ? ' · harness' : ''}`}
                >
                  {a.name}{a.kind === 'repo' && <span className="localapp__app-port"> :{a.port}</span>}
                </button>
                {canAuthor && a.kind === 'repo' && (
                  <button
                    type="button"
                    className="localapp__app-x"
                    onClick={() => removeApp(a.id)}
                    title={t('localapp.removeApp')}
                    aria-label={t('localapp.removeApp')}
                  >×</button>
                )}
              </span>
            ))}
            {canAuthor && !adding && (
              <button type="button" className="localapp__btn localapp__btn--add" onClick={() => { setAdding(true); setError(''); }}>
                {t('localapp.addApp')}
              </button>
            )}
          </div>
        )}

        {selected && !showForm && (
          <>
            <a className="localapp__url" href={url} target="_blank" rel="noreferrer" title={url}>↗</a>
            <button type="button" className="localapp__btn" onClick={reloadEmbed}>
              {t('apptab.refresh')}
            </button>
            {/* The Exposure check is about exposing a real product, not the
                harness-provided Understanding app. Authoring-only → Advanced. */}
            {canAuthor && selected.kind === 'repo' && (
              <button
                type="button"
                className={`localapp__btn${checking ? ' localapp__btn--on' : ''}`}
                onClick={() => setChecking((c) => !c)}
              >
                {t('expose.verify')}
              </button>
            )}
          </>
        )}
        <span className="localapp__hint">{t('localapp.servedHint')}</span>
      </div>

      {canAuthor && checking && selected?.kind === 'repo' && !showForm && <ExposeCheck onReloadEmbed={reloadEmbed} app={selected} />}

      {showForm ? (
        <div className="localapp__setup">
          <form className="localapp__form" onSubmit={addApp}>
            <h2 className="localapp__form-title">{repoApps.length === 0 ? t('localapp.formTitle') : t('localapp.addTitle')}</h2>
            <p className="localapp__form-body">{t('localapp.formBody', { name: current.name })}</p>
            <div className="localapp__form-row">
              <input
                className="localapp__name-input"
                type="text"
                placeholder={t('localapp.appNamePlaceholder')}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
              />
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
                {saving ? t('localapp.saving') : (repoApps.length === 0 ? t('localapp.save') : t('localapp.add'))}
              </button>
              <button type="button" className="localapp__btn" onClick={() => { setAdding(false); setError(''); }}>
                {t('localapp.cancel')}
              </button>
            </div>
            {error && <p className="localapp__error" role="alert">{error}</p>}
          </form>

          {/* How to make an arbitrary web app embeddable here. */}
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
        </div>
      ) : (
        <>
          {showBasicEmpty && <p className="localapp__empty">{t('localapp.basicEmpty')}</p>}
          <div className="localapp__body">
            <ProductFrame url={url} port={selected?.port} reloadKey={reloadKey} />
          </div>
        </>
      )}
    </div>
  );
}
