import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../api/client';
import { useRepo } from '../context/RepoContext';
import './loopEvals.css';

// Operator-facing golden-example curation (openspec: loop-evals, tasks §4.2).
// Sources: the selected repo's stored conversations + a repo COPY's git history.
// Flow: pick conversation -> mark span -> pair turns with commits -> label ->
// author plan + acceptance checks -> export the bundle. Read-only toward the
// sources; export writes only into the examples root.

const LABELS = ['instruct', 'course-correct', 'approve', 'verify-ask', 'unblock'];

const short = (sha) => (sha || '').slice(0, 8);

export default function LoopEvals() {
  const { current } = useRepo();

  const [convos, setConvos] = useState([]);
  const [convoId, setConvoId] = useState('');
  const [turns, setTurns] = useState([]);
  const [copyPath, setCopyPath] = useState('');
  const [commits, setCommits] = useState([]); // oldest first (display order)
  const [span, setSpan] = useState({ start: null, end: null });
  const [assoc, setAssoc] = useState({}); // turn index -> commit sha
  const [labels, setLabels] = useState({}); // turn index -> label
  const [pairTurn, setPairTurn] = useState(null);

  const [plan, setPlan] = useState('');
  const [checks, setChecks] = useState([{ name: '', command: '' }]);
  const [exampleId, setExampleId] = useState('');
  const [description, setDescription] = useState('');
  const [overwrite, setOverwrite] = useState(false);

  const [examplesRoot, setExamplesRoot] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    apiGet('/loop-evals/config').then((c) => setExamplesRoot(c.examplesRoot)).catch(() => {});
  }, []);

  useEffect(() => {
    setConvos([]);
    setConvoId('');
    setTurns([]);
    setSpan({ start: null, end: null });
    setAssoc({});
    setLabels({});
    setError('');
    if (!current) return;
    setCopyPath((p) => p || current.path || '');
    apiGet('/loop-evals/conversations')
      .then(setConvos)
      .catch((e) => setError(e?.message || 'failed to list conversations'));
  }, [current?.id]);

  const loadTurns = async (id) => {
    setConvoId(id);
    setTurns([]);
    setSpan({ start: null, end: null });
    setAssoc({});
    setLabels({});
    setPairTurn(null);
    if (!id) return;
    try {
      setTurns(await apiGet(`/loop-evals/conversations/${encodeURIComponent(id)}`));
    } catch (e) {
      setError(e?.message || 'failed to load turns');
    }
  };

  const loadCommits = async () => {
    setError('');
    try {
      const list = await apiGet(`/loop-evals/commits?path=${encodeURIComponent(copyPath)}`);
      setCommits([...list].reverse()); // server is newest-first; pair oldest-first
    } catch (e) {
      setCommits([]);
      setError(e?.message || 'failed to load commits');
    }
  };

  const inSpan = (i) =>
    (span.start === null || i >= span.start) && (span.end === null || i <= span.end);

  const pair = (sha) => {
    if (pairTurn === null) return;
    setAssoc((a) => {
      const next = { ...a };
      // one commit belongs to one turn — stealing it moves it
      for (const k of Object.keys(next)) if (next[k] === sha) delete next[k];
      next[pairTurn] = sha;
      return next;
    });
    setPairTurn(null);
  };

  const spanTurns = useMemo(
    () => turns.filter((t) => inSpan(t.index)),
    [turns, span]
  );

  const doExport = async () => {
    setBusy(true);
    setResult(null);
    setError('');
    try {
      const body = {
        exampleId,
        description,
        repoCopyPath: copyPath,
        planText: plan,
        checks: checks.filter((c) => c.name.trim() && c.command.trim()),
        turns: spanTurns.map((t) => ({
          role: t.role,
          text: t.text,
          label: labels[t.index] || null,
          commitSha: assoc[t.index] || null,
        })),
        seedMode: 'plan',
        seedItems: null,
        overwrite,
      };
      setResult(await apiPost('/loop-evals/export', body));
    } catch (e) {
      setError(e?.message || 'export failed');
    } finally {
      setBusy(false);
    }
  };

  const associatedCount = spanTurns.filter((t) => assoc[t.index]).length;

  return (
    <div className="le">
      <div className="le__setup">
        <label>
          Conversation ({current?.name || 'no repo'})
          <select value={convoId} onChange={(e) => loadTurns(e.target.value)}>
            <option value="">— pick a stored conversation —</option>
            {convos.map((c) => (
              <option key={c.id} value={c.id}>
                {(c.firstPrompt || c.title || c.id).slice(0, 70)} · {c.turnCount} turns
              </option>
            ))}
          </select>
        </label>
        <label>
          Repo copy path (its git history is the association target)
          <span className="le__pathrow">
            <input
              value={copyPath}
              onChange={(e) => setCopyPath(e.target.value)}
              placeholder="C:\\path\\to\\repo-copy"
            />
            <button onClick={loadCommits} disabled={!copyPath.trim()}>Load commits</button>
          </span>
        </label>
      </div>

      {error && <div className="le__error">{error}</div>}

      <div className="le__columns">
        <section className="le__col">
          <h3>
            Turns {turns.length > 0 && `(span: ${span.start ?? 'start'} → ${span.end ?? 'end'})`}
          </h3>
          {turns.length === 0 && <p className="le__empty">Pick a conversation.</p>}
          {turns.map((t) => (
            <div
              key={t.index}
              className={
                'le__turn' +
                (inSpan(t.index) ? '' : ' le__turn--out') +
                (pairTurn === t.index ? ' le__turn--pairing' : '')
              }
            >
              <div className="le__turnhead">
                <span className="le__role">{t.index} · {t.role}</span>
                <span className="le__turnbtns">
                  <button title="span starts here" onClick={() => setSpan((s) => ({ ...s, start: t.index }))}>[</button>
                  <button title="span ends here" onClick={() => setSpan((s) => ({ ...s, end: t.index }))}>]</button>
                  <button
                    title="pair with a commit"
                    className={pairTurn === t.index ? 'le__on' : ''}
                    onClick={() => setPairTurn(pairTurn === t.index ? null : t.index)}
                    disabled={!inSpan(t.index)}
                  >
                    ⇄
                  </button>
                </span>
              </div>
              <div className="le__text">{t.text}</div>
              {inSpan(t.index) && (
                <div className="le__turnmeta">
                  <input
                    list="le-labels"
                    placeholder="label…"
                    value={labels[t.index] || ''}
                    onChange={(e) => setLabels((l) => ({ ...l, [t.index]: e.target.value }))}
                  />
                  {assoc[t.index] ? (
                    <span className="le__sha">
                      {short(assoc[t.index])}
                      <button onClick={() => setAssoc((a) => { const n = { ...a }; delete n[t.index]; return n; })}>×</button>
                    </span>
                  ) : (
                    <span className="le__nosha">carries previous state</span>
                  )}
                </div>
              )}
            </div>
          ))}
          <datalist id="le-labels">
            {LABELS.map((l) => <option key={l} value={l} />)}
          </datalist>
        </section>

        <section className="le__col">
          <h3>Commits (oldest first)</h3>
          {commits.length === 0 && <p className="le__empty">Load a repo copy's history.</p>}
          {commits.map((c) => {
            const owner = Object.entries(assoc).find(([, sha]) => sha === c.sha)?.[0];
            return (
              <div
                key={c.sha}
                className={'le__commit' + (owner !== undefined ? ' le__commit--used' : '')}
                onClick={() => pair(c.sha)}
                title={pairTurn !== null ? `associate with turn ${pairTurn}` : 'select a turn (⇄) first'}
              >
                <span className="le__sha">{short(c.sha)}</span>
                <span className="le__subject">{c.subject}</span>
                {owner !== undefined && <span className="le__owner">turn {owner}</span>}
                <div className="le__files">{(c.files || []).join(', ')}</div>
              </div>
            );
          })}
        </section>
      </div>

      <section className="le__author">
        <h3>Plan & acceptance checks</h3>
        <textarea
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          placeholder="plan.md — the task statement the loop will be seeded with"
          rows={5}
        />
        {checks.map((c, i) => (
          <div key={i} className="le__check">
            <input
              value={c.name}
              placeholder="check name"
              onChange={(e) => setChecks((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <input
              value={c.command}
              placeholder="command (must exit 0 in the final working copy)"
              onChange={(e) => setChecks((cs) => cs.map((x, j) => (j === i ? { ...x, command: e.target.value } : x)))}
            />
            <button onClick={() => setChecks((cs) => cs.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        <button onClick={() => setChecks((cs) => [...cs, { name: '', command: '' }])}>+ check</button>
      </section>

      <section className="le__export">
        <h3>Export</h3>
        <div className="le__exportrow">
          <input value={exampleId} onChange={(e) => setExampleId(e.target.value)} placeholder="example-id (lowercase)" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="description" />
          <label className="le__ovr">
            <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)} />
            overwrite
          </label>
          <button
            className="le__go"
            disabled={busy || !exampleId.trim() || spanTurns.length === 0 || associatedCount === 0}
            onClick={doExport}
          >
            {busy ? 'Exporting…' : 'Export bundle'}
          </button>
        </div>
        <p className="le__hint">
          {spanTurns.length} turns in span, {associatedCount} associated → golden chain of {associatedCount} commits.
          Bundles land in <code>{examplesRoot || '…'}</code>. The bundle contains full repo history
          from eval/start forward — keep real captures out of committed repos.
        </p>
        {result && (
          <div className="le__done">
            Exported to <code>{result.exampleDir}</code> — {result.goldenCommits} golden commits,{' '}
            {result.turnCount} turns, start {short(result.startSha)} → final {short(result.finalSha)}.
          </div>
        )}
      </section>
    </div>
  );
}
