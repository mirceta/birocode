import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiPut, apiDelete } from '../api/client';
import { OWNER, groupPrompts, filterPrompts, promptMark, moveId, placeholdersOf, placeholderKind, optionsFor, kindHint, fillAll, usageLine, preview } from '../components/arch/archPrompts';
import PromptForm, { TemplateText } from '../components/arch/PromptForm';
import { handoffToArch } from '../components/arch/archHandoff';
import { isTemplate } from '../components/arch/goalTemplates';
import TemplateEditor from '../components/arch/TemplateEditor';
import TemplateSheet from '../components/arch/TemplateSheet';
import { kindWord } from '../components/arch/goalPlan';
import '../components/arch/goalTemplates.css';
import '../components/arch/archPrompts.css';
import './promptsTab.css';

// The Prompts tab (openspec arch-prompts-tab, fleet task f6add917): the arch agent's cached prompts — the requests
// the Operator keeps repeating, seeded from the Arch examples — as a properly laid-out library instead of the
// block that used to sit above the Arch chat's composer. Grouped by category, searchable; each card shows the
// template with its placeholders as chips, where it came from (seeded / edited / custom), the tools it
// leads to (from its hint), how often it was used and when. Add, edit, duplicate, reorder, delete, re-seed (a
// re-seed only adds missing categories — Operator edits survive). "Use" opens a fill-in sheet: placeholders
// pick from the live machines / agents / cards; then "Send to the arch" sends it to the Operator-facing
// conversation, or "Open in Arch chat" puts it in that composer to edit first. Same store, same endpoints,
// same seeding as before (/api/prompts, owner "arch"); the arch's cache_prompt / list / remove tools unchanged.

function UseSheet({ prompt, onClose, onDone }) {
  const names = useMemo(() => placeholdersOf(prompt.text), [prompt.text]);
  const [values, setValues] = useState({});
  const [ctx, setCtx] = useState({ sources: [], agents: [], tasks: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    apiGet('/arch').then((s) => setCtx((c) => ({ ...c, selfLabel: s?.fleet?.selfLabel, sources: s?.fleet?.sources || [], agents: s?.agents || [] }))).catch(() => { /* free text then */ });
    if (names.some((n) => placeholderKind(n) === 'task')) apiGet('/taskgraph').then((g) => setCtx((c) => ({ ...c, tasks: (g?.nodes || []).filter((x) => x.status !== 'done') }))).catch(() => {});
  }, [names]);
  const filled = fillAll(prompt.text, values);
  const missing = names.filter((n) => !String(values[n] ?? '').trim());
  const mark = () => apiPost(`/prompts/${prompt.id}/used`, {}).catch(() => {});
  const send = async () => {
    setBusy(true); setError('');
    try {
      await apiPost('/arch/send', { text: filled });
      await mark();
      onDone(`Sent to the arch: “${preview(filled, 80)}” — the reply is in the Arch tab.`);
    } catch (e) { setError(e?.message || String(e)); } finally { setBusy(false); }
  };
  const openInChat = async () => { await mark(); handoffToArch(filled); onDone('Opened in the Arch chat composer — edit and send it there.'); };
  return (
    <div className="pt__sheet" role="dialog" aria-label={`Use ${prompt.label}`} data-prompt-use={prompt.id}>
      <div className="pt__sheet-h"><b>{prompt.emoji || '💬'} {prompt.label || preview(prompt.text, 60)}</b><button type="button" className="ap__btn" onClick={onClose} aria-label="close">✕</button></div>
      {names.length > 0 && (
        <div className="pt__fields">
          {names.map((n) => {
            const kind = placeholderKind(n);
            const options = optionsFor(kind, ctx);
            const listId = `pt-opt-${prompt.id}-${n.replace(/[^a-z0-9]/gi, '-')}`;
            return (
              <label key={n} className="pt__field" data-prompt-field={n} data-prompt-field-kind={kind}>
                <span className="pt-tpl__chip">{n}</span>
                {options.length > 0 && options.length <= 40
                  ? (
                    <select className="ap__select" value={values[n] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [n]: e.target.value }))} data-prompt-input={n}>
                      <option value="">{kindHint(kind)}…</option>
                      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )
                  : (
                    <>
                      <input className="ap__input" list={options.length ? listId : undefined} type={kind === 'number' ? 'number' : 'text'} placeholder={kindHint(kind)} value={values[n] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [n]: e.target.value }))} data-prompt-input={n} />
                      {options.length > 0 && <datalist id={listId}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</datalist>}
                    </>
                  )}
              </label>
            );
          })}
        </div>
      )}
      <div className="pt__preview" data-prompt-preview><TemplateText text={filled} /></div>
      {error && <div className="ap__note ap__note--err">{error}</div>}
      <div className="ap__form-row">
        <button type="button" className="ap__btn ap__btn--primary" onClick={send} disabled={busy || missing.length > 0} title={missing.length ? `Fill ${missing.join(', ')} first` : 'Send it to the Arch agent conversation now'} data-prompt-send>{busy ? 'Sending…' : '▶ Send to the arch'}</button>
        <button type="button" className="ap__btn" onClick={openInChat} disabled={busy} title="Put it into the Arch chat composer to edit before sending (unfilled placeholders become chips there)" data-prompt-open-chat>Open in Arch chat</button>
        {missing.length > 0 && <span className="ap__dim">fill {missing.map((n) => `{${n}}`).join(', ')} to send directly</span>}
      </div>
    </div>
  );
}

