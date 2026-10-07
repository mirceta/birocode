import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client';
import { GROUPS, OWNER, groupPrompts, filterPrompts, promptMark, moveId, preview, placeholdersOf } from './archPrompts';
import './archPrompts.css';

// The Arch agent's CACHED PROMPTS panel (openspec arch-custom-prompts, fleet task ebc91192):
// the repo agents' custom-prompts feature, on the arch conversation — the ~20 requests the
// Operator keeps repeating, one click away. Cards grouped by category; click = insert into
// the composer (editable before sending), ▶ = send now; add / edit / delete / duplicate /
// reorder; search. Seeded on first use from the Arch examples catalogue (the request
// templates mined from the real arch conversations) and on "Re-seed": a re-seed adds the
// missing categories only — edited prompts survive, and every card says seeded / edited /
// custom. Same store and endpoints as the repo agents' library (/api/prompts, owner "arch").

const OPEN_KEY = 'arch.promptsOpen';
const EMOJIS = ['💬', '🚀', '🛰️', '📝', '📌', '✅', '🔁', '🗑️', '👀', '📊', '🔍', '🎯', '⏰', '📦', '💡', '🐛', '🧱', '🔑', '🤝', '🧹', '🏛️', '❓', '✨', '🧩'];

function Form({ initial, onSave, onCancel, busy }) {
  const [emoji, setEmoji] = useState(initial?.emoji || '💬');
  const [label, setLabel] = useState(initial?.label || '');
  const [text, setText] = useState(initial?.text || '');
  const [category, setCategory] = useState(initial?.category || GROUPS[GROUPS.length - 1]);
  const [hint, setHint] = useState(initial?.hint || '');
  const ph = placeholdersOf(text);
  return (
    <form className="ap__form" onSubmit={(e) => { e.preventDefault(); if (text.trim()) onSave({ emoji, label: label.trim(), text: text.trim(), category, hint: hint.trim() }); }} data-ap-form>
      <div className="ap__form-row">
        <select className="ap__emoji" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="emoji">{(EMOJIS.includes(emoji) ? EMOJIS : [emoji, ...EMOJIS]).map((e) => <option key={e} value={e}>{e}</option>)}</select>
        <input className="ap__input" type="text" placeholder="label — what this prompt asks for" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} data-ap-label />
        <select className="ap__select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="category" data-ap-category>
          {(GROUPS.includes(category) ? GROUPS : [...GROUPS, category]).map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
      </div>
      <textarea className="ap__textarea" rows={3} placeholder="the prompt as you would type it — {machine}, {agent}, {task}, {pr}, {url}, {branch}, {text} become fill-in chips" value={text} onChange={(e) => setText(e.target.value)} data-ap-text />
      <input className="ap__input" type="text" placeholder="hint — how to phrase it (optional)" value={hint} onChange={(e) => setHint(e.target.value)} maxLength={400} data-ap-hint />
      <div className="ap__form-row">
        <span className="ap__dim">{ph.length ? `placeholders: ${ph.join(', ')}` : 'no placeholders'}</span>
        <span className="ap__spacer" />
        <button type="submit" className="ap__btn ap__btn--primary" disabled={busy || !text.trim()} data-ap-save>{initial?.id ? 'Save' : 'Add prompt'}</button>
        <button type="button" className="ap__btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

export default function ArchPromptsPanel({ onInsert, onSend = null, canSend = true, busyWord = '' }) {
  const [prompts, setPrompts] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(OPEN_KEY) !== '0'; } catch { return true; } });
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const seededOnce = useRef(false);
  const toggle = () => setOpen((v) => { const n = !v; try { localStorage.setItem(OPEN_KEY, n ? '1' : '0'); } catch { /* private mode */ } return n; });

  const load = useCallback(async () => {
    try {
      const list = await apiGet(`/prompts?owner=${OWNER}`);
      setPrompts(Array.isArray(list) ? list : []);
      setError('');
      return Array.isArray(list) ? list : [];
    } catch (e) { setError(e?.message || String(e)); return null; }
  }, []);

  const seed = useCallback(async (why) => {
    setBusy(true);
    try {
      const r = await apiPost('/prompts/seed/arch', {});
      setNote(`${why ? why + ': ' : ''}${r?.detail || 'seeded'}`);
      if (Array.isArray(r?.prompts)) setPrompts(r.prompts); else await load();
    } catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  }, [load]);

  // First use: an empty arch library is seeded from the Arch examples, once.
  useEffect(() => {
    (async () => {
      const list = await load();
      if (list && list.length === 0 && !seededOnce.current) { seededOnce.current = true; await seed('first use'); }
    })();
  }, [load, seed]);

  const act = async (fn, after) => {
    setBusy(true); setError('');
    try { const r = await fn(); after?.(r); } catch (e) { setError(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const add = (body) => act(() => apiPost('/prompts', { ...body, owner: OWNER }), () => { setAdding(false); load(); });
  const save = (id, body) => act(() => apiPatch(`/prompts/${id}`, body), () => { setEditingId(null); load(); });
  const remove = (p) => { if (!window.confirm(`Delete "${p.label || preview(p.text, 40)}"?${p.seedId ? ' (a re-seed brings the seeded version back)' : ''}`)) return; act(() => apiDelete(`/prompts/${p.id}`), load); };
  const duplicate = (p) => act(() => apiPost(`/prompts/${p.id}/duplicate`, {}), load);
  const move = (p, dir) => {
    const ids = moveId((prompts || []).map((x) => x.id), p.id, dir);
    act(() => apiPost('/prompts/reorder', { owner: OWNER, ids }), (r) => { if (Array.isArray(r)) setPrompts(r); else load(); });
  };

  const all = prompts || [];
  const shown = useMemo(() => filterPrompts(all, q), [all, q]);
  const groups = useMemo(() => groupPrompts(shown), [shown]);
  const counts = useMemo(() => ({ seeded: all.filter((p) => promptMark(p) === 'seeded').length, edited: all.filter((p) => promptMark(p) === 'edited').length, custom: all.filter((p) => promptMark(p) === 'custom').length }), [all]);

  return (
    <section className={`ap${open ? '' : ' ap--closed'}`} data-arch-prompts data-ap-count={all.length}>
      <div className="ap__head">
        <button type="button" className="ap__toggle" onClick={toggle} title={open ? 'Collapse the cached prompts' : 'Expand the cached prompts'} data-ap-toggle>{open ? '▾' : '▸'}</button>
        <span className="ap__title">Cached prompts</span>
        <span className="ap__count" title={`${counts.seeded} seeded · ${counts.edited} edited · ${counts.custom} custom`} data-ap-counts={`${counts.seeded}/${counts.edited}/${counts.custom}`}>{all.length}</span>
        <span className="ap__dim ap__blurb">the requests you repeat — click a card to put it in the composer, ▶ sends it now; {'{placeholders}'} become fill-in chips</span>
        <span className="ap__spacer" />
        {open && <input className="ap__search" type="search" placeholder="search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search cached prompts" data-ap-search />}
        {open && <button type="button" className="ap__btn" onClick={() => { setAdding(true); setEditingId(null); }} disabled={busy} data-ap-new>＋ New prompt</button>}
        {open && <button type="button" className="ap__btn" onClick={() => seed('re-seed')} disabled={busy} title="Add the prompts of any Arch-examples category that is missing here. Edited and custom prompts are never touched." data-ap-reseed>↻ Re-seed from Arch examples</button>}
      </div>
      {open && (note || error) && <div className={`ap__note${error ? ' ap__note--err' : ''}`} data-ap-note>{error || note}</div>}
      {open && adding && <Form onSave={add} onCancel={() => setAdding(false)} busy={busy} />}
      {open && prompts === null && !error && <div className="ap__dim ap__pad">Loading the cached prompts…</div>}
      {open && prompts !== null && all.length === 0 && <div className="ap__dim ap__pad" data-ap-empty>No cached prompts yet — press “Re-seed from Arch examples” or add one.</div>}
      {open && all.length > 0 && shown.length === 0 && <div className="ap__dim ap__pad">Nothing matches — clear the search.</div>}
      {open && groups.map((g) => (
        <div key={g.name} className="ap__group" data-ap-group={g.name}>
          <div className="ap__group-name">{g.name} <span className="ap__dim">{g.items.length}</span></div>
          <div className="ap__cards">
            {g.items.map((p) => {
              const mark = promptMark(p);
              const ph = placeholdersOf(p.text);
              if (editingId === p.id) return <div key={p.id} className="ap__card ap__card--editing" data-ap-card={p.id}><Form initial={p} onSave={(body) => save(p.id, body)} onCancel={() => setEditingId(null)} busy={busy} /></div>;
              const idx = all.findIndex((x) => x.id === p.id);
              return (
                <div key={p.id} className={`ap__card ap__card--${mark}`} data-ap-card={p.id} data-ap-mark={mark} data-ap-seed={p.seedId || ''} title={p.text}>
                  <button type="button" className="ap__body" onClick={() => onInsert?.(p.text)} title="Insert into the composer (edit it there, then send)" data-ap-insert={p.id}>
                    <span className="ap__card-head">
                      <span className="ap__card-emoji" aria-hidden="true">{p.emoji || '💬'}</span>
                      <span className="ap__card-label">{p.label || preview(p.text, 60)}</span>
                      <span className={`ap__mark ap__mark--${mark}`}>{mark}</span>
                    </span>
                    <span className="ap__card-text">{preview(p.text)}</span>
                    {ph.length > 0 && <span className="ap__chips">{ph.map((n) => <span key={n} className="ap__chip">{`{${n}}`}</span>)}</span>}
                    {p.hint && <span className="ap__hint">how to phrase it: {p.hint}</span>}
                  </button>
                  <div className="ap__actions">
                    {onSend && <button type="button" className="ap__act ap__act--send" onClick={() => onSend(p.text)} disabled={!canSend || busy || ph.length > 0} title={ph.length > 0 ? 'Has placeholders — insert it and fill the chips first' : canSend ? 'Send now, as typed' : busyWord || 'The arch is busy'} data-ap-send={p.id}>▶ send</button>}
                    <button type="button" className="ap__act" onClick={() => { setEditingId(p.id); setAdding(false); }} disabled={busy} title="Edit" data-ap-edit={p.id}>✎</button>
                    <button type="button" className="ap__act" onClick={() => duplicate(p)} disabled={busy} title="Duplicate" data-ap-duplicate={p.id}>⧉</button>
                    <button type="button" className="ap__act" onClick={() => move(p, -1)} disabled={busy || idx <= 0} title="Move earlier" data-ap-up={p.id}>↑</button>
                    <button type="button" className="ap__act" onClick={() => move(p, 1)} disabled={busy || idx < 0 || idx >= all.length - 1} title="Move later" data-ap-down={p.id}>↓</button>
                    <button type="button" className="ap__act ap__act--danger" onClick={() => remove(p)} disabled={busy} title="Delete" data-ap-delete={p.id}>×</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}
