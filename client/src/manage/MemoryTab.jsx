import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../api/client';
import { KINDS, KIND_LABEL, KIND_ICON, filterEntries, groupByKind, badgesOf, summary, editorProblems, tagCounts, parseTags, ago, authorFamily } from './memoryModel';
import Markdown from '../components/shared/Markdown';
import './memory.css';

// The Memory tab (openspec arch-memory-store, fleet task 0953472c): the arch agent's principles and learnings as
// a visible store the Operator manages. One card per entry, grouped by kind; filter by kind / tag / author /
// status and the flags (stale, needs review, used recently, pinned); search; add, edit, pin, retire / restore,
// confirm "still true", delete. Principles and pinned entries are loaded into every arch turn; the others when
// their tags match the turn — the "used recently" badge shows what actually reached the arch. The hub's store is
// the single writer (GET/POST /api/memory); the server refuses secrets and a missing kind / reason.

const EMPTY = { title: '', body: '', kind: 'principle', tags: '', reason: '', pinned: false };

function Editor({ draft, setDraft, onSave, onCancel, saving, error, isNew }) {
  const problems = editorProblems(draft);
  return (
    <div className="mem__editor" data-memory-editor={isNew ? 'new' : draft.id}>
      <div className="mem__row">
        <input className="mem__in mem__in--title" placeholder="Title (one line)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} data-memory-field="title" />
        <select className="mem__in" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value })} data-memory-field="kind">
          {KINDS.map((k) => <option key={k} value={k}>{KIND_ICON[k]} {k}</option>)}
        </select>
        <label className="mem__check"><input type="checkbox" checked={!!draft.pinned} onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })} /> 📌 pinned</label>
      </div>
      <textarea className="mem__in mem__in--body" rows={6} placeholder="The entry (markdown, short and factual). Never a secret — write where it lives instead." value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} data-memory-field="body" />
      <div className="mem__row">
        <input className="mem__in" placeholder="tags: repo:prg, machine:HUB, goal:84495326" value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} data-memory-field="tags" />
        <input className="mem__in mem__in--reason" placeholder="Why (one line, required)" value={draft.reason} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} data-memory-field="reason" />
      </div>
      {problems.length > 0 && <div className="mem__hint" data-memory-problems>Needs {problems.join(', ')}.</div>}
      {error && <div className="mem__err" role="alert" data-memory-error>{error}</div>}
      <div className="mem__row">
        <button type="button" className="mem__btn mem__btn--primary" disabled={saving} onClick={onSave} data-memory-save>{saving ? 'Saving…' : isNew ? 'Add' : 'Save'}</button>
        <button type="button" className="mem__btn" onClick={onCancel}>Cancel</button>
        {draft.kind === 'principle' || draft.pinned ? <span className="mem__dim">Loaded into every arch turn.</span> : <span className="mem__dim">Loaded when its tags match the turn; else one recall away.</span>}
      </div>
    </div>
  );
}

function Card({ e, now, onEdit, act, busy, expanded, setExpanded }) {
  const long = (e.body || '').length > 420;
  const open = expanded || !long;
  return (
    <article className={`mem__card${e.status === 'retired' ? ' mem__card--retired' : ''}${e.pinned ? ' mem__card--pinned' : ''}`} data-memory={e.id} data-memory-kind={e.kind}>
      <header className="mem__card-h">
        <span className="mem__title" title={e.title}>{e.title}</span>
        <span className="mem__badges">
          {badgesOf(e).map((b) => <span key={b.key} className={`mem__badge mem__badge--${b.tone}`} data-memory-badge={b.key}>{b.label}</span>)}
        </span>
      </header>
      <div className={`mem__body${open ? '' : ' mem__body--clip'}`}><Markdown>{open ? e.body : `${e.body.slice(0, 420)}…`}</Markdown></div>
      {long && <button type="button" className="mem__link" onClick={() => setExpanded(!expanded)}>{expanded ? 'show less' : 'show all'}</button>}
      <div className="mem__meta">
        {(e.tags || []).map((t) => <span key={t} className="mem__tag">{t}</span>)}
        <span className="mem__dim" title={`created ${new Date(e.created).toLocaleString()} · updated ${new Date(e.updated).toLocaleString()} · ${e.versions} version(s)`}>
          by {e.author} · updated {ago(e.updated, now)} · confirmed {ago(e.lastConfirmed, now)} · used {e.useCount ? `${e.useCount}× (last ${ago(e.lastUsed, now)})` : 'never'}{e.source ? ` · from ${e.source}` : ''}
        </span>
      </div>
      <div className="mem__actions">
        <button type="button" className="mem__btn" onClick={() => onEdit(e)} disabled={busy} data-memory-edit={e.id}>Edit</button>
        <button type="button" className="mem__btn" onClick={() => act(e, 'confirm')} disabled={busy} title="Still true: resets the STALE clock (and clears review)" data-memory-confirm={e.id}>✓ Still true</button>
        <button type="button" className="mem__btn" onClick={() => act(e, 'pin')} disabled={busy} data-memory-pin={e.id}>{e.pinned ? 'Unpin' : '📌 Pin'}</button>
        {e.status === 'active'
          ? <button type="button" className="mem__btn" onClick={() => act(e, 'retire')} disabled={busy} data-memory-retire={e.id}>Retire</button>
          : <button type="button" className="mem__btn" onClick={() => act(e, 'restore')} disabled={busy} data-memory-restore={e.id}>Restore</button>}
        <button type="button" className="mem__btn mem__btn--danger" onClick={() => act(e, 'delete')} disabled={busy} data-memory-delete={e.id}>Delete</button>
      </div>
    </article>
  );
}

