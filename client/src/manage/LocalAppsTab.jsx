import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiPut } from '../api/client';
import { useT } from '../i18n/LanguageContext';
import { showToast } from '../components/shared/toast';
import { flatRows, harnessCount, flagged, tone, summary, filterRows, canAutostart, flagBody, ago } from './localAppsModel';
import './localApps.css';

// The Management dashboard's Local apps tab (fleet task f88f97fe, openspec local-apps-autostart-sentry): every
// registered local app of every machine, the Operator's Autostart flag per app (with an optional health URL, start
// command, order and delay), and the sentry's live state. The hub stores the flags (single writer) and pushes each
// machine its slice; each machine starts its flagged apps at boot and checks them every N minutes.

const keyOf = (r) => `${r.machine}/${r.repoId}/${r.appId}`;

function StateBadge({ row, t }) {
  const label = t(`localApps.state.${row.state}`) || row.state;
  return <span className={`la__state la__state--${tone(row.state)}`} data-la-state={row.state} title={row.lastError || ''}>{label}</span>;
}

/** One editable text / number cell: saved on blur or Enter (not on every keystroke). */
function Cell({ value, onSave, type = 'text', placeholder, width, disabled, field }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  const commit = () => { if (String(v ?? '') !== String(value ?? '')) onSave(v); };
  return (
    <input className="la__in" style={width ? { width } : undefined} type={type} value={v} placeholder={placeholder} disabled={disabled}
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} data-la-field={field} />
  );
}

