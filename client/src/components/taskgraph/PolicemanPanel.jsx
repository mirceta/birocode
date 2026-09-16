import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import KanbanBoard from './KanbanBoard';
import { ago } from './cardSections';
import { loopState, timingLine, entrySummary, entryWhen, verdictLine, triggerWord, columnWord, rowActions, readingOf, flagOf, PASS, WRITES, NEVER, BEFORE } from './policemanLoop';
import './policeman.css';
import './policemanExplainer.css';
import './policemanPanel.css';

// The policeman (openspec one-policeman): ONE loop in harness code — every minute it traces pull
// requests to cards, reads the facts, moves cards forward, judges every card, asks the model one
// question per card whose assignee has new words, flags by rule, and journals the pass. This tab
// is its face: the bar (state, timing, Run now, reading on/off), the Sweep (one row per in-flight
// card; the 🧠 column is the only thing the model decides), a card's drawer (the words the model
// was shown, its timeline, the answer box for its flag), the History (the journal), and What it is.

const POLL_MS = 5000;
const SUB_KEY = 'manageapp.kanbanSub';
const VIEW_KEY = 'manageapp.policemanView';
const SUBS = ['board', 'policeman'];
function readSub() {
  try { const s = localStorage.getItem(SUB_KEY); return SUBS.includes(s) ? s : 'board'; } catch { return 'board'; }
}
function readView() {
  try { const v = localStorage.getItem(VIEW_KEY); return v === 'history' || v === 'explain' ? v : 'sweep'; } catch { return 'sweep'; }
}
const short = (id) => (id || '').slice(0, 8);
const stateWord = { stuck: '🛑 stuck', dishonest: '⚠️ not verified yet', honest: '✅ honest', manual: '🔧 manual' };

/** The Kanban tab: 📋 Board | 👮 Policeman (the choice is remembered per browser). */
export function KanbanTab() {
  const [sub, setSubState] = useState(readSub);
  const setSub = (s) => { setSubState(s); try { localStorage.setItem(SUB_KEY, s); } catch { /* private mode */ } };
  return (
    <div className="kbtab" data-kanban-tab>
      <div className="kbsub" role="tablist" aria-label="Kanban views" data-kanban-subtabs>
        <button type="button" role="tab" aria-selected={sub === 'board'} className={`kbsub__tab${sub === 'board' ? ' kbsub__tab--on' : ''}`} onClick={() => setSub('board')} data-kanban-sub="board">📋 Board</button>
        <button type="button" role="tab" aria-selected={sub === 'policeman'} className={`kbsub__tab${sub === 'policeman' ? ' kbsub__tab--on' : ''}`} onClick={() => setSub('policeman')} data-kanban-sub="policeman" title="The policeman: one loop in harness code that keeps the board honest — every minute it reads the facts, moves cards forward, asks the model one question per card with new words, and flags by rule">👮 Policeman</button>
      </div>
      <div className="kbtab__body">
        {sub === 'policeman' ? <PolicemanPanel /> : <KanbanBoard />}
      </div>
    </div>
  );
}

function Verb({ v }) {
  const cls = /asked/.test(v) ? ' pl__verb--brain' : v === 'raised' ? ' pl__verb--bad' : v === 'cleared' ? ' pl__verb--ok' : '';
  return <span className={`pl__verb${cls}`}>{v}</span>;
}

function FlagLines({ list, verb }) {
  if (!list?.length) return null;
  return list.map((f) => (
    <div key={`${verb}-${f.id}`} className="pl__what" data-policeman-flag={f.id} data-policeman-flag-verb={verb}>
      <Verb v={verb} /> 🆘 <b>#{short(f.id)}</b> {f.title}{f.reason ? <span className="pl__dim"> — {f.reason}</span> : null}
    </div>
  ));
}