export default function MemoryTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState({ status: 'active', kind: '', tag: '', author: '', only: '', query: '' });
  const [editing, setEditing] = useState(null);      // null | 'new' | entry id
  const [draft, setDraft] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [busy, setBusy] = useState('');
  const [expanded, setExpanded] = useState({});
  const [note, setNote] = useState('');

  const load = () => apiGet('/memory').then((d) => { setData(d); setError(''); }).catch((e) => setError(String(e?.message || e)));
  useEffect(() => { load(); const id = setInterval(load, 15000); return () => clearInterval(id); }, []);
  useEffect(() => { if (!note) return undefined; const id = setTimeout(() => setNote(''), 5000); return () => clearTimeout(id); }, [note]);

  const entries = data?.entries || [];
  const shown = useMemo(() => filterEntries(entries, filter), [entries, filter]);
  const groups = useMemo(() => groupByKind(shown), [shown]);
  const s = summary(entries);
  const tags = useMemo(() => tagCounts(entries.filter((e) => e.status === 'active')).slice(0, 30), [entries]);
  const set = (k, v) => setFilter((f) => ({ ...f, [k]: f[k] === v ? '' : v }));

  const startNew = () => { setEditing('new'); setDraft(EMPTY); setEditError(''); };
  const startEdit = (e) => { setEditing(e.id); setDraft({ id: e.id, title: e.title, body: e.body, kind: e.kind, tags: (e.tags || []).join(', '), reason: '', pinned: e.pinned }); setEditError(''); };
  const save = async () => {
    const problems = editorProblems(draft);
    if (problems.length) return;   // the hint above the buttons already says what is missing
    setSaving(true);
    try {
      const body = { title: draft.title, body: draft.body, kind: draft.kind, tags: parseTags(draft.tags), pinned: draft.pinned, reason: draft.reason };
      if (editing === 'new') await apiPost('/memory', body); else await apiPut(`/memory/${encodeURIComponent(editing)}`, body);
      setEditing(null); setNote(editing === 'new' ? 'Added — the arch loads it from its next turn.' : 'Saved — the arch sees the new text on its next turn.');
      await load();
    } catch (e) {
      setEditError(String(e?.message || e));
    } finally { setSaving(false); }
  };
  const act = async (e, what) => {
    if (what === 'delete' && !window.confirm(`Delete "${e.title}" for good? (Retire keeps it, unloaded, with its history.)`)) return;
    let reason = null;
    if (what === 'retire') { reason = window.prompt('Why is it no longer true? (one line)', 'no longer true'); if (reason === null) return; }
    setBusy(e.id);
    try {
      const id = encodeURIComponent(e.id);
      if (what === 'confirm') await apiPost(`/memory/${id}/confirm`, {});
      else if (what === 'pin') await apiPost(`/memory/${id}/pin`, { pinned: !e.pinned });
      else if (what === 'retire') await apiPost(`/memory/${id}/retire`, { reason });
      else if (what === 'restore') await apiPost(`/memory/${id}/restore`, {});
      else if (what === 'delete') await apiDelete(`/memory/${id}`);
      await load();
    } catch (err) { setError(String(err?.message || err)); } finally { setBusy(''); }
  };
  const saveSettings = async (patch) => {
    try { await apiPut('/memory/settings', patch); await load(); } catch (e) { setError(String(e?.message || e)); }
  };

  if (!data && !error) return <div className="mem mem--empty">Loading the memory store…</div>;
  return (
    <div className="mem" data-memory-tab>
      <div className="mem__head">
        <div className="mem__strip" data-memory-summary>
          <b>🧠 Arch memory</b>
          <span>{s.active} active</span>
          <button type="button" className={`mem__chip${filter.only === 'pinned' ? ' mem__chip--on' : ''}`} onClick={() => set('only', 'pinned')}>{s.always} always loaded</button>
          <button type="button" className={`mem__chip mem__chip--ok${filter.only === 'used' ? ' mem__chip--on' : ''}`} onClick={() => set('only', 'used')} data-memory-filter="used">{s.used} used in the last {data?.settings?.usedWindowTurns ?? 20} turns</button>
          <button type="button" className={`mem__chip mem__chip--warn${filter.only === 'stale' ? ' mem__chip--on' : ''}`} onClick={() => set('only', 'stale')} data-memory-filter="stale">{s.stale} stale</button>
          <button type="button" className={`mem__chip mem__chip--warn${filter.only === 'review' ? ' mem__chip--on' : ''}`} onClick={() => set('only', 'review')} data-memory-filter="review">{s.review} to review</button>
          <span className="mem__dim">{s.retired} retired · writer: {data?.writer || 'this hub'}</span>
        </div>
        <button type="button" className="mem__btn mem__btn--primary" onClick={startNew} data-memory-add>+ Add a principle or fact</button>
      </div>
      {error && <div className="mem__err" role="alert">{error}</div>}
      {note && <div className="mem__ok" role="status" data-memory-note>{note}</div>}
      <div className="mem__filters">
        <input className="mem__in mem__search" placeholder="Search title, text, tags…" value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} data-memory-search />
        <select className="mem__in" value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value })} data-memory-filter-kind>
          <option value="">all kinds</option>
          {KINDS.map((k) => <option key={k} value={k}>{KIND_ICON[k]} {KIND_LABEL[k]}</option>)}
        </select>
        <select className="mem__in" value={filter.author} onChange={(e) => setFilter({ ...filter, author: e.target.value })}>
          <option value="">any author</option>
          {[...new Set(entries.map((e) => authorFamily(e.author)))].map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="mem__in" value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} data-memory-filter-status>
          <option value="active">active</option><option value="retired">retired</option><option value="all">all</option>
        </select>
        <span className="mem__dim">
          STALE after <input className="mem__in mem__num" type="number" min="0" defaultValue={data?.settings?.staleDays ?? 30} onBlur={(e) => saveSettings({ staleDays: Number(e.target.value) })} data-memory-stale-days /> days ·
          "used" = last <input className="mem__in mem__num" type="number" min="1" defaultValue={data?.settings?.usedWindowTurns ?? 20} onBlur={(e) => saveSettings({ usedWindowTurns: Number(e.target.value) })} /> turns
        </span>
      </div>
      {tags.length > 0 && (
        <div className="mem__tags" data-memory-tags>
          {tags.map((t) => <button key={t.tag} type="button" className={`mem__tag mem__tag--btn${filter.tag === t.tag ? ' mem__tag--on' : ''}`} onClick={() => set('tag', t.tag)}>{t.tag} <span className="mem__dim">{t.n}</span></button>)}
        </div>
      )}
      {editing === 'new' && <Editor draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditing(null)} saving={saving} error={editError} isNew />}
      {groups.length === 0 && <div className="mem__dim mem__none">Nothing matches.</div>}
      {groups.map((g) => (
        <section key={g.kind} className="mem__group" data-memory-group={g.kind}>
          <h3 className="mem__group-h">{g.icon} {g.label} <span className="mem__dim">{g.entries.length}{g.kind === 'principle' ? ' · always loaded into every arch turn' : ''}</span></h3>
          <div className="mem__cards">
            {g.entries.map((e) => (editing === e.id
              ? <Editor key={e.id} draft={draft} setDraft={setDraft} onSave={save} onCancel={() => setEditing(null)} saving={saving} error={editError} />
              : <Card key={e.id} e={e} now={data?.now || Date.now()} onEdit={startEdit} act={act} busy={busy === e.id} expanded={!!expanded[e.id]} setExpanded={(v) => setExpanded((x) => ({ ...x, [e.id]: v }))} />))}
          </div>
        </section>
      ))}
    </div>
  );
}