export default function LocalAppsTab() {
  const { t } = useT();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState({});
  const [drafts, setDrafts] = useState({}); // start command typed before the toggle
  const [settings, setSettings] = useState(null);

  const load = useCallback(async (fresh = false) => {
    try {
      const r = await apiGet(`/local-apps/autostart/fleet${fresh ? '?fresh=true' : ''}`);
      setData(r); setError('');
      const self = (r?.machines || []).find((m) => m.self);
      setSettings((s) => s || self?.overview?.settings || { intervalMin: 5, cooldownMin: 15 });
    } catch (e) { setError(e?.message || String(e)); }
  }, []);
  useEffect(() => {
    load(true);
    const id = setInterval(() => { if (!document.hidden) load(false); }, 10000);
    return () => clearInterval(id);
  }, [load]);

  const machines = data?.machines || [];
  const rows = useMemo(() => filterRows(flatRows(machines), { flaggedOnly, q }), [machines, flaggedOnly, q]);
  const sum = summary(machines);
  const now = Date.now();

  const save = async (row, patch) => {
    const k = keyOf(row);
    setBusy((b) => ({ ...b, [k]: true }));
    try {
      const body = flagBody(row, patch);
      if (patch.autostart && !row.startCommand && !body.startCommand && drafts[k]) body.startCommand = drafts[k];
      const r = await apiPut('/local-apps/autostart/flag', body);
      if (!r?.ok) showToast({ text: t('localApps.savedNotPushed', { machine: row.machine, detail: r?.detail || r?.status || '' }), sticky: true });
      await load(true);
    } catch (e) { showToast({ text: e?.message || String(e), sticky: true }); }
    finally { setBusy((b) => ({ ...b, [k]: false })); }
  };

  const run = async (machine, apply) => {
    const k = `${apply ? 'apply' : 'check'}:${machine.machine}`;
    setBusy((b) => ({ ...b, [k]: true }));
    try {
      const r = await apiPost(`/local-apps/autostart/${apply ? 'apply' : 'check'}`, { machine: machine.self ? 'self' : machine.machine });
      showToast({ text: `${machine.machine}: ${r?.detail || r?.status}`, data: { 'la-run': r?.status || '' } });
      await load(true);
      if (!machine.self) setTimeout(() => load(true), 4000);
    } catch (e) { showToast({ text: e?.message || String(e), sticky: true }); }
    finally { setBusy((b) => ({ ...b, [k]: false })); }
  };

  const saveSettings = async () => {
    try {
      const r = await apiPut('/local-apps/autostart/settings', { intervalMin: Number(settings.intervalMin) || 5, cooldownMin: Number(settings.cooldownMin) || 15 });
      setSettings(r.settings);
      showToast({ text: t('localApps.settingsSaved', { n: r.settings.intervalMin }) });
      await load(true);
    } catch (e) { showToast({ text: e?.message || String(e), sticky: true }); }
  };

  return (
    <div className="la" data-local-apps-tab>
      <div className="la__head">
        <h3 className="la__title">🚀 {t('localApps.title')}</h3>
        <span className="la__chips" data-la-summary>
          <span className="la__chip">{t('localApps.flagged')} <b>{sum.flagged}</b></span>
          <span className="la__chip la__chip--ok">{t('localApps.state.up')} <b>{sum.up}</b></span>
          {sum.starting > 0 && <span className="la__chip la__chip--wait">{t('localApps.state.starting')} <b>{sum.starting}</b></span>}
          <span className={`la__chip${sum.down ? ' la__chip--warn' : ''}`}>{t('localApps.state.down')} <b>{sum.down}</b></span>
          <span className={`la__chip${sum.failing ? ' la__chip--bad' : ''}`}>{t('localApps.state.failing')} <b>{sum.failing}</b></span>
        </span>
        {settings && (
          <span className="la__settings" data-la-settings>
            {t('localApps.every')} <input className="la__in" type="number" min="1" max="1440" style={{ width: 52 }} value={settings.intervalMin} onChange={(e) => setSettings({ ...settings, intervalMin: e.target.value })} data-la-interval /> min
            · {t('localApps.cooldown')} <input className="la__in" type="number" min="1" max="1440" style={{ width: 52 }} value={settings.cooldownMin} onChange={(e) => setSettings({ ...settings, cooldownMin: e.target.value })} /> min
            <button type="button" className="la__btn" onClick={saveSettings} data-la-settings-save>{t('localApps.save')}</button>
          </span>
        )}
      </div>
      <div className="la__bar">
        <label className="la__check"><input type="checkbox" checked={flaggedOnly} onChange={(e) => setFlaggedOnly(e.target.checked)} data-la-flagged-only /> {t('localApps.flaggedOnly')}</label>
        <input className="la__in la__search" placeholder={t('localApps.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="button" className="la__btn" onClick={() => load(true)} data-la-refresh>↻ {t('localApps.refresh')}</button>
        <span className="la__hint">{t('localApps.hint')}</span>
      </div>
      {error && <div className="la__error">{error}</div>}
      {!data && !error && <div className="la__empty">{t('localApps.loading')}</div>}

      {machines.map((m) => {
        const mine = rows.filter((r) => r.machine === m.machine);
        return (
          <section key={m.machine} className="la__machine" data-la-machine={m.machine}>
            <div className="la__mhead">
              <span className="la__mname">🖥 {m.machine}{m.self ? <span className="la__tag">{t('localApps.thisHub')}</span> : null}</span>
              <span className={`la__state la__state--${m.reachable && m.status === 'ok' ? 'ok' : 'bad'}`}>{m.reachable && m.status === 'ok' ? t('localApps.reachable') : m.status}</span>
              {m.status === 'ok' && !m.inSync && <span className="la__state la__state--wait" title={t('localApps.syncingHint')} data-la-syncing>{t('localApps.syncing')}</span>}
              {m.detail && <span className="la__mdetail">{m.detail}</span>}
              {m.overview && <span className="la__mdetail">{t('localApps.lastCheck')} {ago(m.overview.lastCheckAt, now)} · {t('localApps.lastApply')} {ago(m.overview.lastApplyAt, now)}</span>}
              <span className="la__mtools">
                <button type="button" className="la__btn" disabled={!m.overview || busy[`check:${m.machine}`]} onClick={() => run(m, false)} data-la-check={m.machine}>🔎 {t('localApps.checkNow')}</button>
                <button type="button" className="la__btn la__btn--go" disabled={!m.overview || busy[`apply:${m.machine}`]} onClick={() => run(m, true)} data-la-apply={m.machine}>▶ {t('localApps.applyNow')}</button>
              </span>
            </div>
            {m.overview && harnessCount(m) > 0 && !flaggedOnly && <div className="la__harness-note">{t('localApps.harnessNote', { n: harnessCount(m) })}</div>}
            {m.overview && mine.length === 0 && <div className="la__empty">{flaggedOnly || q ? t('localApps.noMatch') : t('localApps.none')}</div>}
            {mine.length > 0 && (
              <table className="la__table">
                <thead>
                  <tr>
                    <th>{t('localApps.col.agent')}</th><th>{t('localApps.col.app')}</th><th>{t('localApps.col.port')}</th><th>{t('localApps.col.start')}</th>
                    <th>{t('localApps.col.autostart')}</th><th>{t('localApps.col.health')}</th><th title={t('localApps.col.orderHint')}>{t('localApps.col.order')}</th>
                    <th>{t('localApps.col.state')}</th><th>{t('localApps.col.last')}</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.map((r) => {
                    const k = keyOf(r);
                    const can = canAutostart(r, drafts[k]);
                    const on = flagged(r);
                    return (
                      <tr key={k} className={on ? 'la__row--on' : undefined} data-la-row={k}>
                        <td className="la__agent">{r.repo}</td>
                        <td><b>{r.name}</b>{r.name !== r.appId && <div className="la__sub">{r.appId}</div>}</td>
                        <td>{r.port ? <a href={r.url} target="_blank" rel="noreferrer">:{r.port}</a> : '—'}{r.kind === 'repo' && <div className="la__sub">{r.listening ? t('localApps.listening') : t('localApps.notListening')}</div>}</td>
                        <td className="la__cmd">
                          {r.kind === 'harness' ? <span className="la__sub">{t('localApps.alwaysOn')}</span> : (
                            <>
                              <Cell value={r.startSource === 'entry' ? r.startCommand : ''} placeholder={r.startSource === 'discovered' ? r.startCommand : t('localApps.cmdPlaceholder')} width={190} field="startCommand"
                                onSave={(v) => (on || r.flag ? save(r, { startCommand: v }) : setDrafts((d) => ({ ...d, [k]: v })))} />
                              <div className="la__sub">{r.startSource === 'entry' ? t('localApps.cmdEntry') : r.startSource === 'discovered' ? t('localApps.cmdDiscovered') : drafts[k] ? t('localApps.cmdDraft') : t('localApps.cmdNone')}</div>
                            </>
                          )}
                        </td>
                        <td>
                          <label className={`la__toggle${on ? ' la__toggle--on' : ''}`} title={can.ok ? '' : can.why}>
                            <input type="checkbox" checked={on} disabled={(!can.ok && !on) || busy[k]} onChange={(e) => save(r, { autostart: e.target.checked })} data-la-autostart={k} />
                            <span>{on ? t('localApps.on') : t('localApps.off')}</span>
                          </label>
                        </td>
                        <td>
                          {r.kind === 'repo' && <>
                            <Cell value={r.flag?.healthUrl} placeholder={r.port ? `http://127.0.0.1:${r.port}/` : 'http://…'} width={170} field="healthUrl" onSave={(v) => save(r, { healthUrl: v })} disabled={!r.flag && !on} />
                            <Cell value={r.flag?.expectStatus} placeholder="2xx" width={46} type="number" field="expectStatus" onSave={(v) => save(r, { expectStatus: v })} disabled={!r.flag && !on} />
                          </>}
                        </td>
                        <td>
                          {r.kind === 'repo' && <>
                            <Cell value={r.flag?.order ?? 0} width={44} type="number" field="order" onSave={(v) => save(r, { order: v })} disabled={!r.flag && !on} />
                            <Cell value={r.flag?.delaySec ?? 0} width={44} type="number" field="delaySec" onSave={(v) => save(r, { delaySec: v })} disabled={!r.flag && !on} />
                          </>}
                        </td>
                        <td><StateBadge row={r} t={t} />{r.lastError && on && <div className="la__err" title={r.lastError}>{r.lastError}</div>}</td>
                        <td className="la__last">
                          {on && <div>{t('localApps.checked')} {ago(r.lastCheckAt, now)}</div>}
                          {r.lastStartAt && <div title={r.lastStartResult || ''}>{t('localApps.started')} {ago(r.lastStartAt, now)} · {r.lastStartTrigger}<div className="la__sub">{r.lastStartResult}</div></div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
    </div>
  );
}
