import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../api/client';
import { agentWorkerHref, harnessRootFromLocation } from './harnessLink';
import { focusAgentTab } from '../components/shared/workerWindow';
import { POLL_MS, WEEKDAYS, agentKey, agentOptions, agoWords, nextLine, orderCards, summaryLine, loopWord, runText, badgeText, tookWords,
  blankForm, formOf, bodyOf, validateForm, sameForm, errorText } from './recurringCards';
import './recurring.css';

// Recurring tab (openspec recurring-tasks): scheduled work for repo agents as ONE column of
// cards. Each due occurrence arms the harness's GOAL LOOP on the assigned agent — work
// until LOOP_DONE, then a verification turn, only GOAL_VERIFIED completes it — and the
// card keeps the history of every run. The server decides everything (next due, holds,
// the loop's live phase, outcomes); this tab renders the board it polls and sends the
// Operator's actions. Pure wording/ordering lives in recurringCards.js.

const FLEET_POLL_MS = 30000;

function Editor({ form, setForm, agents, disabled, minInterval, agentLabel }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const toggleDay = (d) => setForm({ ...form, days: form.days.includes(d) ? form.days.filter((x) => x !== d) : [...form.days, d] });
  const known = agents.some((a) => a.key === form.agent);
  return (
    <div className="rc__editor">
      <div className="rc__row">
        <label className="rc__f rc__f--wide">title<input type="text" value={form.title} onChange={set('title')} disabled={disabled} maxLength={200} data-rc-title placeholder="CI health check" /></label>
        <label className="rc__f">assigned repo agent
          <select value={form.agent} onChange={set('agent')} disabled={disabled} data-rc-agent>
            <option value="">— pick an agent —</option>
            {!known && form.agent && <option value={form.agent}>{agentLabel || form.agent} (not in the fleet status right now)</option>}
            {agents.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
        </label>
      </div>
      <label className="rc__f">instructions — the GOAL of every run (the loop works until it is verified)
        <textarea value={form.instructions} onChange={set('instructions')} disabled={disabled} data-rc-instructions placeholder="What should the agent do, check or report on every run?" />
      </label>
      <div className="rc__row">
        <label className="rc__f">schedule
          <select value={form.scheduleKind} onChange={set('scheduleKind')} disabled={disabled} data-rc-kind>
            <option value="interval">every …</option>
            <option value="daily">daily at …</option>
          </select>
        </label>
        {form.scheduleKind === 'interval' ? (
          <label className="rc__f">every
            <span className="rc__inline">
              <input type="number" min="1" value={form.every} onChange={set('every')} disabled={disabled} data-rc-every />
              <select value={form.unit} onChange={set('unit')} disabled={disabled} data-rc-unit><option value="min">minutes</option><option value="h">hours</option><option value="d">days</option></select>
            </span>
            <span className="rc__hint">at least {minInterval} min · on a fixed grid from now</span>
          </label>
        ) : (
          <label className="rc__f">at (this harness's local time)
            <span className="rc__inline">
              <input type="time" value={form.at} onChange={set('at')} disabled={disabled} data-rc-at />
              {WEEKDAYS.map((d) => (
                <button key={d} type="button" className={`rc__day${form.days.includes(d) ? ' rc__day--on' : ''}`} onClick={() => toggleDay(d)} disabled={disabled} data-rc-day={d}>{d.slice(0, 2)}</button>
              ))}
            </span>
            <span className="rc__hint">{form.days.length ? 'only on the marked days' : 'no day marked = every day'}</span>
          </label>
        )}
        <label className="rc__f">run as
          <select value={form.mode} onChange={set('mode')} disabled={disabled} data-rc-mode>
            <option value="goal">🎯 goal loop — work, then verify</option>
            <option value="single">single prompt (trivial checks)</option>
          </select>
        </label>
        {form.mode === 'goal' && (
          <label className="rc__f rc__f--narrow">turn budget<input type="number" min="2" max="30" value={form.maxTurns} onChange={set('maxTurns')} disabled={disabled} data-rc-turns /></label>
        )}
      </div>
      <div className="rc__opts">
        <label><input type="checkbox" checked={form.catchUp} onChange={set('catchUp')} disabled={disabled} /> catch up after downtime (once)</label>
        <label><input type="checkbox" checked={form.skipWhenBusy} onChange={set('skipWhenBusy')} disabled={disabled} /> skip instead of waiting when the agent is busy</label>
        <label>skip when the plan's 5-hour window is at or above <input className="rc__pct" type="number" min="0" max="100" value={form.usageLimit} onChange={set('usageLimit')} disabled={disabled} /> % <span className="rc__hint">(0 = off)</span></label>
        <label><input type="checkbox" checked={form.requireDefaultBranch} onChange={set('requireDefaultBranch')} disabled={disabled} /> only when the repo is on its default branch</label>
      </div>
      {form.mode === 'goal' && (
        <div className="rc__note">A run needs the agent's one loop slot: it waits while any other loop uses it, and the agent's previous loop settings are put back afterwards. The run shows live in the agent's dock Loop panel.</div>
      )}
    </div>
  );
}

function History({ taskId, tick }) {
  const [runs, setRuns] = useState(null);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(15);
  useEffect(() => {
    let dead = false;
    apiGet(`/recurring/${taskId}/runs?limit=${limit}`).then((d) => { if (!dead) { setRuns(d.runs || []); setTotal(d.total || 0); } }).catch(() => {});
    return () => { dead = true; };
  }, [taskId, tick, limit]);
  const now = Date.now();
  if (runs === null) return <div className="rc__dim">Loading the run history…</div>;
  if (runs.length === 0) return <div className="rc__dim" data-rc-nohistory>No runs yet — the first one comes on the schedule, or press Run now.</div>;
  return (
    <>
      <table className="rc__hist" data-rc-history={runs.length}>
        <thead><tr><th>when</th><th>trigger</th><th>outcome</th><th>summary</th><th>loop ended</th><th>turns</th><th>took</th></tr></thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} data-rc-run={r.id} data-rc-run-status={r.status}>
              <td className="rc__num" title={new Date(r.armedAt || r.dueAt).toLocaleString()}>{agoWords(r.armedAt || r.dueAt, now)}</td>
              <td>{r.trigger}{r.missed ? <span className="rc__dim"> (covers {r.missed})</span> : null}</td>
              <td><span className={`rc__badge rc__badge--${r.word}`}>{badgeText(r.word)}</span></td>
              <td>{runText(r)}</td>
              <td>{loopWord(r)}</td>
              <td className="rc__num">{r.turns || '—'}</td>
              <td className="rc__num">{tookWords(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {total > runs.length && <button type="button" className="rc__link" onClick={() => setLimit(limit + 50)}>Show earlier runs ({total - runs.length})</button>}
    </>
  );
}

export default function RecurringTab() {
  const [board, setBoard] = useState(null);
  const [fleet, setFleet] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(() => new Set());
  const [drafts, setDrafts] = useState({});          // task id → the editor's unsaved form
  const [creating, setCreating] = useState(null);    // the composer's form, or null
  const [busyAct, setBusyAct] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [, setClock] = useState(0);
  const alive = useRef(true);

  const load = useCallback(() => apiGet('/recurring').then((d) => { if (alive.current) { setBoard(d); } }).catch((e) => { if (alive.current) setError(errorText(e)); }), []);
  useEffect(() => {
    alive.current = true;
    load();
    const fl = () => apiGet('/arch/fleet/status').then((d) => { if (alive.current) setFleet(d); }).catch(() => {});
    fl();
    const a = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    const b = setInterval(() => { if (!document.hidden) fl(); }, FLEET_POLL_MS);
    const c = setInterval(() => setClock((n) => n + 1), 1000);      // the countdowns
    return () => { alive.current = false; clearInterval(a); clearInterval(b); clearInterval(c); };
  }, [load]);

  const agents = useMemo(() => agentOptions(fleet), [fleet]);
  const agentByKey = useMemo(() => Object.fromEntries(agents.map((a) => [a.key, a])), [agents]);
  const workerRoot = harnessRootFromLocation();
  const now = Date.now();
  const gateOpen = board?.gateOpen !== false;
  const minInterval = board?.minIntervalMinutes || 5;
  const tasks = orderCards(board?.tasks);

  const act = async (key, fn) => {
    setBusyAct(key); setError(null);
    try { const d = await fn(); if (d?.tasks) setBoard(d); else await load(); return true; }
    catch (e) { setError(errorText(e)); return false; }
    finally { setBusyAct(null); }
  };
  const toggle = (t) => {
    const next = new Set(open);
    if (next.has(t.id)) next.delete(t.id);
    else { next.add(t.id); if (!drafts[t.id] && !t.redacted) setDrafts({ ...drafts, [t.id]: formOf(t) }); }
    setOpen(next);
  };
  const create = async () => {
    if (await act('create', () => apiPost('/recurring', bodyOf(creating)))) setCreating(null);
  };
  const save = async (t) => {
    if (await act(`save:${t.id}`, () => apiPatch(`/recurring/${t.id}`, bodyOf(drafts[t.id])))) setDrafts((d) => { const n = { ...d }; delete n[t.id]; return n; });
  };

  return (
    <div className="rc" data-recurring-tab>
      <div className="rc__head">
        <span className="rc__dim" data-rc-summary>{board ? summaryLine(board.tasks, now) : 'Loading…'}</span>
        <button type="button" className="rc__btn rc__btn--accent" onClick={() => setCreating(creating ? null : blankForm())} disabled={!gateOpen} data-rc-add>＋ Recurring task</button>
      </div>
      {board && !gateOpen && (
        <div className="rc__banner" data-rc-gate-closed>Autopilot is disabled by the operator (host GUI). Recurring tasks are held — no loop is armed until the gate opens; each card then runs once (catch-up). Instructions are not shown while the gate is closed.</div>
      )}
      {error && <div className="rc__error" data-rc-error onClick={() => setError(null)} title="dismiss">{error}</div>}

      {creating && (
        <section className="rc__card rc__card--new is-open" data-rc-composer>
          <div className="rc__body">
            <Editor form={creating} setForm={setCreating} agents={agents} disabled={busyAct === 'create'} minInterval={minInterval} />
            <div className="rc__actions">
              <button type="button" className="rc__btn rc__btn--accent" onClick={create} disabled={!!validateForm(creating, minInterval) || busyAct === 'create'} data-rc-create>Create</button>
              <button type="button" className="rc__btn" onClick={() => setCreating(null)}>Cancel</button>
              <span className="rc__hint" data-rc-invalid>{validateForm(creating, minInterval) || 'Creating a task does not run it — the first run comes one interval from now, or press Run now.'}</span>
            </div>
          </div>
        </section>
      )}

      {board && tasks.length === 0 && !creating && (
        <div className="rc__empty" data-rc-empty>No recurring tasks yet. A recurring task sends a repo agent the same goal on a schedule — "every 2 h check CI", "every morning report drift" — as a goal loop (work, then verify), and keeps the history of every run here.</div>
      )}

      {tasks.map((t) => {
        const line = nextLine(t, now);
        const isOpen = open.has(t.id);
        const last = t.lastRun;
        const agent = agentByKey[agentKey(t.sourceId, t.repoId)];
        const href = agent ? agentWorkerHref(agent.machine, workerRoot, t.repoId) : null;
        const draft = drafts[t.id];
        const dirty = draft && !sameForm(draft, formOf(t));
        const invalid = draft ? validateForm(draft, minInterval) : null;
        const working = !!t.running || !!agent?.busy;
        return (
          <article key={t.id} className={`rc__card${t.attention ? ` rc__card--${t.attention}` : ''}${t.enabled ? '' : ' rc__card--paused'}${isOpen ? ' is-open' : ''}`} data-recurring={t.id} data-rc-attention={t.attention || ''}>
            <div className="rc__top" onClick={() => toggle(t)} data-rc-toggle>
              <div>
                <div className="rc__title">{t.title}</div>
                <div className="rc__meta">
                  <span className="rc__chip" title={agent ? (agent.self ? 'this machine' : agent.reachable ? 'reachable' : 'not answering right now') : 'not in the fleet status right now'}>
                    <i className={`rc__dot${working ? ' rc__dot--busy' : t.enabled && agent ? ' rc__dot--idle' : ''}`} />
                    {agent?.self ? '⌂ ' : ''}{t.agentLabel}
                    {href && <button type="button" className="rc__open" title="open this agent in the worker window" onClick={(e) => { e.stopPropagation(); focusAgentTab(agentKey(t.sourceId, t.repoId), href); }} data-open-worker>⧉</button>}
                  </span>
                  <span>🔁 {t.scheduleWords}</span>
                  <span>· {t.run?.mode === 'single' ? 'single prompt' : `🎯 goal loop, ≤ ${t.run?.maxTurns ?? 6} turns`}</span>
                  <span>· {t.totalRuns} run{t.totalRuns === 1 ? '' : 's'}</span>
                </div>
              </div>
              <div className="rc__right">
                <span className={`rc__next rc__next--${line.kind}`} data-rc-next={line.kind}>
                  {line.kind === 'running' && line.phase && (
                    <span className="rc__phases"><i className={`rc__ph${line.phase === 'work' ? ' rc__ph--on' : ''}`}>work</i>→<i className={`rc__ph${line.phase !== 'work' ? ' rc__ph--on' : ''}`}>verify</i></span>
                  )}
                  {line.text}
                </span>
                <span className="rc__strip" title={`last ${t.strip.length} runs, newest on the right`} data-rc-strip={t.strip.length}>
                  {t.strip.map((w, i) => <i key={i} className={`rc__sq rc__sq--${w}`} />)}
                </span>
              </div>
              {last && (
                <div className="rc__last" data-rc-last={last.word}>
                  <span className={`rc__badge rc__badge--${last.word}`}>{badgeText(last.word)}</span> {runText(last)} <span className="rc__dim">· {agoWords(last.endedAt || last.armedAt || last.dueAt, now)}</span>
                </div>
              )}
            </div>
            {isOpen && (
              <div className="rc__body">
                {t.redacted
                  ? <div className="rc__dim">The instructions and the editor are hidden while the Operator's autopilot gate is closed.</div>
                  : draft && <Editor form={draft} setForm={(f) => setDrafts({ ...drafts, [t.id]: f })} agents={agents} disabled={busyAct === `save:${t.id}`} minInterval={minInterval} agentLabel={draft.agent === agentKey(t.sourceId, t.repoId) ? t.agentLabel : null} />}
                <div className="rc__actions">
                  {dirty && <button type="button" className="rc__btn rc__btn--accent" onClick={() => save(t)} disabled={!!invalid || !gateOpen} data-rc-save>Save</button>}
                  {dirty && <button type="button" className="rc__btn" onClick={() => setDrafts({ ...drafts, [t.id]: formOf(t) })}>Revert</button>}
                  {!t.running && <button type="button" className="rc__btn rc__btn--accent" onClick={() => act(`run:${t.id}`, () => apiPost(`/recurring/${t.id}/run`, {}))} disabled={!gateOpen || dirty || busyAct === `run:${t.id}`} title={dirty ? 'save or revert your edits first' : 'arm one run now; the schedule is unchanged'} data-rc-run>▶ Run now</button>}
                  {t.running && t.running.mode !== 'single' && <button type="button" className="rc__btn" onClick={() => act(`stop:${t.id}`, () => apiPost(`/recurring/${t.id}/stop`, {}))} data-rc-stop>■ Stop run</button>}
                  {t.enabled
                    ? <button type="button" className="rc__btn" onClick={() => act(`pause:${t.id}`, () => apiPost(`/recurring/${t.id}/pause`, {}))} data-rc-pause>⏸ Pause</button>
                    : <button type="button" className="rc__btn" onClick={() => act(`resume:${t.id}`, () => apiPost(`/recurring/${t.id}/resume`, {}))} disabled={!gateOpen} title="resuming starts a fresh schedule from now" data-rc-resume>▶ Resume</button>}
                  <span className="rc__spacer" />
                  {dirty && invalid && <span className="rc__hint" data-rc-invalid>{invalid}</span>}
                  {confirmDel === t.id
                    ? <><button type="button" className="rc__btn rc__btn--danger" onClick={() => act(`del:${t.id}`, () => apiDelete(`/recurring/${t.id}`)).then(() => setConfirmDel(null))} disabled={!!t.running} data-rc-delete-confirm>Delete it and its history</button><button type="button" className="rc__btn" onClick={() => setConfirmDel(null)}>Keep</button></>
                    : <button type="button" className="rc__link" onClick={() => setConfirmDel(t.id)} disabled={!!t.running} title={t.running ? 'stop the run first' : ''} data-rc-delete>Delete…</button>}
                </div>
                <History taskId={t.id} tick={`${t.totalRuns}|${t.running?.turns ?? ''}|${t.running?.phase ?? ''}|${last?.id ?? ''}`} />
              </div>
            )}
          </article>
        );
      })}
      {board && tasks.length > 0 && (
        <p className="rc__legend">run strip: <i className="rc__sq rc__sq--ok" /> ok <i className="rc__sq rc__sq--attention" /> attention <i className="rc__sq rc__sq--failed" /> failed <i className="rc__sq rc__sq--unreported" /> unreported <i className="rc__sq rc__sq--skipped" /> skipped / refused <i className="rc__sq rc__sq--running" /> running · newest on the right</p>
      )}
    </div>
  );
}
