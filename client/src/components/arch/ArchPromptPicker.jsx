import { useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { OWNER, filterPrompts, byUse, preview } from './archPrompts';
import { TemplateText } from './PromptForm';
import { openManageTab } from './archHandoff';
import './archPrompts.css';

// The Arch composer's ONE prompts affordance (openspec arch-prompts-tab): a "📋 Prompts" button that opens a small
// searchable list of the cached prompts, most used first; a click puts the prompt into the composer (where the
// placeholder chips fill it). Managing the library — add, edit, reorder, re-seed — lives on the Management
// dashboard's Prompts tab, linked from here. Replaces the large in-chat panel.

export default function ArchPromptPicker({ onInsert, manageLink = true }) {
  const [open, setOpen] = useState(false);
  const [prompts, setPrompts] = useState(null);
  const [q, setQ] = useState('');
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    apiGet(`/prompts?owner=${OWNER}`).then((l) => setPrompts(Array.isArray(l) ? l : [])).catch(() => setPrompts([]));
    const onDoc = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, [open]);
  const shown = useMemo(() => byUse(filterPrompts(prompts || [], q)).slice(0, 40), [prompts, q]);
  const pick = (p) => {
    onInsert?.(p.text);
    apiPost(`/prompts/${p.id}/used`, {}).catch(() => { /* counting is best effort */ });
    setOpen(false); setQ('');
  };
  return (
    <span className="app" ref={box} data-arch-prompt-picker>
      <button type="button" className="arch__btn" onClick={() => setOpen((v) => !v)} aria-expanded={open} title="Insert one of your cached prompts" data-arch-prompts-button>📋 Prompts</button>
      {open && (
        <div className="app__pop" role="dialog" aria-label="Cached prompts" data-arch-prompt-popover>
          <input className="app__search" autoFocus type="search" placeholder="search your prompts…" value={q} onChange={(e) => setQ(e.target.value)} data-arch-prompt-search />
          <div className="app__list">
            {prompts === null && <div className="app__dim">Loading…</div>}
            {prompts !== null && shown.length === 0 && <div className="app__dim">{prompts.length ? 'Nothing matches.' : 'No prompts yet — open the Prompts tab to seed them.'}</div>}
            {shown.map((p) => (
              <button type="button" key={p.id} className="app__item" onClick={() => pick(p)} title={p.text} data-arch-prompt-pick={p.id}>
                <span className="app__label">{p.emoji || '💬'} {p.label || preview(p.text, 50)}</span>
                <span className="app__text"><TemplateText text={preview(p.text, 140)} /></span>
              </button>
            ))}
          </div>
          {manageLink && <button type="button" className="app__manage" onClick={() => { setOpen(false); openManageTab('prompts'); }} data-arch-prompts-manage>Manage prompts in the Prompts tab →</button>}
        </div>
      )}
    </span>
  );
}
