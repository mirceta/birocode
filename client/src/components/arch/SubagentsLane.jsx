import { useMemo, useState } from 'react';
import { apiPost } from '../../api/client';
import SubagentsPanel from './SubagentsPanel';
import SubagentTranscript from './SubagentTranscript';
import { repoOwner } from './subagentOwner';
import './subagents.css';

// The dock's Subagents lane (openspec repo-agent-subagents): the SAME panel as the Management
// Subagents tab, with this repo agent as the owner — the vertical selector with status circles,
// the step-plan stepper with mark ▾ / the NEEDS_HUMAN answer box / Continue, stop, hide — and the
// selected subagent's own transcript. A small start form lets the Operator open a subagent by
// hand (the agent's start_subagent tool does the same); the dock tab is the parent, so the
// summary lands in this dock's conversation.

export default function SubagentsLane({ repoId, repoName, tabId, onCounts = null }) {
  const owner = useMemo(() => repoOwner(repoId, repoName), [repoId, repoName]);
  const [open, setOpen] = useState(false);
  const [goal, setGoal] = useState('');
  const [cap, setCap] = useState(10);
  const [readOnly, setReadOnly] = useState(false);
  const [concurrent, setConcurrent] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [select, setSelect] = useState(null);

  const start = async () => {
    if (!goal.trim()) return;
    setBusy(true); setNote('…');
    try {
      const r = await apiPost('/subagents', { repoId, goal: goal.trim(), maxIterations: Number(cap) || 10, readOnly, concurrent: !readOnly && concurrent, tabId });
      setNote(r?.detail || r?.status || r?.error || 'ok');
      if (r?.ok) { setGoal(''); setOpen(false); if (r?.subagent?.id) setSelect(r.subagent.id); }
    } catch (e) { setNote(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const header = (
    <div className="sa__start" data-subagent-start>
      <button type="button" className="sa__act" onClick={() => setOpen((v) => !v)} aria-expanded={open} data-subagent-start-toggle>{open ? '× close' : '＋ new subagent'}</button>
      {open && (
        <div className="sa__start-form">
          <textarea rows={4} value={goal} onChange={(e) => setGoal(e.target.value)} data-subagent-goal
            placeholder={'The goal, self-contained. STEP lines become the plan:\nSTEP 1 — run the tests — done: the summary line\nSTEP 2 — write the result to notes/tests.md — done: the file exists'} />
          <div className="sa__start-row">
            <label className="sa__dim">cap <input type="number" min={1} max={30} value={cap} onChange={(e) => setCap(e.target.value)} data-subagent-cap /></label>
            <label className="sa__dim" title="A read-only helper investigates and reports; it never modifies the checkout and may run while the agent works"><input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} data-subagent-readonly /> read-only helper</label>
            <label className="sa__dim" title="A writer that runs at the same time as the agent, with no lock — only when you are sure its files do not overlap the agent's own work"><input type="checkbox" checked={concurrent && !readOnly} disabled={readOnly} onChange={(e) => setConcurrent(e.target.checked)} data-subagent-concurrent /> runs alongside (no overlap)</label>
            <button type="button" className="gp__btn gp__btn--primary" onClick={start} disabled={busy || !goal.trim()} data-subagent-start-go>Start</button>
          </div>
        </div>
      )}
      {note && <div className="sa__dim sa__note" data-subagent-start-note>{note}</div>}
    </div>
  );

  return (
    <div className="sa-lane" data-subagents-lane={repoId}>
      <SubagentsPanel
        owner={owner}
        select={select}
        header={header}
        onRows={(_, r) => onCounts?.(r?.counts || null)}
        renderConversation={(row, reload) => <SubagentTranscript key={row.id} row={row} onChanged={reload} />}
      />
    </div>
  );
}
