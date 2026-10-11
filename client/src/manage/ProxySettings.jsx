import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '../api/client';
import { useT } from '../i18n/LanguageContext';

// Settings → Network proxy (openspec fleet-proxy): THIS computer's place in a proxy setup.
//   none   — not part of one
//   proxy  — "this computer is a proxy computer": it is on two networks and lets the listed
//            computers on its home side open business addresses through it, one way
//   client — "this computer proxies through a proxy computer": business addresses go through
//            it, for this harness and (optionally) this computer's browser
// Saved on this harness (PUT /api/proxy) and shown to the arch on the Fleet topology tab.

const list = (s) => String(s || '').split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
const join = (a) => (a || []).join(', ');

export default function ProxySettings() {
  const { t } = useT();
  const [status, setStatus] = useState(null);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const fromSettings = (s) => ({ role: s.role, homeSubnet: s.homeSubnet || '', allowClients: join(s.allowClients), targets: join(s.targets), via: s.via || '', setBrowserProxy: s.setBrowserProxy !== false });
  const load = () => apiGet('/proxy').then((st) => { setStatus(st); setDraft((d) => d || fromSettings(st.settings)); }).catch((e) => setError(String(e?.message || e)));
  useEffect(() => { load(); const id = setInterval(() => apiGet('/proxy').then(setStatus).catch(() => {}), 10000); return () => clearInterval(id); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!note) return undefined; const id = setTimeout(() => setNote(''), 6000); return () => clearTimeout(id); }, [note]);

  if (!status || !draft) return <section className="ms__sec" data-settings-proxy><h3 className="mg__status-h">🌐 {t('proxy.title')}</h3>{error ? <div className="ms__err">{error}</div> : <span className="ms__dim">…</span>}</section>;

  const saved = fromSettings(status.settings);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  const set = (patch) => setDraft({ ...draft, ...patch });
  const subnets = [...new Set((status.addresses || []).map((a) => a.subnet).filter(Boolean))];
  const homeAddr = (status.addresses || []).find((a) => a.subnet === draft.homeSubnet);
  const port = status.port;

  const save = async () => {
    setSaving(true); setError('');
    try {
      const st = await apiPut('/proxy', { role: draft.role, homeSubnet: draft.homeSubnet, allowClients: list(draft.allowClients), targets: list(draft.targets), via: draft.via || null, setBrowserProxy: draft.setBrowserProxy });
      setStatus(st); setDraft(fromSettings(st.settings)); setNote(t('proxy.saved'));
    } catch (e) { setError(String(e?.message || e)); }
    setSaving(false);
  };

  const role = (key, title, hint) => (
    <label className={`ms__mode${draft.role === key ? ' ms__mode--on' : ''}`} data-proxy-role={key}>
      <input type="radio" name="proxy-role" checked={draft.role === key} onChange={() => set({ role: key })} />
      <span className="ms__mode-t">{title}</span>
      <span className="ms__dim">{hint}</span>
    </label>
  );

  return (
    <section className="ms__sec ms__proxy" aria-label={t('proxy.title')} data-settings-proxy>
      <h3 className="mg__status-h">🌐 {t('proxy.title')}</h3>
      <p className="ms__lead">{t('proxy.lead')}</p>
      <div className="ms__row" data-proxy-addresses>
        <span className="ms__label">{t('proxy.addresses')}</span>
        {(status.addresses || []).map((a) => <code key={a.ip} className="ms__code">{a.ip} <span className="ms__dim">{a.adapter} · {a.subnet}</span></code>)}
      </div>

      <div className="ms__modes" role="radiogroup" aria-label={t('proxy.title')}>
        {role('none', t('proxy.roleNone'), t('proxy.roleNoneHint'))}
        {role('proxy', t('proxy.roleProxy'), t('proxy.roleProxyHint'))}
        {role('client', t('proxy.roleClient'), t('proxy.roleClientHint'))}
      </div>

      {draft.role === 'proxy' && (
        <div className="ms__screens" data-proxy-fields="proxy">
          <label className="ms__field">
            <span className="ms__label">{t('proxy.homeSide')}</span>
            <select value={subnets.includes(draft.homeSubnet) ? draft.homeSubnet : ''} onChange={(e) => set({ homeSubnet: e.target.value })} data-proxy-home>
              <option value="" disabled>{t('proxy.pickNetwork')}</option>
              {subnets.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="ms__dim">{t('proxy.homeSideHint')}</span>
          </label>
          <label className="ms__field">
            <span className="ms__label">{t('proxy.allowClients')}</span>
            <input value={draft.allowClients} onChange={(e) => set({ allowClients: e.target.value })} placeholder="192.168.1.105" data-proxy-clients />
            <span className="ms__dim">{t('proxy.allowClientsHint')}</span>
          </label>
          <label className="ms__field">
            <span className="ms__label">{t('proxy.targets')}</span>
            <input value={draft.targets} onChange={(e) => set({ targets: e.target.value })} placeholder="192.168.0.0/24" data-proxy-targets />
            <span className="ms__dim">{t('proxy.targetsHint')}</span>
          </label>
          <div className="ms__note" data-proxy-sentence>
            {t('proxy.sentenceProxy', { clients: join(list(draft.allowClients)) || '—', home: draft.homeSubnet || '—', targets: join(list(draft.targets)) || '—', at: homeAddr ? `${homeAddr.ip}:${port}` : '—' })}
          </div>
          {!dirty && status.proxy && (
            <div className="ms__row" data-proxy-state>
              {status.proxy.ready
                ? <span className="ms__ok">✓ {t('proxy.listening', { at: status.proxy.listening.join(', ') })}</span>
                : <span className="ms__err">{t('proxy.notListening', { home: draft.homeSubnet })}</span>}
              {status.proxy.pacUrl && <span className="ms__dim">{t('proxy.pacFor')} <code className="ms__code">{status.proxy.pacUrl}</code></span>}
            </div>
          )}
          {!dirty && status.proxy?.recent?.length > 0 && (
            <details className="ms__limits" data-proxy-recent>
              <summary>{t('proxy.recent', { n: status.proxy.recent.length })}</summary>
              <ul>{status.proxy.recent.map((r, i) => <li key={i}><code className="ms__code">{r}</code></li>)}</ul>
            </details>
          )}
        </div>
      )}

      {draft.role === 'client' && (
        <div className="ms__screens" data-proxy-fields="client">
          <label className="ms__field">
            <span className="ms__label">{t('proxy.via')}</span>
            <input value={draft.via} onChange={(e) => set({ via: e.target.value })} placeholder="192.168.1.101:5099" data-proxy-via />
            <span className="ms__dim">{t('proxy.viaHint')}</span>
          </label>
          <label className="ms__field">
            <span className="ms__label">{t('proxy.targets')}</span>
            <input value={draft.targets} onChange={(e) => set({ targets: e.target.value })} placeholder="192.168.0.0/24" data-proxy-targets />
            <span className="ms__dim">{t('proxy.targetsClientHint')}</span>
          </label>
          <label className="ms__check">
            <input type="checkbox" checked={draft.setBrowserProxy} onChange={(e) => set({ setBrowserProxy: e.target.checked })} data-proxy-browser />
            <span>{t('proxy.browser')}</span>
            <span className="ms__dim">{t('proxy.browserHint', { pac: `http://127.0.0.1:${port}/proxy.pac` })}</span>
          </label>
          <div className="ms__note" data-proxy-sentence>
            {t('proxy.sentenceClient', { targets: join(list(draft.targets)) || '—', via: draft.via || '—' })}
          </div>
          {!dirty && status.client && (
            <div className="ms__row" data-proxy-state>
              {status.client.reachable ? <span className="ms__ok">✓ {status.client.detail}</span> : <span className="ms__err">✗ {status.client.detail}</span>}
              <span className="ms__dim">{t(`proxy.browserState.${status.client.browser}`, { current: status.client.browserCurrent || '' })}</span>
            </div>
          )}
        </div>
      )}

      <div className="ms__row">
        <button type="button" className="ms__btn ms__btn--primary" disabled={!dirty || saving} onClick={save} data-proxy-save>{saving ? '…' : t('proxy.save')}</button>
        {dirty && <button type="button" className="ms__btn" onClick={() => setDraft(saved)} data-proxy-reset>{t('proxy.reset')}</button>}
        {error && <span className="ms__err" role="alert" data-proxy-error>{error}</span>}
        {note && <span className="ms__ok" role="status">{note}</span>}
      </div>
    </section>
  );
}
