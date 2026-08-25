import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPut } from '../../api/client';
import { useT } from '../../i18n/LanguageContext';
import './toolsPanel.css';

// Tools lane panel (openspec add-dock-tools-lane): per-repo MCP tool
// configuration, Birokrat API first. Scoped to THIS dock's repo via the repoId
// prop (dock-scoped, not global-selection scoped — agent-dock delta spec).
//
// Masking contract (repo-mcp-tools spec): the backend never returns a stored
// key, only apiKeySet + a last-4 hint. The key inputs therefore start EMPTY and
// an empty input means "keep the stored key" (sent as null); the explicit ✕
// button clears (sent as ""). Same per-entry semantics in the company list.
export default function ToolsPanel({ repoId }) {
  const { t } = useT();
  const [view, setView] = useState(null); // last GET/PUT response
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Draft state, seeded from the loaded view.
  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState(''); // '' = keep stored
  const [clearKey, setClearKey] = useState(false);
  const [apiUrl, setApiUrl] = useState('');
  const [companies, setCompanies] = useState([]); // {name, apiKey:'', apiKeySet, apiKeyHint, url}
  const [serverEntry, setServerEntry] = useState('');

  const seed = useCallback((data) => {
    setView(data);
    setEnabled(!!data.birokrat.enabled);
    setApiKey('');
    setClearKey(false);
    setApiUrl(data.birokrat.apiUrl || '');
    setCompanies((data.birokrat.companies || []).map((c) => ({ ...c, apiKey: '' })));
    setServerEntry(data.host.birokratServerEntry || '');
  }, []);

  useEffect(() => {
    let alive = true;
    setView(null);
    setError(null);
    (async () => {
      try {
        const data = await apiGet(`/tools?repoId=${encodeURIComponent(repoId)}`, { repoId });
        if (alive) seed(data);
      } catch {
        if (alive) setError(t('tools.loadError'));
      }
    })();
    return () => {
      alive = false;
    };
  }, [repoId, seed, t]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      // Host path first so the response's server check reflects it.
      if (serverEntry !== (view?.host.birokratServerEntry || '')) {
        await apiPut(`/tools/host?repoId=${encodeURIComponent(repoId)}`, { birokratServerEntry: serverEntry }, { repoId });
      }
      const data = await apiPut(
        `/tools/birokrat?repoId=${encodeURIComponent(repoId)}`,
        {
          enabled,
          apiKey: clearKey ? '' : apiKey || null,
          apiUrl,
          companies: companies.map((c) => ({ name: c.name, apiKey: c.apiKey || null, url: c.url || null })),
        },
        { repoId }
      );
      seed(data);
      setSaved(true);
    } catch (e) {
      setError(t('tools.saveError', { error: e.message || String(e) }));
    } finally {
      setSaving(false);
    }
  };

  const setCompany = (i, patch) =>
    setCompanies((cur) => cur.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  if (!view && !error) return <div className="toolsp"><div className="toolsp__empty">{t('tools.loading')}</div></div>;
  if (!view) return <div className="toolsp"><div className="toolsp__err" role="alert">{error}</div></div>;

  const host = view.host;
  // The spec's enable-time error: enabled but the effective server script is
  // missing on disk — runs refuse the broken config, and we say so here.
  const serverBroken = enabled && !host.serverEntryExists;

  return (
    <div className="toolsp">
      <div className="toolsp__head">
        <h2>{t('tools.title')}</h2>
      </div>
      <p className="toolsp__intro">{t('tools.intro')}</p>

      <section className="toolsp__tool">
        <label className="toolsp__toolhead">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          <b>{t('tools.birokrat')}</b>
        </label>

        {serverBroken && (
          <div className="toolsp__err" role="alert">
            {t('tools.serverMissing', { path: host.effectiveServerEntry || t('tools.serverUnset') })}
          </div>
        )}
        {enabled && !host.nodeAvailable && (
          <div className="toolsp__err" role="alert">{t('tools.nodeMissing')}</div>
        )}

        <label className="toolsp__field">
          <span>{t('tools.apiKey')}</span>
          <span className="toolsp__keyrow">
            <input
              type="password"
              value={apiKey}
              disabled={clearKey}
              placeholder={
                clearKey
                  ? t('tools.apiKeyCleared')
                  : view.birokrat.apiKeySet
                    ? t('tools.apiKeyKept', { hint: view.birokrat.apiKeyHint })
                    : t('tools.apiKeyEmpty')
              }
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />
            {view.birokrat.apiKeySet && (
              <button
                type="button"
                className={`toolsp__clear${clearKey ? ' toolsp__clear--on' : ''}`}
                title={t('tools.apiKeyClear')}
                aria-pressed={clearKey}
                onClick={() => setClearKey((v) => !v)}
              >
                ✕
              </button>
            )}
          </span>
        </label>

        <label className="toolsp__field">
          <span>{t('tools.apiUrl')}</span>
          <input type="text" value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} spellCheck={false} />
        </label>

        <div className="toolsp__companies">
          <div className="toolsp__companies-head">{t('tools.companies')}</div>
          {companies.map((c, i) => (
            <div className="toolsp__company" key={i}>
              <input
                type="text"
                className="toolsp__company-name"
                value={c.name}
                placeholder={t('tools.companyName')}
                onChange={(e) => setCompany(i, { name: e.target.value })}
                spellCheck={false}
              />
              <input
                type="password"
                className="toolsp__company-key"
                value={c.apiKey}
                placeholder={c.apiKeySet ? t('tools.apiKeyKept', { hint: c.apiKeyHint }) : t('tools.companyKey')}
                onChange={(e) => setCompany(i, { apiKey: e.target.value })}
                autoComplete="off"
              />
              <input
                type="text"
                className="toolsp__company-url"
                value={c.url || ''}
                placeholder={t('tools.companyUrl')}
                onChange={(e) => setCompany(i, { url: e.target.value })}
                spellCheck={false}
              />
              <button
                type="button"
                className="toolsp__clear"
                title={t('tools.companyRemove')}
                onClick={() => setCompanies((cur) => cur.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="toolsp__add"
            onClick={() => setCompanies((cur) => [...cur, { name: '', apiKey: '', url: '' }])}
          >
            {t('tools.companyAdd')}
          </button>
        </div>

        <label className="toolsp__field">
          <span>{t('tools.serverPath')}</span>
          <input
            type="text"
            value={serverEntry}
            placeholder={host.effectiveServerEntry || t('tools.serverPathHint')}
            onChange={(e) => setServerEntry(e.target.value)}
            spellCheck={false}
          />
        </label>
        {!serverBroken && host.serverEntryExists && (
          <div className="toolsp__ok">{t('tools.serverOk')}</div>
        )}
      </section>

      <div className="toolsp__actions">
        <button type="button" className="toolsp__save" onClick={save} disabled={saving}>
          {saving ? t('tools.saving') : t('tools.save')}
        </button>
        {saved && <span className="toolsp__ok" role="status">{t('tools.saved')}</span>}
        {error && <span className="toolsp__err" role="alert">{error}</span>}
      </div>
    </div>
  );
}
