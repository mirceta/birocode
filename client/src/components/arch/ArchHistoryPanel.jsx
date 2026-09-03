import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet } from '../../api/client';
import './archHistory.css';

// The Arch tab's History lane (openspec: add-arch-tool-history): every tool the
// arch agent called in this conversation, in order, grouped under the message
// that caused it — each call as a card a human can read at a glance (what it
// did, in words), with the full arguments and the full result one click away.
//
// Two sources, merged by tool id like the repo chat's Tool calls panel:
//   - durable: GET /arch/tool-calls, reconstructed from the session transcript
//     on disk (the arch agent's home repo), so it is complete after a reload
//   - live: the running turn's tool steps (useArchStream), overlaid so a call
//     that is still running shows a spinner and lands in the list at once
// The lane is read-only; nothing here is configurable.

const POLL_MS = 3000;
const ARCH_PREFIX = 'mcp__arch__';

const ICONS = {
  list_agents: '🧭',
  list_machines: '🛰️',
  git_state: '🌿',
  read_transcript: '📜',
  send_task: '📨',
  remember: '💾',
  recall: '🧠',
};

const ACTOR_LABEL = { human: 'you', wake: 'harness wake-up', arch: 'arch', none: 'before the first message' };
const ACTOR_ICON = { human: '👤', wake: '⏰', arch: '🏛️', none: '·' };

function shortName(name) {
  return name?.startsWith(ARCH_PREFIX) ? name.slice(ARCH_PREFIX.length) : name || 'tool';
}

function str(v) {
  return v === undefined || v === null ? '' : String(v);
}

// What the call did, in one plain sentence — the harness tools have a fixed
// vocabulary so each gets its own phrasing; a built-in tool falls back to its
// name plus the summary the transcript reader derived.
export function describeCall(call) {
  const a = call.input && typeof call.input === 'object' ? call.input : {};
  const where = a.machine && a.machine !== 'self' ? ` on ${a.machine}` : '';
  const repo = a.repoId ? str(a.repoId) : 'a repo';
  const tail = a.tail ?? 6;
  switch (call.tool) {
    case 'list_agents': return 'Listed the managed agents across the fleet';
    case 'list_machines': return 'Checked the fleet posture: every machine, its opt-ins and gate';
    case 'git_state': return `Read the git state of ${repo}${where}`;
    case 'read_transcript': return `Read the last ${tail} message${tail === 1 ? '' : 's'} of the ${repo} conversation${where}`;
    case 'send_task': return `Sent a task to ${repo}${where}${a.branch ? ` on branch ${a.branch}` : ''}`;
    case 'remember': return `Wrote memory ${a.path ? str(a.path) : '(no path)'}`;
    case 'recall': return a.path ? `Read memory ${str(a.path)}` : 'Listed its memory files';
    default: return call.summary ? `${call.tool}: ${call.summary}` : call.tool;
  }
}

// The harness's tools answer with a JSON envelope { ok, status, detail, data };
// anything else is shown as plain text.
export function parseResult(text) {
  if (!text) return null;
  try {
    const j = JSON.parse(text);
    if (j && typeof j === 'object' && !Array.isArray(j) && ('status' in j || 'ok' in j)) {
      return { envelope: true, ok: j.ok, status: j.status, detail: j.detail, data: j.data };
    }
    return { envelope: false, json: j };
  } catch {
    return { envelope: false, text };
  }
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const hms = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return sameDay ? hms : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${hms}`;
}

export function fmtDuration(ms) {
  if (ms === null || ms === undefined) return '';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s < 10 && !Number.isInteger(s) ? s.toFixed(1) : Math.round(s)} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${Math.round(s % 60)} s`;
}

