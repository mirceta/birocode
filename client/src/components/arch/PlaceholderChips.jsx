import { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../api/client';
import { placeholdersOf, fillPlaceholder, placeholderKind, optionsFor, kindHint } from './archPrompts';

// Fill-in CHIPS for the arch composer (openspec arch-custom-prompts): while the draft holds
// placeholders — `{machine}`, `{agent}`, `{task}`, `{pr}`, `{url}`, `{branch}`, `{text}` from a
// cached prompt — a strip above the textarea shows one chip per placeholder with an input;
// machines, agents, branches come from the arch state (list_machines / list_agents data),
// cards from the task graph (fetched when a {task} chip appears); the rest is free text.
// Filling replaces every occurrence in the draft; the draft stays the single source of truth
// (edit it by hand and the chips follow).

export default function PlaceholderChips({ draft, onChange, state }) {
  const names = useMemo(() => placeholdersOf(draft), [draft]);
  const [values, setValues] = useState({});
  const [tasks, setTasks] = useState(null);
  const needsTasks = names.some((n) => placeholderKind(n) === 'task');
  useEffect(() => {
    if (!needsTasks || tasks !== null) return;
    apiGet('/taskgraph').then((g) => setTasks((g?.nodes || []).filter((n) => n.status !== 'done'))).catch(() => setTasks([]));
  }, [needsTasks, tasks]);
  if (names.length === 0) return null;
  const ctx = { selfLabel: state?.fleet?.selfLabel, sources: state?.fleet?.sources || [], agents: state?.agents || [], tasks: tasks || [] };
  const fill = (name) => {
    const v = (values[name] ?? '').trim();
    if (!v) return;
    onChange(fillPlaceholder(draft, name, v));
    setValues((cur) => { const n = { ...cur }; delete n[name]; return n; });
  };
  const fillAll = () => {
    let next = draft;
    for (const n of names) { const v = (values[n] ?? '').trim(); if (v) next = fillPlaceholder(next, n, v); }
    onChange(next);
    setValues({});
  };
  const ready = names.filter((n) => (values[n] ?? '').trim()).length;
  return (
    <div className="pc" data-placeholder-chips={names.length}>
      <span className="pc__lead">Fill in:</span>
      {names.map((name) => {
        const kind = placeholderKind(name);
        const options = optionsFor(kind, ctx);
        const listId = `pc-opts-${name.replace(/[^a-z0-9]/gi, '-')}`;
        return (
          <label key={name} className={`pc__chip pc__chip--${kind}`} data-placeholder={name} data-placeholder-kind={kind}>
            <span className="pc__name">{`{${name}}`}</span>
            <input
              className="pc__input"
              type={kind === 'number' ? 'number' : 'text'}
              list={options.length ? listId : undefined}
              placeholder={kindHint(kind)}
              value={values[name] ?? ''}
              onChange={(e) => setValues((cur) => ({ ...cur, [name]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); fill(name); } }}
              data-placeholder-input={name}
            />
            {options.length > 0 && <datalist id={listId}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</datalist>}
            <button type="button" className="pc__fill" onClick={() => fill(name)} disabled={!(values[name] ?? '').trim()} title="Put this value into the draft" data-placeholder-fill={name}>✓</button>
          </label>
        );
      })}
      {names.length > 1 && <button type="button" className="pc__all" onClick={fillAll} disabled={ready === 0} data-placeholder-fill-all>fill {ready}/{names.length}</button>}
    </div>
  );
}
