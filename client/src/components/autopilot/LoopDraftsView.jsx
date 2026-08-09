import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPut } from '../../api/client';

// The 📝 Drafts root (openspec: add-loop-drafts) — "fill the loop": one draft
// per (registered repo, type) where the operator and pasted agents build up task
// text before it becomes real loop parameters. Three fixed types; plain
// textareas with EXPLICIT Save/Reload (no autosave — an agent may write the same
// draft mid-edit, and Reload is the deliberate "take theirs"). Deliberately NOT
// fenced by the operator gate, same stance as the briefing editor: idea capture
// with no send path. The repo subtab row lives here (not in the console) because
// it is dynamic — it mirrors /api/autopilot/drafts, which joins the registry.
const TYPES = [
  ['queue-plan', '🗒️ Queue plan'],
  ['goal', '🎯 Goal'],
  ['freestyle', '✍️ Freestyle'],
];

const stamp = (ms) => (ms ? new Date(ms).toLocaleString() : 'never');

export default function LoopDraftsView({ activeRepo, onPickRepo }) {
  const [repos, setRepos] = useState(null); // [{ id, name, types: { type: { nonEmpty, savedAt } } }]
  const [type, setType] = useState('queue-plan');
  const [text, setText] = useState('');
  const [savedAt, setSavedAt] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadSummary = useCallback(async () => {
    try {
      setRepos((await apiGet('/autopilot/drafts')).repos);
      setError('');
    } catch {
      setError('Could not load the drafts list.');
    }
  }, []);
  useEffect(() => { loadSummary(); }, [loadSummary]);

  // The console remembers the picked repo across visits; an unknown or empty
  // memory falls back to the first registered repo.
  const repoId = repos?.some((r) => r.id === activeRepo) ? activeRepo : (repos?.[0]?.id ?? '');
  const repo = repos?.find((r) => r.id === repoId);

  const loadDraft = useCallback(async (rid, t) => {
    if (!rid) return;
    try {
      const d = await apiGet(`/autopilot/drafts/${encodeURIComponent(rid)}/${t}`);
      setText(d.text);
      setSavedAt(d.savedAt);
      setDirty(false);
      setError('');
    } catch {
      setError('Could not load the draft.');
    }
  }, []);
  useEffect(() => { loadDraft(repoId, type); }, [repoId, type, loadDraft]);

  const save = useCallback(async () => {
    setBusy(true);
    try {
      const d = await apiPut(`/autopilot/drafts/${encodeURIComponent(repoId)}/${type}`, { text });
      setSavedAt(d.savedAt);
      setDirty(false);
      setError('');
      loadSummary(); // refresh the non-empty badges
    } catch {
      setError('Could not save the draft.');
    } finally {
      setBusy(false);
    }
  }, [repoId, type, text, loadSummary]);

  if (!repos) return <p className="autopilot__summary">{error || 'Loading drafts…'}</p>;
  if (!repos.length) return <p className="autopilot__summary">No repos registered yet — add one in the Projects tab.</p>;

  return (
    <>
      <nav className="ap-subtabs" aria-label="Draft repos">
        {repos.map((r) => (
          <button key={r.id} className={r.id === repoId ? 'on' : ''} onClick={() => onPickRepo(r.id)}>
            {r.name}
          </button>
        ))}
      </nav>

      <p className="autopilot__summary">
        Fill the loop: draft tasks here — or paste the homepage&apos;s <b>Fill the loop</b> prompt
        into any agent and let it write this draft via the API — then shape the result into a
        queue or a goal loop when it&apos;s ready. One draft per repo and type; saving replaces
        the whole text.
      </p>

      <div className="ld-typerow" role="tablist" aria-label="Draft type">
        {TYPES.map(([key, label]) => (
          <button
            key={key}
            className={`ld-type${type === key ? ' on' : ''}`}
            onClick={() => setType(key)}
          >
            {label}
            {repo?.types?.[key]?.nonEmpty && <span className="ld-type__dot" title="Has content">●</span>}
          </button>
        ))}
      </div>

      {error && <p className="ld-error" role="alert">{error}</p>}

      <textarea
        className="ld-editor"
        value={text}
        onChange={(e) => { setText(e.target.value); setDirty(true); }}
        placeholder={
          type === 'queue-plan'
            ? 'One self-contained prompt per block, blocks separated by a line with just ---'
            : type === 'goal'
              ? 'One coherent goal definition for a goal-based loop'
              : 'Anything — raw task ideas to split into a queue plan or a goal later'
        }
        spellCheck={false}
      />

      <div className="ld-actions">
        <button className="ld-save" onClick={save} disabled={busy || !dirty}>Save</button>
        <button className="ld-reload" onClick={() => { loadDraft(repoId, type); loadSummary(); }} disabled={busy}>
          Reload
        </button>
        <span className="ld-stamp">
          {dirty ? 'Unsaved changes · ' : ''}last saved: {stamp(savedAt)}
        </span>
      </div>
    </>
  );
}
