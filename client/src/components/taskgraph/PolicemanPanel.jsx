import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import Arch from '../../pages/Arch';
import ArchHistoryPanel from '../arch/ArchHistoryPanel';
import KanbanBoard from './KanbanBoard';
import './policeman.css';

// The policeman as an arch conversation (openspec kanban-policeman-conversation): a subtab
// of the Kanban that hosts the SAME Arch page the Arch tab uses (chat · tools · history ·
// loops), pointed at the reserved conversation "@arch:policeman", under a control strip:
// its state, interval, context vs cap, session count and rollovers, Start / Stop / Check
// now / Roll over, and the settings. The sessions strip is the provenance across
// rollovers: every past CLI session stays listed, and clicking one shows its tool calls.
// Nothing here is a second implementation — the loop is the engine's recipe loop, the
// turn is the arch's, the history is the arch's.

export const POLICEMAN_CONV = '@arch:policeman';
const POLL_MS = 5000;
const SUB_KEY = 'manageapp.kanbanSub';

function ago(ms) {
  if (ms == null || ms < 0) return '';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h` : `${Math.floor(h / 24)} d`;
}
const k = (n) => (n == null ? '—' : `${Math.round(n / 1000)}k`);

/** The policeman's headline state from its status payload: [tone, label]. Pure. */
export function policemanState(st) {
  if (!st) return ['loading', 'loading…'];
  if (!st.exists) return ['off', 'not set up'];
  if (st.running) return ['busy', 'turn running'];
  const loop = st.loop;
  if (loop?.active) return ['on', `armed · pass ${loop.iterationsDone}`];
  if (loop) {
    if (loop.status === 'escalate') return ['wait', 'waiting for you'];
    if (loop.status === 'error') return ['err', `errored — re-arms after a cooldown${loop.stopDetail ? ` (${loop.stopDetail})` : ''}`];
    if (loop.status === 'capped' || loop.status === 'done') return st.enabled ? ['on', 're-arming'] : ['off', 'stopped'];
    if (loop.status === 'stopped') return ['off', 'stopped'];
  }
  return st.enabled ? ['on', 'armed'] : ['off', 'stopped'];
}

function readSub() {
  try { return localStorage.getItem(SUB_KEY) === 'policeman' ? 'policeman' : 'board'; } catch { return 'board'; }
}

/** The Kanban tab: Board | 👮 Policeman subtabs (the choice is remembered per browser). */
export function KanbanTab() {
  const [sub, setSubState] = useState(readSub);
  const setSub = (s) => { setSubState(s); try { localStorage.setItem(SUB_KEY, s); } catch { /* private mode */ } };
  return (
    <div className="kbtab" data-kanban-tab>
      <div className="kbsub" role="tablist" aria-label="Kanban views" data-kanban-subtabs>
        <button type="button" role="tab" aria-selected={sub === 'board'} className={`kbsub__tab${sub === 'board' ? ' kbsub__tab--on' : ''}`} onClick={() => setSub('board')} data-kanban-sub="board">📋 Board</button>
        <button type="button" role="tab" aria-selected={sub === 'policeman'} className={`kbsub__tab${sub === 'policeman' ? ' kbsub__tab--on' : ''}`} onClick={() => setSub('policeman')} data-kanban-sub="policeman">👮 Policeman</button>
      </div>
      <div className="kbtab__body">
        {sub === 'policeman' ? <PolicemanPanel /> : <KanbanBoard />}
      </div>
    </div>
  );
}

export default function PolicemanPanel() {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [past, setPast] = useState(null); // a past session id whose tool calls are shown
  const [intervalMin, setIntervalMin] = useState('');
  const [capK, setCapK] = useState('');
  const [showPrompt, setShowPrompt] = useState(false);
  const [showTools, setShowTools] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await apiGet('/arch/policeman');
      setSt(d);
      setErr('');
      setIntervalMin((v) => (v === '' ? String(Math.max(1, Math.round((d.intervalSeconds || 300) / 60))) : v));
      setCapK((v) => (v === '' ? String(Math.round((d.contextCapTokens || 400000) / 1000)) : v));
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const act = async (path) => {
    setBusy(true);
    setErr('');
    try { await apiPost(`/arch/policeman/${path}`); await load(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const saveSettings = async () => {
    const intervalSeconds = Math.max(1, Number(intervalMin) || 5) * 60;
    const contextCapTokens = Math.max(20, Number(capK) || 400) * 1000;
    setBusy(true);
    try { await apiPost('/arch/policeman/settings', { intervalSeconds, contextCapTokens }); await load(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const [tone, label] = policemanState(st);
  const sessions = st?.sessions || [];
  const current = sessions.find((s) => !s.endedAt) || null;
  const ctx = st?.lastContextTokens;
  const cap = st?.contextCapTokens || 400000;
  const pct = ctx != null ? Math.min(100, Math.round((ctx / cap) * 100)) : 0;
  const v = st?.verdict;

  return (
    <div className="pm" data-policeman>
      <div className="pm__bar" data-policeman-bar>
        <span className="pm__title">👮 Policeman</span>
        <span className={`pm__pill pm__pill--${tone}`} data-policeman-state={tone}>{label}</span>
        {st && (
          <span className="pm__dim" data-policeman-meta>
            every {Math.max(1, Math.round((st.intervalSeconds || 300) / 60))} min
            {st.lastTurnAt ? ` · last pass ${ago(Date.now() - st.lastTurnAt)} ago` : ' · no pass yet'}
            {' · '}context <b className={pct >= 90 ? 'pm__hot' : ''}>{k(ctx)}</b> / {k(cap)}
            {' · '}session #{st.rollovers + 1}{st.rollovers ? ` (${st.rollovers} rollover${st.rollovers > 1 ? 's' : ''})` : ''}
            {st.restarts ? ` · ${st.restarts} auto re-arm${st.restarts > 1 ? 's' : ''}` : ''}
          </span>
        )}
        <span className="pm__spacer" />
        {st?.enabled
          ? <button type="button" className="pm__btn pm__btn--danger" onClick={() => act('stop')} disabled={busy} title="Stop the policeman: its loop stops and stays stopped until you start it again" data-policeman-stop>■ Stop</button>
          : <button type="button" className="pm__btn pm__btn--primary" onClick={() => act('start')} disabled={busy} title="Arm the policeman: one pass now, then one every interval, forever" data-policeman-start>▶ Start</button>}
        <button type="button" className="pm__btn" onClick={() => act('check')} disabled={busy || !!st?.running} title="One pass right now, in its conversation" data-policeman-check>👁 Check now</button>
        <button type="button" className="pm__btn" onClick={() => act('rollover')} disabled={busy || !st?.exists} title="Cut the current session and continue in a fresh one (the old one stays in History); the harness does this by itself at the context cap" data-policeman-rollover>↻ Roll over</button>
      </div>

      <div className="pm__row" data-policeman-settings>
        <label className="pm__field">interval (min)
          <input type="number" min={1} max={1440} value={intervalMin} onChange={(e) => setIntervalMin(e.target.value)} onBlur={saveSettings} data-policeman-interval />
        </label>
        <label className="pm__field">context cap (k tokens)
          <input type="number" min={20} max={2000} value={capK} onChange={(e) => setCapK(e.target.value)} onBlur={saveSettings} data-policeman-cap />
        </label>
        <div className="pm__meter" title={`context ${k(ctx)} of ${k(cap)} — at the cap the session is rolled over`}><div className={`pm__meter-fill${pct >= 90 ? ' pm__meter-fill--hot' : ''}`} style={{ width: `${pct}%` }} /></div>
        {v && (
          <span className={`pm__verdict${v.dishonest > 0 || v.stuck > 0 ? ' pm__verdict--alert' : ''}`} title="The harness's mechanical verdict, judged live (the same one board_integrity returns to the policeman)" data-policeman-verdict>
            board now: {v.honest} honest · {v.dishonest} dishonest · {v.stuck} stuck · {v.manual} manual
          </span>
        )}
        <button type="button" className="pm__link" onClick={() => setShowPrompt((s) => !s)} data-policeman-show-prompt>{showPrompt ? 'hide prompt' : 'show the prompt it runs'}</button>
        <button type="button" className="pm__link" onClick={() => setShowTools((s) => !s)}>{showTools ? 'hide tools' : 'its tools'}</button>
      </div>
      {showPrompt && st?.prompt && <pre className="pm__prompt" data-policeman-prompt>{st.prompt}</pre>}
      {showTools && st?.allowedTools && (
        <div className="pm__tools" data-policeman-tools>
          observe-only, {st.allowedTools.length} tools: {st.allowedTools.join(' · ')}. That is the whole list its session is offered — the arch's acting tools (send_task, dispatch_task, update_task, assign_task, delete_task, loops, goals…) are not on it, are switched off at the CLI, and are refused if it asks anyway. The Tools lane below shows each one with its usage.
        </div>
      )}
      {err && <div className="pm__err" data-policeman-error>{err}</div>}

      {sessions.length > 0 && (
        <div className="pm__sessions" data-policeman-sessions>
          <span className="pm__dim">sessions</span>
          {sessions.map((s, i) => {
            const isCurrent = !s.endedAt;
            const on = past ? past === s.sessionId : isCurrent;
            return (
              <button
                key={`${s.sessionId}-${i}`}
                type="button"
                className={`pm__session${on ? ' pm__session--on' : ''}${isCurrent ? ' pm__session--current' : ''}`}
                title={`${s.sessionId}\n${s.turns} turn(s) · context ${k(s.contextTokens)}${s.endedAt ? ` · ended ${ago(Date.now() - s.endedAt)} ago — ${s.endedBecause || ''}` : ' · current'}`}
                onClick={() => setPast(isCurrent ? null : s.sessionId)}
                data-policeman-session={s.sessionId}
              >
                #{i + 1} {s.sessionId.slice(0, 8)} · {s.turns}t · {k(s.contextTokens)}{isCurrent ? ' · now' : ''}
              </button>
            );
          })}
        </div>
      )}

      <div className="pm__body">
        {!st ? null : !st.exists ? (
          <div className="pm__empty" data-policeman-empty>
            <p>The policeman is an arch conversation that runs one fixed check forever: <b>is the Kanban honest?</b> It reads the board's verdict, the agents' real state and the repos' pull requests; moves a card forward only when GitHub proves it (an open PR traced back to a card still in Doing → PR open); flags stuck or lying cards with 🆘; and reports — it never dispatches, and never moves a card by claim.</p>
            <p>Press <b>▶ Start</b> to create its conversation and arm the loop. You can talk to it here like the arch, read every tool call in History, and stop it any time.</p>
          </div>
        ) : past ? (
          <div className="pm__past" data-policeman-past>
            <div className="pm__past-head">
              <span>past session <code>{past.slice(0, 8)}</code> — its tool calls (read-only provenance)</span>
              <button type="button" className="pm__link" onClick={() => setPast(null)} data-policeman-back>← back to the live conversation</button>
            </div>
            <ArchHistoryPanel conv={POLICEMAN_CONV} sessionOverride={past} />
          </div>
        ) : (
          <Arch popup view="chat" conv={POLICEMAN_CONV} />
        )}
      </div>
    </div>
  );
}
