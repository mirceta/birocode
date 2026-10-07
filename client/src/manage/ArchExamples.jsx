import { useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../api/client';
import { filterCategories, chartBars, sparkline, sourceLine, copyText, day } from './archExamplesModel';
import './archExamples.css';

// Arch examples (openspec arch-examples-tab, fleet task 7914195c): what the Operator actually asks
// the arch agent for, mined from every arch conversation on the hub (the Arch agent chat, the goal
// conversations, the repo-agent requests) and clustered into request categories — a bar chart of
// how often each occurs, a sparkline of requests over time, and one card per category with the
// template prompt (copyable), real examples, the tools the arch uses and a phrasing tip. The data
// is GET /api/arch/examples: the hub's own mining run, or the snapshot committed with the harness
// on a machine without arch conversations. Re-mine runs the extraction again (hub only).

function Bars({ categories, onPick, picked }) {
  const bars = chartBars(categories);
  return (
    <div className="ax__bars" role="list" aria-label="Requests by category">
      {bars.map((b) => (
        <button type="button" key={b.id} role="listitem" className={`ax__bar${picked === b.id ? ' ax__bar--on' : ''}`} onClick={() => onPick(picked === b.id ? null : b.id)} title={`${b.name}: ${b.count}`} data-bar={b.id}>
          <span className="ax__bar-name">{b.name}</span>
          <span className="ax__bar-track"><span className={`ax__bar-fill${b.endsInGoal ? ' ax__bar-fill--goal' : ''}`} style={{ width: `${b.pct}%` }} /></span>
          <span className="ax__bar-n">{b.count}</span>
        </button>
      ))}
    </div>
  );
}

function Spark({ buckets }) {
  const s = sparkline(buckets);
  if (!s.points) return null;
  return (
    <div className="ax__spark" title={`${s.total} requests from ${s.first} to ${s.last}; busiest week ${s.max}`} data-spark>
      <svg viewBox="0 0 260 36" width="260" height="36" aria-label="Requests per week"><polyline points={s.points} fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
      <span className="ax__dim">{s.first} → {s.last} · {s.total} requests · peak {s.max}/week</span>
    </div>
  );
}

function CopyButton({ text, id }) {
  const [state, setState] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setState('copied'); } catch { setState('failed'); }
    setTimeout(() => setState(''), 1500);
  };
  return <button type="button" className="fs__btn ax__copy" onClick={copy} disabled={!text} data-copy={id} title="Copy the template prompt — paste it into the Arch agent chat">{state === 'copied' ? '✓ copied' : state === 'failed' ? 'copy failed' : '⎘ copy prompt'}</button>;
}

function Category({ c }) {
  return (
    <article className="ax__cat" data-category={c.id}>
      <header className="ax__cat-h">
        <h4 className="ax__cat-name">{c.name}</h4>
        <span className="ax__count" title="how many times the Operator asked for this">{c.count}×</span>
        {c.endsInGoal && <span className="ax__pill ax__pill--goal" title="usually ends in a goal conversation the arch drives">goal conversation</span>}
      </header>
      <p className="ax__desc">{c.description}</p>
      {c.template && (
        <div className="ax__template">
          <pre className="ax__pre" data-template={c.id}>{c.template}</pre>
          <CopyButton text={copyText(c)} id={c.id} />
        </div>
      )}
      {c.tip && <p className="ax__tip"><b>How to phrase it:</b> {c.tip}</p>}
      {(c.examples || []).length > 0 && (
        <ul className="ax__examples">
          {c.examples.map((e, i) => <li key={i} data-example={c.id}><q>{e.text}</q> <span className="ax__dim">— {day(e.at)}{e.source && e.source !== 'arch-chat' ? ` · ${e.source}` : ''}</span></li>)}
        </ul>
      )}
      <footer className="ax__cat-f">
        {(c.tools || []).length > 0 && <span className="ax__tools">tools: {c.tools.map((t) => <code key={t}>{t}</code>)}</span>}
        {c.firstSeen && <span className="ax__dim">first {day(c.firstSeen)} · last {day(c.lastSeen)}</span>}
      </footer>
    </article>
  );
}

export default function ArchExamples() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState(null);
  const [mining, setMining] = useState(false);
  const [note, setNote] = useState('');
  const load = () => apiGet('/arch/examples').then((d) => { setData(d); setError(''); }).catch((e) => setError(String(e?.message || e)));
  useEffect(() => { load(); }, []);
  const remine = async () => {
    setMining(true); setNote('');
    try {
      const r = await apiPost('/arch/examples/mine', {});
      setNote(r?.detail || 'mined');
      await load();
    } catch (e) { setNote(String(e?.message || e)); }
    setMining(false);
  };
  const cats = data?.categories || [];
  const shown = useMemo(() => {
    const f = filterCategories(cats, q);
    return picked ? f.filter((c) => c.id === picked) : f;
  }, [cats, q, picked]);
  return (
    <div className="ax" data-arch-examples>
      <div className="fs__bar ax__head">
        <div className="ax__title"><b>Arch examples</b> <span className="ax__dim">what the Operator asks the arch agent for — mined from the real conversations, clustered into request templates</span></div>
        <div className="ax__actions">
          {data?.canMine
            ? <button type="button" className="fs__btn" onClick={remine} disabled={mining} data-remine title="Mine every arch conversation on this hub again">{mining ? 'mining…' : '↻ Re-mine'}</button>
            : <span className="ax__dim" title="Mining reads the arch conversations, which live on the hub">re-mine on the hub</span>}
        </div>
      </div>
      {data && <p className="ax__source" data-source={data.source}>{sourceLine(data)}{data.totals ? ` ${data.totals.requests} requests in ${data.totals.categories} categories; ${data.totals.other} in "other".` : ''}</p>}
      {note && <p className="fs__note" data-remine-note>{note}</p>}
      {error && <div className="fs__note fs__note--err">{error}</div>}
      {!data && !error && <div className="fs__note">Loading the arch examples…</div>}
      {data && (
        <div className="ax__chart">
          <Bars categories={cats} onPick={setPicked} picked={picked} />
          <Spark buckets={data.timeline} />
        </div>
      )}
      {data && (
        <div className="fs__bar ax__filter">
          <input className="fs__search" type="search" placeholder="Search the catalogue — deploy, card, loop, files…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search examples" data-search />
          {picked && <button type="button" className="fs__clear" onClick={() => setPicked(null)} data-unpick>× all categories</button>}
          <span className="ax__dim">{shown.length} of {cats.length} categories</span>
        </div>
      )}
      {data && shown.length === 0 && <div className="fs__note">Nothing matches — clear the search.</div>}
      <div className="ax__cats">{shown.map((c) => <Category key={c.id} c={c} />)}</div>
    </div>
  );
}