function EntryDetails({ e }) {
  return (
    <>
      {e.traced?.map((t, i) => <div key={`t-${i}`} className="pl__what" data-policeman-traced={t.id}><Verb v="traced" /> <b>#{short(t.id)}</b> {t.title}: {t.pr} <span className="pl__dim">— {t.how}</span></div>)}
      {e.changes?.map((c, i) => <div key={`m-${i}`} className="pl__what" data-policeman-move={c.id}><Verb v="moved" /> <b>#{short(c.id)}</b> {c.title}{c.assignee ? <span className="pl__dim"> ({c.assignee})</span> : null}: {columnWord(c.from)} → <b>{columnWord(c.to)}</b></div>)}
      {e.questions?.map((q, i) => (
        <div key={`q-${i}`} className="pl__what" data-policeman-question={q.id}>
          <Verb v="asked 🧠" /> <b>#{short(q.id)}</b> {q.title}{q.error
            ? <span className="pl__dim"> — no usable answer: {q.error}</span>
            : <> → {readingOf({ observation: { state: q.state } })[0]} <b>{readingOf({ observation: { state: q.state } })[1]}</b> <span className="pl__dim">— {q.summary} · {(q.tokens || 0).toLocaleString('en-US')} tokens</span></>}
        </div>
      ))}
      <FlagLines list={e.raised} verb="raised" />
      <FlagLines list={e.cleared} verb="cleared" />
    </>
  );
}

function HistoryRow({ e, now }) {
  const loud = !e.error && (e.changes?.length || e.traced?.length || e.questions?.length || e.raised?.length || e.cleared?.length);
  return (
    <tr className={`pl__row${e.error ? ' pl__row--err' : ''}${loud ? ' pl__row--loud' : ''}`} data-policeman-entry data-policeman-trigger={e.trigger} data-policeman-repeats={e.repeats}>
      <td className="pl__when" title={new Date(e.at).toLocaleString('en-US') + (e.repeats > 1 ? ` → ${new Date(e.lastAt).toLocaleString('en-US')}` : '')}>{entryWhen(e, now)}</td>
      <td className="pl__trigger">{triggerWord(e.trigger)}</td>
      <td><div className="pl__sum">{entrySummary(e)}</div><EntryDetails e={e} /></td>
      <td className="pl__verdict" title="honest · not verified yet · need human · manual">{e.honest} · {e.dishonest} · {e.stuck} · {e.manual}</td>
      <td className="pl__dim pl__num">{e.checked}/{e.probed}</td>
      <td className="pl__dim pl__num">{e.durationMs} ms</td>
    </tr>
  );
}

function Drawer({ row, now, onClose, onAnswered }) {
  const [timeline, setTimeline] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    apiGet(`/taskgraph/policeman?card=${encodeURIComponent(row.id)}`).then((d) => { if (alive) setTimeline(d.history || []); }).catch(() => { if (alive) setTimeline([]); });
    return () => { alive = false; };
  }, [row.id, row.thisPass]);
  const flag = flagOf(row, now);
  const answer = async () => {
    if (!text.trim()) return;
    setBusy(true); setErr('');
    try { await apiPost(`/taskgraph/nodes/${encodeURIComponent(row.id)}/answer`, { text: text.trim() }); setText(''); onAnswered(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const [icon, word] = readingOf(row);
  return (
    <div className="pl__drawer" data-policeman-drawer={row.id}>
      <div className="pl__drawer-head">
        <b>#{short(row.id)} {row.title}</b>
        <span className="pl__dim">· {(row.assignees || []).map((a) => a.label).join(', ') || 'unassigned'} · {columnWord(row.status)} (facts: {columnWord(row.verifiedStatus)})</span>
        <button type="button" className="pm__link" onClick={onClose} data-policeman-close>close</button>
      </div>
      {row.needsHuman && (
        <div className="pl__answer" data-policeman-answer-box>
          <div>🆘 <b>{row.needsHuman.reason}</b> <span className="pl__dim">· {flag?.sub}</span></div>
          {row.needsHuman.answer
            ? <div className="pl__dim">your answer went to the agent; the flag clears once it continues — or answer again below.</div>
            : null}
          <div className="pl__answer-row">
            <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="answer the agent here — it goes into its conversation in your name; the flag clears when the agent continues" data-policeman-answer-text disabled={busy} onKeyDown={(e) => { if (e.key === 'Enter') answer(); }} />
            <button type="button" className="pm__btn pm__btn--primary" onClick={answer} disabled={busy || !text.trim()} data-policeman-answer>Answer</button>
          </div>
          {err && <div className="pm__err" data-policeman-answer-error>{err}</div>}
        </div>
      )}
      <div className="pl__dim">🧠 the model’s reading: {icon} <b>{word}</b>{row.observation ? <> — {row.observation.summary} · {ago(now - row.observation.at)} ago</> : null}</div>
      {row.said?.messages?.length ? (
        <>
          <div className="pl__dim">the agent’s last messages — what the model was shown ({row.said.agent}):</div>
          <ul className="pl__msgs" data-policeman-messages>
            {row.said.messages.map((m, i) => <li key={i}><span className="pl__dim">[{m.role}]{m.at ? ` ${ago(now - m.at)} ago` : ''}</span> {m.text}</li>)}
          </ul>
        </>
      ) : <div className="pl__dim">no words from the agent yet</div>}
      <div className="pl__dim">this card’s timeline — every pass that touched it:</div>
      {timeline === null ? <div className="pl__dim">loading…</div> : timeline.length === 0 ? <div className="pl__dim">nothing yet</div> : timeline.map((e) => (
        <div key={`${e.at}-${e.trigger}`} className="pl__tl" data-policeman-timeline-entry>
          <span className="pl__dim">{entryWhen(e, now)} · {triggerWord(e.trigger)}</span>
          <EntryDetails e={{ ...e, traced: (e.traced || []).filter((t) => t.id === row.id), changes: (e.changes || []).filter((c) => c.id === row.id), questions: (e.questions || []).filter((q) => q.id === row.id), raised: (e.raised || []).filter((f) => f.id === row.id), cleared: (e.cleared || []).filter((f) => f.id === row.id) }} />
        </div>
      ))}
    </div>
  );
}

function Sweep({ st, now, selected, setSelected, reload }) {
  const rows = st?.cards || [];
  const v = st?.integrity;
  const sel = rows.find((r) => r.id === selected) || null;
  return (
    <div className="pl__sweep" data-policeman-sweep>
      <div className="pl__hint">
        one row per in-flight card · the 🧠 column is the only thing the model decides · click a row for its words, its timeline, and to answer a flag
        {v?.flagged?.length ? <span data-policeman-flagged-now> · flagged now: {v.flagged.map((f) => `#${short(f.id)} ${stateWord[f.state] || f.state}`).join(' · ')}</span> : null}
      </div>
      {rows.length === 0 ? <div className="pm__empty" data-policeman-empty>No card is in flight — nothing to police. Assign a card on the board and the next pass picks it up.</div> : (
        <table className="pl__table">
          <thead><tr><th>card</th><th>column · facts</th><th>the agent last said</th><th>🧠 the model’s reading</th><th>this pass</th><th>🆘</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const [icon, word] = readingOf(r);
              const flag = flagOf(r, now);
              const actions = rowActions(r);
              return (
                <tr key={r.id} className={`pl__row pl__row--card${selected === r.id ? ' pl__row--on' : ''}${r.needsHuman ? ' pl__row--flag' : ''}`} onClick={() => setSelected(selected === r.id ? null : r.id)} data-policeman-card={r.id}>
                  <td><b>#{short(r.id)}</b><br /><span className="pl__title">{r.title}</span><br /><span className="pl__dim">{(r.assignees || []).map((a) => a.label).join(', ') || 'unassigned'}{r.pinged ? '' : ' · not pinged yet'}</span></td>
                  <td><b>{columnWord(r.status)}</b><br /><span className="pl__dim">facts: {columnWord(r.verifiedStatus)}{r.prNumber ? ` · PR #${r.prNumber}` : ' · no PR'}</span>{r.ahead ? <><br /><span className="pl__warn">⚠️ column ahead of the facts{r.againstSweeps > 1 ? ` (${r.againstSweeps} sweeps)` : ''}</span></> : null}</td>
                  <td className="pl__said">{r.said ? <>“{r.said.text.length > 220 ? r.said.text.slice(0, 217).trimEnd() + '…' : r.said.text}”<br /><span className="pl__dim">{r.said.agent}{r.said.at ? ` · ${ago(now - r.said.at)} ago` : ''}</span></> : <span className="pl__dim">nothing read yet</span>}</td>
                  <td className="pl__read"><span className="pl__brain">🧠</span> {icon} <b>{word}</b>{r.observation ? <><br /><span className="pl__dim">{r.observation.summary} · {ago(now - r.observation.at)} ago</span></> : null}</td>
                  <td>{actions.length ? actions.map(([verb, text], i) => <div key={i} className="pl__what"><Verb v={verb} /> {text}</div>) : <span className="pl__dim">nothing — facts unchanged, no new words</span>}</td>
                  <td>{flag ? <><span className="pl__flag">🆘 {flag.text}</span><br /><span className="pl__dim">{flag.sub}</span></> : <span className="pl__dim">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {sel && <Drawer row={sel} now={now} onClose={() => setSelected(null)} onAnswered={reload} />}
    </div>
  );
}

function History({ st, now, card, setCard }) {
  const history = st?.history || [];
  return (
    <div className="pl__hist" data-policeman-history>
      <div className="pl__hist-head">
        <label className="pm__field">card
          <select value={card} onChange={(e) => setCard(e.target.value)} data-policeman-history-card>
            <option value="">every pass</option>
            {(st?.cardsSeen || []).map((c) => <option key={c.id} value={c.id}>#{short(c.id)} {c.title}</option>)}
          </select>
        </label>
        <span className="pl__dim">
          {card ? `every pass that traced, moved, asked about, flagged or unflagged #${short(card)} — its timeline, newest first` : `every pass, newest first · quiet minutes are folded into one row · ${st?.passes ?? 0} passes in all`}
        </span>
      </div>
      {history.length === 0 ? <div className="pm__empty" data-policeman-history-empty>{card ? 'The journal has no pass that touched this card.' : 'No pass journaled yet — the first one runs at startup.'}</div> : (
        <table className="pl__table">
          <thead><tr><th>when</th><th>set off by</th><th>what it did</th><th title="honest · not verified yet · need human · manual">verdict</th><th>checked/probed</th><th>took</th></tr></thead>
          <tbody>{history.map((e) => <HistoryRow key={`${e.at}-${e.trigger}`} e={e} now={now} />)}</tbody>
        </table>
      )}
    </div>
  );
}

function Explainer({ st }) {
  const s = st?.settings || {};
  return (
    <div className="pl__explain pe" data-policeman-explainer>
      <section className="pe__sec">
        <h3>What the policeman is</h3>
        <p>
          <b>One loop, in harness code.</b> Every {st?.intervalSeconds || 60} seconds, and at startup or when you press Run now, it visits every in-flight card. Six of its seven steps are code: trace, facts, move, judge, flag, journal.
          One step asks the model — <b>one question per card whose assignee has said something new</b>: “here are its last {s.tail || 4} messages: which state is it in, and why, in one line.” That answer is the card’s Agent section, and it is the only thing the model decides.
          No conversation, no prompt to follow, no sessions, no tool fences: the model cannot touch anything. You answer a flag <b>on the card</b>; the answer goes to the agent in your name, and the flag clears once the agent continues.
        </p>
      </section>
      <section className="pe__sec">
        <h3>One pass, in order</h3>
        <ol className="pe__pass" data-policeman-pass>
          {PASS.map(([k, text, who]) => <li key={k} className={who === 'model' ? 'pl__step--model' : ''}><code>{who === 'model' ? '🧠 ' : ''}{k}</code><span>{text}</span></li>)}
        </ol>
      </section>
      <div className="pe__two">
        <section className="pe__sec">
          <h3>What it writes on a card</h3>
          <table className="pe__table" data-policeman-writes><tbody>{WRITES.map(([w, t]) => <tr key={w}><th>{w}</th><td>{t}</td></tr>)}</tbody></table>
        </section>
        <section className="pe__sec">
          <h3>What it never does</h3>
          <table className="pe__table pe__table--no" data-policeman-never><tbody>{NEVER.map((n) => <tr key={n}><th>never</th><td>{n}</td></tr>)}</tbody></table>
        </section>
      </div>
      <section className="pe__sec">
        <h3>Where this came from</h3>
        <table className="pe__table pe__table--drive" data-policeman-before><tbody>{BEFORE.map(([w, t]) => <tr key={w}><th>{w}</th><td>{t}</td></tr>)}</tbody></table>
        <p className="pe__note">openspec <code>one-policeman</code> · the Understanding app draws the loop.</p>
      </section>
    </div>
  );
}

export default function PolicemanPanel() {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setViewState] = useState(readView);
  const [selected, setSelected] = useState(null);
  const [card, setCard] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [model, setModel] = useState('');
  const [tail, setTail] = useState('');
  const [now, setNow] = useState(Date.now());
  const setView = (v) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };

  const load = useCallback(async () => {
    try {
      const d = await apiGet(`/taskgraph/policeman${view === 'history' && card ? `?card=${encodeURIComponent(card)}` : ''}`);
      setSt(d);
      setErr('');
      setNow(Date.now());
      setModel((m) => (m === '' ? d.settings?.model || 'haiku' : m));
      setTail((t) => (t === '' ? String(d.settings?.tail || 4) : t));
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }, [view, card]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const runNow = async () => {
    setBusy(true); setErr('');
    try { await apiPost('/taskgraph/verify', {}); await load(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };
  const settings = async (patch) => {
    setBusy(true); setErr('');
    try { await apiPost('/taskgraph/policeman/settings', patch); await load(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const [tone, label] = loopState(st);
  const v = st?.integrity;
  const enabled = st?.settings?.enabled !== false;
  return (
    <div className="pm pl" data-policeman>
      <div className="pm__bar" data-policeman-bar>
        <span className="pm__title">👮 Policeman</span>
        <span className={`pm__pill pm__pill--${tone}`} data-policeman-state={tone}>{label}</span>
        {st && <span className="pm__dim" data-policeman-meta>{timingLine(st, now)}</span>}
        <span className="pm__spacer" />
        <button type="button" className="pm__btn pm__btn--primary" onClick={runNow} disabled={busy || !!st?.running} title="One pass right now: trace PRs, read git and GitHub, move cards, judge, ask the model about cards with new words, flag" data-policeman-run>▶ Run a pass now</button>
        <button type="button" className={`pm__btn${enabled ? ' pm__btn--danger' : ' pm__btn--primary'}`} onClick={() => settings({ enabled: !enabled })} disabled={busy || !st} title={enabled ? 'Stop asking the model: the facts, moves, judge and mechanical flags keep running; no question is asked and the Agent section stops updating' : 'Start asking the model one question per card with new words'} data-policeman-toggle-reading>{enabled ? '■ Stop reading' : '▶ Start reading'}</button>
      </div>
      <div className="pm__row">
        <span className="pl__lead"><b>Harness code runs the sweep; the model is asked one question per card with new words.</b> One name on the card. What you see as <b>Board check</b> and <b>Agent</b> on a card comes from here.</span>
      </div>
      <div className="pm__row">
        {v && <span className={`pm__verdict${v.dishonest > 0 || v.stuck > 0 ? ' pm__verdict--alert' : ''}`} data-policeman-verdict>board now: {verdictLine(v)}</span>}
        {st?.last && <span className="pm__dim" data-policeman-last>last pass: {entrySummary(st.last)} · checked {st.last.checked}, probed {st.last.probed} · {st.last.durationMs} ms</span>}
        <button type="button" className="pm__link" onClick={() => setShowSettings((s) => !s)} data-policeman-show-settings>{showSettings ? 'hide settings' : 'settings'}</button>
      </div>
      {showSettings && (
        <div className="pm__row" data-policeman-settings>
          <label className="pm__field">model <input type="text" value={model} onChange={(e) => setModel(e.target.value)} onBlur={() => settings({ model })} data-policeman-model /></label>
          <label className="pm__field">messages shown <input type="number" min={1} max={12} value={tail} onChange={(e) => setTail(e.target.value)} onBlur={() => settings({ tail: Number(tail) || 4 })} data-policeman-tail /></label>
          <span className="pm__dim">at most {st?.settings?.maxQuestionsPerPass ?? 8} questions per pass · a question is one <code>claude -p</code> call with no tools and no repo context</span>
        </div>
      )}
      {err && <div className="pm__err" data-policeman-error>{err}</div>}

      <div className="pm__views" role="tablist" aria-label="Policeman views" data-policeman-views>
        {[['sweep', '🧹 Sweep'], ['history', '📜 History'], ['explain', '❓ What it is']].map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={view === k} className={`pm__view${view === k ? ' pm__view--on' : ''}`} onClick={() => setView(k)} data-policeman-view={k}>{l}</button>
        ))}
      </div>
      <div className="pm__body pl__body">
        {view === 'explain' ? <Explainer st={st} /> : view === 'history' ? <History st={st} now={now} card={card} setCard={setCard} /> : <Sweep st={st} now={now} selected={selected} setSelected={setSelected} reload={load} />}
      </div>
    </div>
  );
}