export default function PromptsTab() {
  const [prompts, setPrompts] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [origin, setOrigin] = useState('');            // '' | seeded | edited | custom
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [usingId, setUsingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const seededOnce = useRef(false);
  const [tplEditing, setTplEditing] = useState(null);   // null | 'new' | template id
  const [tplUsing, setTplUsing] = useState(null);
  const [tplError, setTplError] = useState('');
  // The tools each seeded prompt leads to, from the Arch examples catalogue (category id = the prompt's seedId).
  const [toolsBySeed, setToolsBySeed] = useState({});
  useEffect(() => {
    apiGet('/arch/examples').then((d) => setToolsBySeed(Object.fromEntries((d?.categories || []).map((c) => [c.id, c.tools || []])))).catch(() => { /* no catalogue: no tools line */ });
  }, []);

  const load = useCallback(async () => {
    try {
      const list = await apiGet(`/prompts?owner=${OWNER}`);
      const l = Array.isArray(list) ? list : [];
      setPrompts(l); setError('');
      return l;
    } catch (e) { setError(e?.message || String(e)); return null; }
  }, []);
  const seed = useCallback(async (why) => {
    setBusy(true);
    try {
      const r = await apiPost('/prompts/seed/arch', {});
      setNote(`${why ? why + ': ' : ''}${r?.detail || 'seeded'}`);
      if (Array.isArray(r?.prompts)) setPrompts(r.prompts); else await load();
    } catch (e) { setError(e?.message || String(e)); } finally { setBusy(false); }
  }, [load]);
  // First use: an empty arch library is seeded from the Arch examples, once (the same rule as before).
  useEffect(() => {
    (async () => {
      const list = await load();
      if (list && list.length === 0 && !seededOnce.current) { seededOnce.current = true; await seed('first use'); }
    })();
  }, [load, seed]);
  useEffect(() => { if (!note) return undefined; const id = setTimeout(() => setNote(''), 7000); return () => clearTimeout(id); }, [note]);

  const act = async (fn, after) => {
    setBusy(true); setError('');
    try { const r = await fn(); after?.(r); } catch (e) { setError(e?.message || String(e)); } finally { setBusy(false); }
  };
  const add = (body) => act(() => apiPost('/prompts', { ...body, owner: OWNER }), () => { setAdding(false); load(); });
  const save = (id, body) => act(() => apiPatch(`/prompts/${id}`, body), () => { setEditingId(null); load(); });
  const saveTemplate = async (body) => {
    setBusy(true); setTplError('');
    try {
      if (tplEditing && tplEditing !== 'new') await apiPut(`/prompts/templates/${tplEditing}`, body); else await apiPost('/prompts/templates', body);
      setTplEditing(null); setNote('Goal template saved.'); await load();
    } catch (e) { setTplError(e?.message || String(e)); } finally { setBusy(false); }
  };
  const remove = (p) => { if (!window.confirm(`Delete "${p.label || preview(p.text, 40)}"?${p.seedId ? ' (a re-seed brings the seeded version back)' : ''}`)) return; act(() => apiDelete(`/prompts/${p.id}`), load); };
  const duplicate = (p) => act(() => apiPost(`/prompts/${p.id}/duplicate`, {}), load);
  const move = (p, dir) => {
    const ids = moveId((prompts || []).map((x) => x.id), p.id, dir);
    act(() => apiPost('/prompts/reorder', { owner: OWNER, ids }), (r) => { if (Array.isArray(r)) setPrompts(r); else load(); });
  };

  const all = prompts || [];
  // Goal templates (openspec arch-goal-templates) get their own section; the prompt groups list plain prompts only.
  const templates = useMemo(() => filterPrompts(all.filter(isTemplate), q), [all, q]);
  const shown = useMemo(() => filterPrompts(all.filter((p) => !isTemplate(p)), q).filter((p) => !origin || promptMark(p) === origin), [all, q, origin]);
  const groups = useMemo(() => groupPrompts(shown), [shown]);
  const counts = useMemo(() => ({ seeded: all.filter((p) => promptMark(p) === 'seeded').length, edited: all.filter((p) => promptMark(p) === 'edited').length, custom: all.filter((p) => promptMark(p) === 'custom').length, used: all.reduce((n, p) => n + (p.uses || 0), 0) }), [all]);
  const now = Date.now();

  return (
    <div className="pt" data-prompts-tab data-prompts-count={all.length}>
      <div className="pt__head">
        <div className="pt__title">
          <b>📋 Arch prompts</b>
          <span className="ap__dim">{all.length} prompts · {counts.used} uses — the requests you repeat to the arch; “Use” fills the {'{placeholders}'} and sends</span>
        </div>
        <div className="pt__tools">
          <input className="ap__search pt__search" type="search" placeholder="search prompts…" value={q} onChange={(e) => setQ(e.target.value)} data-prompts-search />
          {['seeded', 'edited', 'custom'].map((m) => (
            <button key={m} type="button" className={`pt__chip pt__chip--${m}${origin === m ? ' pt__chip--on' : ''}`} onClick={() => setOrigin((o) => (o === m ? '' : m))} data-prompts-origin={m}>{m} {counts[m]}</button>
          ))}
          <button type="button" className="ap__btn ap__btn--primary" onClick={() => { setAdding(true); setEditingId(null); }} disabled={busy} data-prompts-new>＋ New prompt</button>
          <button type="button" className="ap__btn" onClick={() => seed('re-seed')} disabled={busy} title="Add the prompts of any Arch-examples category that is missing. Edited and custom prompts are never touched." data-prompts-reseed>↻ Re-seed from Arch examples</button>
        </div>
      </div>
      {(note || error) && <div className={`ap__note${error ? ' ap__note--err' : ''}`} role="status" data-prompts-note>{error || note}</div>}
      {adding && <div className="pt__card pt__card--editing"><PromptForm onSave={add} onCancel={() => setAdding(false)} busy={busy} /></div>}
      {prompts === null && !error && <div className="ap__dim">Loading the prompts…</div>}
      {prompts !== null && all.length === 0 && <div className="ap__dim" data-prompts-empty>No prompts yet — press “Re-seed from Arch examples” or add one.</div>}
      {all.length > 0 && shown.length === 0 && <div className="ap__dim">Nothing matches.</div>}
      <section className="pt__group" data-templates-section>
        <h3 className="pt__group-h">🧭 Goal templates <span className="ap__dim">{all.filter(isTemplate).length} · a step plan with inputs — fill, preview, discuss with the arch or start</span>
          <button type="button" className="ap__btn" style={{ marginLeft: 8 }} onClick={() => { setTplEditing('new'); setTplUsing(null); }} disabled={busy} data-template-new>＋ New goal template</button>
        </h3>
        {tplEditing === 'new' && (
          <div className="pt__card pt__card--editing"><TemplateEditor initial={{ label: '', purpose: '', inputs: [], steps: [{ title: '', done: '', kind: 'send' }], category: 'Loops, goals & recurring' }} busy={busy} error={tplError} onSave={saveTemplate} onCancel={() => setTplEditing(null)} /></div>
        )}
        {templates.length === 0 && tplEditing !== 'new' && <div className="ap__dim">No goal templates{q ? ' match' : ' yet — use “Save as template” on a goal in the Subagents tab, or add one'}.</div>}
        <div className="pt__tpl-cards">
          {templates.map((t) => (tplEditing === t.id
            ? <div key={t.id} className="pt__card pt__card--editing" data-template-card={t.id}><TemplateEditor initial={t} busy={busy} error={tplError} onSave={saveTemplate} onCancel={() => setTplEditing(null)} /></div>
            : (
              <article key={t.id} className="pt__card pt__card--custom" data-template-card={t.id}>
                <header className="pt__card-h">
                  <span className="pt__label">{t.emoji || '🧭'} {t.label}</span>
                  <span className="ap__mark ap__mark--custom">goal template</span>
                </header>
                <div className="pt__text"><TemplateText text={t.purpose || t.text} /></div>
                {(t.inputs || []).length > 0 && <div className="pt__tpl-meta" data-template-inputs>inputs: {t.inputs.map((i) => <span key={i.name} className="pt-tpl__chip" title={`${i.type}${i.label ? ` — ${i.label}` : ''}${i.default ? ` (default ${i.default})` : ''}`}>{i.name}</span>)}</div>}
                <ol className="pt__tpl-steps" data-template-steps={(t.steps || []).length}>
                  {(t.steps || []).map((st, i) => <li key={i}><TemplateText text={st.title} /><span className="pt__tpl-kind">{kindWord(st.kind)}</span></li>)}
                </ol>
                <div className="pt__meta">
                  <span data-prompt-usage>{usageLine(t, now)}</span>
                  {t.maxIterations ? <span>· cap {t.maxIterations}</span> : null}
                  {t.sourceGoalId ? <span>· captured from goal <code>{t.sourceGoalId}</code></span> : null}
                </div>
                {tplUsing === t.id
                  ? <TemplateSheet template={t} onClose={() => setTplUsing(null)} onDone={(msg) => { setTplUsing(null); setNote(msg); load(); }} />
                  : (
                    <div className="pt__actions">
                      <button type="button" className="ap__btn ap__btn--primary" onClick={() => { setTplUsing(t.id); setTplEditing(null); }} data-template-use={t.id}>Use</button>
                      <button type="button" className="ap__act" onClick={() => { setTplEditing(t.id); setTplUsing(null); setTplError(''); }} disabled={busy} data-template-edit={t.id}>✎ edit</button>
                      <button type="button" className="ap__act" onClick={() => duplicate(t)} disabled={busy} title="Duplicate">⧉</button>
                      <button type="button" className="ap__act ap__act--danger" onClick={() => remove(t)} disabled={busy} title="Delete">×</button>
                    </div>
                  )}
              </article>
            )))}
        </div>
      </section>
      {groups.map((g) => (
        <section key={g.name} className="pt__group" data-prompts-group={g.name}>
          <h3 className="pt__group-h">{g.name} <span className="ap__dim">{g.items.length}</span></h3>
          <div className="pt__cards">
            {g.items.map((p) => {
              const mark = promptMark(p);
              const idx = all.findIndex((x) => x.id === p.id);
              if (editingId === p.id) return <div key={p.id} className="pt__card pt__card--editing" data-prompt-card={p.id}><PromptForm initial={p} onSave={(body) => save(p.id, body)} onCancel={() => setEditingId(null)} busy={busy} /></div>;
              return (
                <article key={p.id} className={`pt__card pt__card--${mark}`} data-prompt-card={p.id} data-prompt-mark={mark}>
                  <header className="pt__card-h">
                    <span className="pt__label">{p.emoji || '💬'} {p.label || preview(p.text, 60)}</span>
                    <span className={`ap__mark ap__mark--${mark}`} title={mark === 'seeded' ? 'from the Arch examples, untouched' : mark === 'edited' ? 'seeded, then edited by you (a re-seed keeps your edit)' : 'written by you or cached by the arch'}>{mark}</span>
                  </header>
                  <div className="pt__text"><TemplateText text={p.text} /></div>
                  {p.hint && <div className="pt__hint">{p.hint}</div>}
                  <div className="pt__meta">
                    <span data-prompt-usage>{usageLine(p, now)}</span>
                    {p.seedId && <span title="the Arch-examples category it was seeded from">· from Arch examples <code>{p.seedId}</code></span>}
                    {(toolsBySeed[p.seedId] || []).length > 0 && <span className="pt__tools-used" data-prompt-tools>· tools: {toolsBySeed[p.seedId].map((t) => <code key={t}>{t}</code>)}</span>}
                  </div>
                  {usingId === p.id
                    ? <UseSheet prompt={p} onClose={() => setUsingId(null)} onDone={(msg) => { setUsingId(null); setNote(msg); load(); }} />
                    : (
                      <div className="pt__actions">
                        <button type="button" className="ap__btn ap__btn--primary" onClick={() => setUsingId(p.id)} data-prompt-use-btn={p.id}>Use</button>
                        <button type="button" className="ap__act" onClick={() => { setEditingId(p.id); setAdding(false); }} disabled={busy} title="Edit" data-prompt-edit={p.id}>✎ edit</button>
                        <button type="button" className="ap__act" onClick={() => duplicate(p)} disabled={busy} title="Duplicate" data-prompt-duplicate={p.id}>⧉</button>
                        <button type="button" className="ap__act" onClick={() => move(p, -1)} disabled={busy || idx <= 0} title="Move earlier" data-prompt-up={p.id}>↑</button>
                        <button type="button" className="ap__act" onClick={() => move(p, 1)} disabled={busy || idx < 0 || idx >= all.length - 1} title="Move later" data-prompt-down={p.id}>↓</button>
                        <button type="button" className="ap__act ap__act--danger" onClick={() => remove(p)} disabled={busy} title="Delete" data-prompt-delete={p.id}>×</button>
                      </div>
                    )}
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
