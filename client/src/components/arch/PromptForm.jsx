import { useState } from 'react';
import { GROUPS, placeholdersOf, segmentsOf } from './archPrompts';

// The add / edit form of one cached prompt (openspec arch-custom-prompts; moved out of the old in-chat panel by
// openspec arch-prompts-tab so the Prompts tab and anything else share it).

export const EMOJIS = ['💬', '🚀', '🛰️', '📝', '📌', '✅', '🔁', '🗑️', '👀', '📊', '🔍', '🎯', '⏰', '📦', '💡', '🐛', '🧱', '🔑', '🤝', '🧹', '🏛️', '❓', '✨', '🧩'];

/** A template with its placeholders drawn as chips. */
export function TemplateText({ text, className = '' }) {
  return (
    <span className={`pt-tpl ${className}`}>
      {segmentsOf(text).map((s, i) => (s.ph
        ? <span key={i} className="pt-tpl__chip" data-template-chip={s.ph}>{s.ph}</span>
        : <span key={i}>{s.text}</span>))}
    </span>
  );
}

export default function PromptForm({ initial, onSave, onCancel, busy }) {
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
      <textarea className="ap__textarea" rows={4} placeholder="the prompt as you would type it — {machine}, {agent}, {task}, {pr}, {url}, {branch}, {text} become fill-in chips" value={text} onChange={(e) => setText(e.target.value)} data-ap-text />
      {ph.length > 0 && <div className="ap__dim">preview: <TemplateText text={text} /></div>}
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
