import { useState } from 'react';
import { GROUPS } from './archPrompts';
import { INPUT_TYPES, STEP_KINDS, applyGeneralisation, undefinedPlaceholders, templateBody } from './goalTemplates';
import { kindWord } from './goalPlan';
import './goalTemplates.css';

// The goal-template editor (openspec arch-goal-templates): name, purpose, typed inputs, the ordered step plan (title,
// done-when, kind), defaults (cap, branch). Used by "Save as template" in the Subagents tab — where `candidates` are
// the goal's concrete names (agents, cards, branches) offered for generalisation into {inputs} — and by the Prompts
// tab's new / edit. `onSave(body)` gets the POST/PUT /api/prompts/templates body.

export default function TemplateEditor({ initial, candidates = [], onSave, onCancel, busy = false, error = '', saveWord = 'Save template' }) {
  const [d, setD] = useState(() => ({ ...initial, inputs: [...(initial.inputs || [])], steps: [...(initial.steps || [])] }));
  const [picked, setPicked] = useState(() => Object.fromEntries(candidates.map((c) => [c.value, true])));
  const [names, setNames] = useState(() => Object.fromEntries(candidates.map((c) => [c.value, c.name])));
  const [applied, setApplied] = useState(candidates.length === 0);
  const set = (k, v) => setD((x) => ({ ...x, [k]: v }));
  const setInput = (i, k, v) => setD((x) => ({ ...x, inputs: x.inputs.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const setStep = (i, k, v) => setD((x) => ({ ...x, steps: x.steps.map((it, j) => (j === i ? { ...it, [k]: v } : it)) }));
  const moveStep = (i, dir) => setD((x) => { const s = [...x.steps]; const j = i + dir; if (j < 0 || j >= s.length) return x; [s[i], s[j]] = [s[j], s[i]]; return { ...x, steps: s }; });
  const generalise = () => {
    const chosen = candidates.filter((c) => picked[c.value]).map((c) => ({ ...c, name: (names[c.value] || c.name).trim().toLowerCase() }));
    setD((x) => applyGeneralisation(x, chosen));
    setApplied(true);
  };
  const missing = undefinedPlaceholders(d);
  return (
    <div className="gt-ed" data-template-editor>
      {candidates.length > 0 && !applied && (
        <div className="gt-ed__gen" data-template-generalise>
          <b>Generalise concrete names into inputs</b>
          <span className="gt-ed__dim">ticked names become {'{inputs}'} everywhere in the purpose and the steps</span>
          {candidates.map((c) => (
            <label key={c.value} className="gt-ed__cand" data-template-candidate={c.value}>
              <input type="checkbox" checked={!!picked[c.value]} onChange={(e) => setPicked((p) => ({ ...p, [c.value]: e.target.checked }))} />
              <code>{c.value}</code> <span className="gt-ed__dim">{c.type} · ×{c.count}</span> → {'{'}<input className="gt-ed__in gt-ed__in--name" value={names[c.value]} onChange={(e) => setNames((n) => ({ ...n, [c.value]: e.target.value }))} />{'}'}
            </label>
          ))}
          <div className="gt-ed__row">
            <button type="button" className="ap__btn ap__btn--primary" onClick={generalise} data-template-generalise-apply>Generalise</button>
            <button type="button" className="ap__btn" onClick={() => setApplied(true)}>Keep the concrete names</button>
          </div>
        </div>
      )}
      <div className="gt-ed__row">
        <input className="gt-ed__in gt-ed__in--wide" placeholder="Template name" value={d.label || ''} onChange={(e) => set('label', e.target.value)} maxLength={80} data-template-field="label" />
        <select className="gt-ed__in" value={d.category || GROUPS[3]} onChange={(e) => set('category', e.target.value)}>{GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}</select>
      </div>
      <textarea className="gt-ed__in gt-ed__area" rows={3} placeholder="Purpose — one paragraph: what the goal achieves; {inputs} in braces" value={d.purpose || ''} onChange={(e) => set('purpose', e.target.value)} data-template-field="purpose" />
      <div className="gt-ed__sec">
        <b>Inputs</b>
        {d.inputs.map((it, i) => (
          <div key={i} className="gt-ed__row" data-template-input={it.name}>
            <span className="gt-ed__brace">{'{'}<input className="gt-ed__in gt-ed__in--name" value={it.name} onChange={(e) => setInput(i, 'name', e.target.value.toLowerCase())} />{'}'}</span>
            <select className="gt-ed__in" value={it.type} onChange={(e) => setInput(i, 'type', e.target.value)}>{INPUT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <input className="gt-ed__in" placeholder="label" value={it.label || ''} onChange={(e) => setInput(i, 'label', e.target.value)} />
            <input className="gt-ed__in" placeholder="default" value={it.default || ''} onChange={(e) => setInput(i, 'default', e.target.value)} />
            <button type="button" className="ap__act ap__act--danger" onClick={() => setD((x) => ({ ...x, inputs: x.inputs.filter((_, j) => j !== i) }))} title="Remove input">×</button>
          </div>
        ))}
        <button type="button" className="ap__btn" onClick={() => setD((x) => ({ ...x, inputs: [...x.inputs, { name: `input${x.inputs.length + 1}`, type: 'text', label: '', default: '' }] }))} data-template-add-input>＋ input</button>
      </div>
      <div className="gt-ed__sec">
        <b>Step plan</b>
        {d.steps.map((s, i) => (
          <div key={i} className="gt-ed__step" data-template-step={i + 1}>
            <span className="gt-ed__num">{i + 1}.</span>
            <input className="gt-ed__in gt-ed__in--wide" placeholder="step title" value={s.title || ''} onChange={(e) => setStep(i, 'title', e.target.value)} />
            <input className="gt-ed__in gt-ed__in--wide" placeholder="done when …" value={s.done || ''} onChange={(e) => setStep(i, 'done', e.target.value)} />
            <select className="gt-ed__in" value={s.kind || 'other'} onChange={(e) => setStep(i, 'kind', e.target.value)}>{STEP_KINDS.map((k) => <option key={k} value={k}>{kindWord(k)}</option>)}</select>
            <button type="button" className="ap__act" onClick={() => moveStep(i, -1)} disabled={i === 0}>↑</button>
            <button type="button" className="ap__act" onClick={() => moveStep(i, 1)} disabled={i === d.steps.length - 1}>↓</button>
            <button type="button" className="ap__act ap__act--danger" onClick={() => setD((x) => ({ ...x, steps: x.steps.filter((_, j) => j !== i) }))} title="Remove step">×</button>
          </div>
        ))}
        <button type="button" className="ap__btn" onClick={() => setD((x) => ({ ...x, steps: [...x.steps, { title: '', done: '', kind: 'send' }] }))} data-template-add-step>＋ step</button>
      </div>
      <div className="gt-ed__row">
        <label className="gt-ed__dim">cap <input className="gt-ed__in gt-ed__in--num" type="number" min="1" value={d.maxIterations || ''} onChange={(e) => set('maxIterations', e.target.value)} data-template-field="cap" /></label>
        <label className="gt-ed__dim">branch <input className="gt-ed__in" value={d.branch || ''} onChange={(e) => set('branch', e.target.value)} placeholder="e.g. {branch}" /></label>
        {d.sourceGoalId && <span className="gt-ed__dim">captured from goal <code>{d.sourceGoalId}</code></span>}
      </div>
      {missing.length > 0 && <div className="gt-ed__warn" data-template-undefined>Used but not defined as inputs: {missing.map((n) => `{${n}}`).join(', ')}</div>}
      {error && <div className="ap__note ap__note--err" data-template-error>{error}</div>}
      <div className="gt-ed__row">
        <button type="button" className="ap__btn ap__btn--primary" disabled={busy} onClick={() => onSave(templateBody(d))} data-template-save>{busy ? 'Saving…' : saveWord}</button>
        <button type="button" className="ap__btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
