import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../api/client';
import { useRepo } from '../context/RepoContext';
import './cockpit.css';

// The harness OpenSpec Cockpit (openspec change openspec-cockpit-in-harness):
// the read-only inspect surface, re-homed from the openspec-port-app/ Local app
// into the harness and scoped by the repo selector. One fetch (/api/openspec/
// cockpit, auto-scoped to the selected repo via X-Repo-Id) → in-flight · shipped ·
// baseline, plus the change↔baseline cross-link and the old→OpenSpec legend.
// Pure reader: nothing here mutates an artifact (the Console actions are a
// deliberate fast-follow, not in this change).

// old plans/* operator move → the OpenSpec primitive that now serves it.
const LEGEND = [
  { old: 'Look at the current / active plans', prim: 'openspec list', block: 'In flight' },
  { old: 'Inspect an old / closed plan', prim: 'read changes/archive/<id>/', block: 'Shipped' },
  { old: '“What does the system do today?”', prim: 'openspec show <cap>', block: 'Baseline' },
  { old: "A feature’s completion status", prim: 'openspec list task counts', block: 'In flight' },
];

function relTime(iso) {
  const t = Date.parse(iso);
  if (!t) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function Ring({ done, total }) {
  const frac = total ? done / total : 0;
  const r = 15, c = 2 * Math.PI * r, off = c * (1 - frac);
  const complete = total && done === total;
  return (
    <svg className="ck__ring" viewBox="0 0 40 40" width="36" height="36" aria-hidden="true">
      <circle cx="20" cy="20" r={r} fill="none" stroke="var(--ck-border)" strokeWidth="4" />
      <circle cx="20" cy="20" r={r} fill="none" strokeWidth="4" strokeLinecap="round"
        stroke={complete ? 'var(--ck-good)' : 'var(--ck-accent)'}
        strokeDasharray={c.toFixed(1)} strokeDashoffset={off.toFixed(1)} transform="rotate(-90 20 20)" />
      <text x="20" y="21" textAnchor="middle" dominantBaseline="middle" className="ck__ringtxt">
        {total ? Math.round(frac * 100) : 0}%
      </text>
    </svg>
  );
}

function Validity({ o }) {
  if (o?.valid === true) return <span className="ck-vald ck-vald--ok" title="passes openspec validate --strict">✓ valid</span>;
  if (o?.valid === false) {
    const n = o.issues || 0;
    return <span className="ck-vald ck-vald--bad" title="from openspec validate --strict">⚠ {n} issue{n === 1 ? '' : 's'}</span>;
  }
  return null;
}

function Touches({ touches }) {
  if (!touches?.length) return null;
  return (
    <span className="ck-touch">
      <span className="ck-touch__lbl">touches</span>
      {touches.map((t) => {
        const op = (t.operations?.[0] || '∆');
        return (
          <span className="ck-touch__cap" key={t.spec} title={`${(t.operations || []).join(' · ') || 'delta'} → ${t.spec}`}>
            <span className={`ck__op ck__op--${op.toLowerCase()}`}>{op}</span>{t.spec}
          </span>
        );
      })}
    </span>
  );
}

function Scenarios({ list }) {
  if (!list?.length) return null;
  return (
    <div className="ck__scn">
      {list.map((s, i) => <pre key={i}>{s.rawText || s.text || ''}</pre>)}
    </div>
  );
}

function Requirements({ reqs }) {
  if (!reqs?.length) return null;
  return (
    <div className="ck__reqs">
      {reqs.map((r, i) => (
        <div className="ck__req" key={i}>
          <div className="ck__reqtitle">{r.text || r.title || r.name || `Requirement ${i + 1}`}</div>
          <Scenarios list={r.scenarios} />
        </div>
      ))}
    </div>
  );
}

function Deltas({ deltas }) {
  if (!deltas?.length) return <p className="ck__dsub">No deltas.</p>;
  return (
    <div className="ck__deltas">
      {deltas.map((d, i) => (
        <div className="ck__delta" key={i}>
          <div className="ck__deltahd">
            <span className={`ck__op ck__op--${(d.operation || '').toLowerCase()}`}>{d.operation}</span>
            <span className="ck__deltacap">{d.spec}</span>
          </div>
          <Requirements reqs={d.requirements} />
        </div>
      ))}
    </div>
  );
}

function Tasks({ tasks }) {
  if (!tasks) return <p className="ck__dsub">No <code>tasks.md</code> in this change.</p>;
  if (!tasks.length) return <p className="ck__dsub"><code>tasks.md</code> has no checklist items yet.</p>;
  const done = tasks.filter((t) => t.done).length;
  let cur = null;
  return (
    <div className="ck__tasks">
      <div className="ck__taskshd">Tasks <span>{done}/{tasks.length}</span></div>
      {tasks.map((t, i) => {
        const head = t.section !== cur ? (cur = t.section) : null;
        return (
          <div key={i}>
            {head ? <div className="ck__tasksec">{head}</div> : null}
            <div className={`ck__task ${t.done ? 'is-done' : ''}`}>
              <span className="ck__taskbox">{t.done ? '✓' : ''}</span><span>{t.text}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Detail({ detail }) {
  if (detail.loading) return <div className="ck__detail ck__detail--load">Loading…</div>;
  if (detail.error) return <div className="ck__detail ck__detail--err">{detail.error}</div>;
  const d = detail.data || {};
  const json = d.json || {};
  const isChange = Array.isArray(json.deltas);
  return (
    <div className="ck__detail">
      <div className="ck__detailhd">{json.title || json.id || detail.id}{json.archived ? <span className="ck__chip">shipped</span> : null}</div>
      {isChange ? (
        <>
          <Tasks tasks={d.tasks} />
          <Deltas deltas={json.deltas} />
        </>
      ) : (
        <Requirements reqs={json.requirements} />
      )}
      {d.proposal ? <details className="ck__doc"><summary>proposal.md</summary><pre>{d.proposal}</pre></details> : null}
      {d.design ? <details className="ck__doc"><summary>design.md</summary><pre>{d.design}</pre></details> : null}
    </div>
  );
}

export default function Cockpit() {
  const { currentRepoId, current } = useRepo();
  const [state, setState] = useState({ loading: true });
  const [sel, setSel] = useState(null);     // { kind:'change'|'archived'|'spec', id }
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    setState({ loading: true });
    setSel(null);
    setDetail(null);
    try {
      const data = await apiGet('/openspec/cockpit');
      setState({ loading: false, data });
    } catch (e) {
      setState({ loading: false, error: e?.message || String(e) });
    }
  }, [currentRepoId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!sel) { setDetail(null); return; }
    let cancelled = false;
    setDetail({ loading: true, id: sel.id });
    const path = sel.kind === 'archived'
      ? `/openspec/archived?id=${encodeURIComponent(sel.id)}`
      : `/openspec/show?id=${encodeURIComponent(sel.id)}`;
    apiGet(path)
      .then((d) => { if (!cancelled) setDetail({ loading: false, data: d, id: sel.id }); })
      .catch((e) => { if (!cancelled) setDetail({ loading: false, error: e?.message || String(e), id: sel.id }); });
    return () => { cancelled = true; };
  }, [sel]);

  const data = state.data;
  const crossLink = useMemo(() => {
    const bySpec = {};
    (data?.activeChanges || []).forEach((c) => (c.touches || []).forEach((t) => {
      (bySpec[t.spec] = bySpec[t.spec] || []).push({ change: c.name, operations: t.operations || [] });
    }));
    return bySpec;
  }, [data]);

  if (state.loading) return <div className="ck"><div className="ck__empty">Loading OpenSpec state…</div></div>;
  if (state.error) return <div className="ck"><div className="ck__empty ck__empty--err">{state.error}</div></div>;

  const ready = data.ready || {};
  if (!ready.openspecOnPath || !ready.openspecDirPresent) {
    return (
      <div className="ck">
        <div className="ck__head"><h2>OpenSpec Cockpit</h2><span className="ck__repo">{data.repoName || current?.name}</span></div>
        <div className="ck__notready">
          <div className="ck__notready-icon">⚠</div>
          {!ready.openspecOnPath ? (
            <div>
              <b>OpenSpec CLI not available on this host.</b>
              <p>The <code>openspec</code> command could not be run. Install it on the harness host and reload.</p>
            </div>
          ) : (
            <div>
              <b>OpenSpec is not initialised in this repository.</b>
              <p>No <code>openspec/</code> directory was found in <code>{data.repoName || current?.name}</code>. Run <code>openspec init</code> in that repo, then reload.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  const active = data.activeChanges || [];
  const archived = data.archived || [];
  const specs = data.specs || [];

  return (
    <div className="ck">
      <div className="ck__head">
        <h2>OpenSpec Cockpit</h2>
        <span className="ck__repo">{data.repoName || current?.name}</span>
        <button className="ck__refresh" onClick={load} title="Re-read OpenSpec state">↻</button>
      </div>

      <div className="ck__legend">
        {LEGEND.map((l, i) => (
          <div className="ck__legrow" key={i}>
            <span className="ck__legold">{l.old}</span>
            <span className="ck__legarrow">→</span>
            <code className="ck__legprim">{l.prim}</code>
            <span className="ck__legblk">{l.block}</span>
          </div>
        ))}
      </div>

      <div className="ck__grid">
        {/* In flight */}
        <section className="ck__col">
          <h3>In flight <span className="ck__count">{active.length}</span></h3>
          {active.length === 0 ? <div className="ck__empty">No active changes.</div> : active.map((c) => (
            <button className={`ck-item ${sel?.id === c.name ? 'is-sel' : ''}`} key={c.name}
              onClick={() => setSel({ kind: 'change', id: c.name })}>
              <Ring done={c.completedTasks || 0} total={c.totalTasks || 0} />
              <div className="ck-item__body">
                <div className="ck-item__top"><span className="ck-item__name">{c.name}</span><Validity o={c} /></div>
                <div className="ck-item__meta">
                  <span className={`ck-status ck-status--${c.status}`}>{c.status}</span>
                  <span>{c.completedTasks || 0} of {c.totalTasks || 0} tasks</span>
                  {c.lastModified ? <span className="ck-item__time">{relTime(c.lastModified)}</span> : null}
                </div>
                <Touches touches={c.touches} />
              </div>
            </button>
          ))}
        </section>

        {/* Shipped */}
        <section className="ck__col">
          <h3>Shipped <span className="ck__count">{archived.length}</span></h3>
          {archived.length === 0 ? <div className="ck__empty">Nothing archived yet.</div> : archived.map((a) => (
            <button className={`ck-item ck-item--ship ${sel?.id === a.id ? 'is-sel' : ''}`} key={a.id}
              onClick={() => setSel({ kind: 'archived', id: a.id })}>
              <span className="ck-ship__date">{a.date}</span>
              <span className="ck-ship__title">{a.title}</span>
            </button>
          ))}
        </section>

        {/* Baseline */}
        <section className="ck__col">
          <h3>Baseline <span className="ck__count">{specs.length}</span></h3>
          {specs.length === 0 ? <div className="ck__empty">No baseline capabilities.</div> : specs.map((s) => {
            const inFlight = crossLink[s.id] || [];
            return (
              <button className={`ck-item ck-item--spec ${sel?.id === s.id ? 'is-sel' : ''}`} key={s.id}
                onClick={() => setSel({ kind: 'spec', id: s.id })}>
                <div className="ck-item__body">
                  <div className="ck-item__top"><span className="ck-item__name">{s.id}</span><Validity o={s} /></div>
                  <div className="ck-item__meta">
                    <span>{s.requirementCount ?? '?'} requirements</span>
                    {inFlight.length ? (
                      <span className="ck-inflight" title={inFlight.map((x) => x.change).join(', ')}>
                        {inFlight.length} in flight
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </section>
      </div>

      {detail ? <Detail detail={detail} /> : null}
    </div>
  );
}
