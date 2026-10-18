import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { optionsFor, kindHint } from './archPrompts';
import { pickKindOf, previewGoal, composeArchMessage, startRequest, missingInputs } from './goalTemplates';
import { handoffToArch, openManageTab } from './archHandoff';
import GoalPlanPanel from './GoalPlanPanel';
import './goalTemplates.css';

// Using a goal template (openspec arch-goal-templates): the inputs on the left — agents, machines, branches, cards and
// goals pick from the live fleet / board / goals like the Prompts tab's placeholders — and on the right the plan as
// the Subagents stepper, updated live as the inputs fill. "Send to Arch chat" puts the filled template into the arch
// composer as structured text (purpose, inputs, defaults, STEP lines) to discuss before "start it"; "Start now"
// starts the goal directly with the declared plan, the arch named as its starter.

export default function TemplateSheet({ template, onClose, onDone }) {
  const [values, setValues] = useState({});
  const [ctx, setCtx] = useState({ sources: [], agents: [], tasks: [], goals: [] });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    apiGet('/arch').then((s) => setCtx((c) => ({ ...c, selfLabel: s?.fleet?.selfLabel, sources: s?.fleet?.sources || [], agents: s?.agents || [] }))).catch(() => {});
    const types = (template.inputs || []).map((i) => i.type);
    if (types.includes('task')) apiGet('/taskgraph').then((g) => setCtx((c) => ({ ...c, tasks: (g?.nodes || []).filter((n) => n.status !== 'done') }))).catch(() => {});
    if (types.includes('goal')) apiGet('/arch/conversations').then((r) => setCtx((c) => ({ ...c, goals: (r?.conversations || []).map((x) => x.goal).filter(Boolean) }))).catch(() => {});
  }, [template]);
  const preview = useMemo(() => previewGoal(template, values), [template, values]);
  const missing = missingInputs(template, values);
  const used = () => apiPost(`/prompts/${template.id}/used`, {}).catch(() => {});
  const sendToChat = async () => {
    await used();
    handoffToArch(composeArchMessage(template, values));
    onDone?.('The filled template is in the Arch chat composer — discuss it with the arch, then say "start it".');
  };
  const startNow = async () => {
    const { body, problems } = startRequest(template, values, ctx.agents);
    if (problems.length) { setError(problems.join(' · ')); return; }
    if (!window.confirm(`Start a goal now from "${template.label}" with its ${body.steps.length}-step plan?`)) return;
    setBusy(true); setError('');
    try {
      const r = await apiPost('/arch/goals', body);
      await used();
      onDone?.(`Started goal ${r?.goal?.id || ''} — it runs in the Subagents tab with the declared plan.`, r?.goal);
      openManageTab('subagents');
    } catch (e) { setError(e?.message || String(e)); } finally { setBusy(false); }
  };
  return (
    <div className="gt-sheet" data-template-sheet={template.id}>
      <div className="gt-sheet__h"><b>{template.emoji || '🧭'} {template.label}</b><button type="button" className="ap__btn" onClick={onClose} aria-label="close">✕</button></div>
      <div className="gt-sheet__grid">
        <div className="gt-sheet__inputs">
          {(template.inputs || []).map((i) => {
            const kind = pickKindOf(i.type);
            const options = optionsFor(kind, ctx);
            const listId = `gt-${template.id}-${i.name}`;
            return (
              <label key={i.name} className="gt-sheet__field" data-template-field-input={i.name} data-template-field-type={i.type}>
                <span><span className="pt-tpl__chip">{i.name}</span> <span className="gt-ed__dim">{i.label || kindHint(kind)}</span></span>
                <input className="gt-ed__in" list={options.length ? listId : undefined} type={i.type === 'number' ? 'number' : 'text'} placeholder={i.default ? `default: ${i.default}` : kindHint(kind)}
                  value={values[i.name] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [i.name]: e.target.value }))} data-template-value={i.name} />
                {options.length > 0 && <datalist id={listId}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</datalist>}
              </label>
            );
          })}
          <div className="gt-ed__dim">defaults: {template.maxIterations ? `cap ${template.maxIterations}` : 'no cap'}{template.branch ? ` · branch ${template.branch}` : ''}{template.sourceGoalId ? ` · from goal ${template.sourceGoalId}` : ''}</div>
        </div>
        <div className="gt-sheet__preview" data-template-preview>
          <div className="gt-sheet__purpose" data-template-purpose>{preview.goal}</div>
          <GoalPlanPanel goal={preview} preview />
        </div>
      </div>
      {error && <div className="ap__note ap__note--err" data-template-sheet-error>{error}</div>}
      <div className="ap__form-row">
        <button type="button" className="ap__btn ap__btn--primary" onClick={sendToChat} disabled={busy} title="Insert the filled template into the Arch chat composer (not sent) — discuss and adjust the plan, then say start it" data-template-send-chat>💬 Send to Arch chat</button>
        <button type="button" className="ap__btn" onClick={startNow} disabled={busy} title="Start the goal now with this plan (the arch named as its starter)" data-template-start>{busy ? 'Starting…' : '▶ Start now'}</button>
        {missing.length > 0 && <span className="ap__dim">still empty: {missing.map((n) => `{${n}}`).join(', ')}</span>}
      </div>
    </div>
  );
}