function pretty(v) {
  if (v === undefined) return '';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

function Value({ v }) {
  if (v === null || v === undefined) return <span className="arch-hist__null">—</span>;
  if (typeof v === 'boolean' || typeof v === 'number') return <code className="arch-hist__scalar">{String(v)}</code>;
  if (typeof v === 'string') {
    if (v.length > 120 || v.includes('\n')) return <pre className="arch-hist__pre">{v}</pre>;
    return <code className="arch-hist__scalar">{v}</code>;
  }
  return <pre className="arch-hist__pre">{pretty(v)}</pre>;
}

function Args({ input }) {
  if (input === null || input === undefined) return <div className="arch-hist__none">no arguments</div>;
  if (typeof input !== 'object' || Array.isArray(input)) return <Value v={input} />;
  const keys = Object.keys(input);
  if (keys.length === 0) return <div className="arch-hist__none">no arguments</div>;
  return (
    <div className="arch-hist__args">
      {keys.map((k) => (
        <div className="arch-hist__arg" key={k}>
          <code className="arch-hist__key">{k}</code>
          <div className="arch-hist__val"><Value v={input[k]} /></div>
        </div>
      ))}
    </div>
  );
}

function Result({ call }) {
  if (call.ok === null || call.ok === undefined) {
    return (
      <div className="arch-hist__none">
        {call.live ? 'still running — no result yet' : 'no result recorded (the turn was cut short, or the transcript has not caught up)'}
      </div>
    );
  }
  const r = parseResult(call.result);
  if (!r) return <div className="arch-hist__none">empty result</div>;
  return (
    <>
      {r.envelope && (
        <div className="arch-hist__outcome">
          <span className={`arch-hist__status arch-hist__status--${r.ok === false ? 'bad' : 'good'}`}>{str(r.status) || (r.ok ? 'ok' : 'failed')}</span>
          {r.detail ? <span className="arch-hist__detail">{str(r.detail)}</span> : null}
        </div>
      )}
      {r.envelope && r.data !== undefined && r.data !== null && (
        <>
          <div className="arch-hist__label">data</div>
          <pre className="arch-hist__pre arch-hist__pre--result">{pretty(r.data)}</pre>
        </>
      )}
      {!r.envelope && r.json !== undefined && <pre className="arch-hist__pre arch-hist__pre--result">{pretty(r.json)}</pre>}
      {!r.envelope && r.text !== undefined && <pre className="arch-hist__pre arch-hist__pre--result">{r.text}</pre>}
      {call.resultClipped && (
        <div className="arch-hist__clipped">result clipped for display — {Number(call.resultChars || 0).toLocaleString()} characters in the transcript</div>
      )}
    </>
  );
}

function CallCard({ call, open }) {
  const [showRaw, setShowRaw] = useState(false);
  const running = call.ok === null || call.ok === undefined;
  const state = running ? (call.live ? 'running' : 'unknown') : call.ok ? 'ok' : 'error';
  const icon = call.server === 'arch' ? (ICONS[call.tool] || '🔌') : '🔧';
  const hasDuration = call.durationMs !== null && call.durationMs !== undefined;
  return (
    <details className={`arch-hist__call arch-hist__call--${state}`} open={open} data-tool={call.tool} data-state={state} data-id={call.id}>
      <summary className="arch-hist__sum">
        <span className="arch-hist__icon" aria-hidden="true">{icon}</span>
        <span className="arch-hist__what">
          <span className="arch-hist__sentence">{describeCall(call)}</span>
          <span className="arch-hist__toolname">
            <code>{call.tool}</code>
            {call.server === 'arch'
              ? <span className="arch-hist__srv">harness tool</span>
              : <span className="arch-hist__srv arch-hist__srv--builtin">built-in</span>}
          </span>
        </span>
        <span className="arch-hist__right">
          <span className={`arch-hist__pill arch-hist__pill--${state}`}>
            {state === 'running' ? <><span className="arch-hist__spin" aria-hidden="true" /> running</>
              : state === 'unknown' ? 'no result'
                : state === 'ok' ? '✓ ok' : '✗ error'}
          </span>
          <span className="arch-hist__time">{fmtTime(call.at)}{hasDuration ? ` · ${fmtDuration(call.durationMs)}` : ''}</span>
        </span>
      </summary>
      <div className="arch-hist__body">
        <div className="arch-hist__section">
          <div className="arch-hist__label">arguments</div>
          <Args input={call.input} />
        </div>
        <div className="arch-hist__section">
          <div className="arch-hist__label">result</div>
          <Result call={call} />
        </div>
        <div className="arch-hist__raw">
          <button type="button" className="arch-hist__rawbtn" onClick={() => setShowRaw((s) => !s)}>{showRaw ? 'hide raw call' : 'show raw call'}</button>
          {showRaw && (
            <pre className="arch-hist__pre">{pretty({ id: call.id, name: call.name, input: call.input, at: call.at, resultAt: call.resultAt, ok: call.ok })}</pre>
          )}
        </div>
      </div>
    </details>
  );
}

// Merge the durable list with the live turn's tool steps (by id): a fetched
// call the live turn still shows as running is marked live; a live-only call is
// listed under a synthetic "now" turn until the transcript catches up.
export function mergeLive(fetched, liveTurn) {
  const steps = (liveTurn?.assistant?.steps || []).filter((s) => s.kind === 'tool' && s.id);
  const byId = new Map(steps.map((s) => [s.id, s]));
  const seen = new Set();
  const calls = fetched.map((c) => {
    seen.add(c.id);
    const s = byId.get(c.id);
    if (!s || !liveTurn?.active) return c;
    if (s.status === 'running' && (c.ok === null || c.ok === undefined)) return { ...c, live: true };
    return c;
  });
  const extra = steps.filter((s) => !seen.has(s.id)).map((s) => {
    let input = null;
    if (s.detail) { try { input = JSON.parse(s.detail); } catch { input = s.detail; } }
    return {
      id: s.id,
      name: s.name,
      tool: shortName(s.name),
      server: s.name?.startsWith(ARCH_PREFIX) ? 'arch' : 'builtin',
      summary: s.summary || '',
      input,
      ok: s.status === 'running' ? null : s.status !== 'error',
      result: s.preview || '',
      resultClipped: false,
      resultChars: (s.preview || '').length,
      at: s.startedAt ? new Date(s.startedAt).toISOString() : null,
      resultAt: null,
      durationMs: null,
      turn: 'live',
      live: s.status === 'running',
    };
  });
  return { calls: [...calls, ...extra], liveCount: extra.length };
}

export default function ArchHistoryPanel({ liveTurn = null, sessionId = null }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [toolFilter, setToolFilter] = useState(null); // null = all
  const [errorsOnly, setErrorsOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [newestFirst, setNewestFirst] = useState(true);
  const [openAll, setOpenAll] = useState({ v: 0, open: false });

  const load = useCallback(async () => {
    try {
      const d = await apiGet('/arch/tool-calls');
      setData(d);
      setError(null);
    } catch (e) {
      setError(e?.message || String(e));
    }
  }, []);

  // Poll while the lane is open; a change of session or the end of a live turn
  // re-pulls at once so the hand-over from live to durable does not wait.
  const liveActive = !!liveTurn?.active;
  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load, sessionId, liveActive]);

  const fetched = data?.calls || [];
  const { calls, liveCount } = useMemo(() => mergeLive(fetched, liveTurn), [fetched, liveTurn]);

  const toolCounts = useMemo(() => {
    const m = new Map();
    for (const c of calls) m.set(c.tool, (m.get(c.tool) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [calls]);
  const errors = calls.filter((c) => c.ok === false).length;

  const q = query.trim().toLowerCase();
  const shown = calls.filter((c) => (!toolFilter || c.tool === toolFilter)
    && (!errorsOnly || c.ok === false)
    && (!q || `${c.tool} ${describeCall(c)} ${pretty(c.input)} ${c.result || ''}`.toLowerCase().includes(q)));

  // Group under turns; the live-only calls form their own group at the "now" end.
  const turnsMeta = new Map((data?.turns || []).map((t) => [t.index, t]));
  const groups = [];
  const byTurn = new Map();
  for (const c of shown) {
    if (!byTurn.has(c.turn)) {
      const meta = c.turn === 'live'
        ? { index: 'live', prompt: liveTurn?.user?.text || '', actor: liveTurn?.user?.actor || 'human', at: null }
        : (turnsMeta.get(c.turn) || { index: c.turn, prompt: '', actor: c.turn === 0 ? 'none' : 'human', at: c.at });
      const g = { key: c.turn, meta, calls: [] };
      byTurn.set(c.turn, g);
      groups.push(g);
    }
    byTurn.get(c.turn).calls.push(c);
  }
  if (newestFirst) {
    groups.reverse();
    for (const g of groups) g.calls.reverse();
  }

  const first = calls[0]?.at;
  const last = calls[calls.length - 1]?.at;
  const turnCount = (data?.turns || []).length + (liveCount ? 1 : 0);

  if (!data && !error) return <div className="arch-hist"><div className="arch-hist__empty">Loading the tool history…</div></div>;
  if (!data) return <div className="arch-hist"><div className="arch-hist__err" role="alert">Could not load the tool history: {error}</div></div>;

  return (
    <div className="arch-hist" data-calls={calls.length}>
      <div className="arch-hist__head">
        <h2>Tool history</h2>
        <span className="arch-hist__stats">
          <b>{calls.length}</b> call{calls.length === 1 ? '' : 's'}
          {' · '}<b>{turnCount}</b> turn{turnCount === 1 ? '' : 's'}
          {' · '}<b className={errors ? 'arch-hist__bad' : ''}>{errors}</b> error{errors === 1 ? '' : 's'}
          {first ? <> · {fmtTime(first)}{last && last !== first ? ` → ${fmtTime(last)}` : ''}</> : null}
          {liveCount ? <span className="arch-hist__pill arch-hist__pill--running"><span className="arch-hist__spin" aria-hidden="true" /> live</span> : null}
        </span>
      </div>
      <p className="arch-hist__intro">
        Every tool the arch agent called in this conversation, newest {newestFirst ? 'first' : 'last'}, grouped under the message that caused it.
        Each card says in words what the call did; open it for the exact arguments and the full result.
        Read from the session transcript on disk, so it survives reloads; a running turn is overlaid live.
      </p>

      <div className="arch-hist__filters">
        <div className="arch-hist__chips">
          <button type="button" className={`arch-hist__chip${toolFilter === null ? ' arch-hist__chip--on' : ''}`} onClick={() => setToolFilter(null)}>all · {calls.length}</button>
          {toolCounts.map(([tool, n]) => (
            <button
              type="button"
              key={tool}
              className={`arch-hist__chip${toolFilter === tool ? ' arch-hist__chip--on' : ''}`}
              onClick={() => setToolFilter(toolFilter === tool ? null : tool)}
              data-chip={tool}
            >
              {ICONS[tool] || '🔧'} {tool} · {n}
            </button>
          ))}
        </div>
        <div className="arch-hist__controls">
          <label className="arch-hist__check"><input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} /> errors only</label>
          <input className="arch-hist__search" type="search" placeholder="search arguments and results…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <button type="button" className="arch-hist__btn" onClick={() => setNewestFirst((v) => !v)}>{newestFirst ? '↓ newest first' : '↑ oldest first'}</button>
          <button type="button" className="arch-hist__btn" onClick={() => setOpenAll((o) => ({ v: o.v + 1, open: !o.open }))}>{openAll.open ? 'collapse all' : 'expand all'}</button>
        </div>
      </div>

      {calls.length === 0 && (
        <div className="arch-hist__empty">
          No tool calls yet in this conversation. Once the arch agent starts working — listing agents, reading transcripts, sending tasks — every call lands here with its arguments and result.
        </div>
      )}
      {calls.length > 0 && shown.length === 0 && <div className="arch-hist__empty">Nothing matches the current filter.</div>}

      <div className="arch-hist__timeline">
        {groups.map((g) => (
          <section className="arch-hist__turn" key={String(g.key)} data-turn={String(g.key)} data-actor={g.meta.actor}>
            <header className="arch-hist__turnhead">
              <span className="arch-hist__turnno">{g.key === 'live' ? 'now' : g.key === 0 ? '—' : `#${g.key}`}</span>
              <span className="arch-hist__actor" title={`who sent this message: ${ACTOR_LABEL[g.meta.actor] || g.meta.actor}`}>
                {ACTOR_ICON[g.meta.actor] || '·'} {ACTOR_LABEL[g.meta.actor] || g.meta.actor}
              </span>
              {g.meta.at && <span className="arch-hist__time">{fmtTime(g.meta.at)}</span>}
              <span className="arch-hist__count">{g.calls.length} call{g.calls.length === 1 ? '' : 's'}</span>
              {g.meta.prompt && <span className="arch-hist__prompt" title={g.meta.prompt}>“{g.meta.prompt}”</span>}
            </header>
            <div className="arch-hist__calls">
              {g.calls.map((c) => <CallCard key={`${openAll.v}:${c.id}`} call={c} open={openAll.open} />)}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
