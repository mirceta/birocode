import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import { checkState, timingLine, entrySummary, entryWhen, verdictLine, triggerWord, PASS, WRITES, NEVER, WRITERS } from './boardCheck';
import './policeman.css';
import './policemanExplainer.css';
import './boardcheck.css';

// The Board check, made provenant (openspec board-check-provenance): its own subtab of the
// Kanban, beside the Policeman. The bar says what it is and when it last ran; the history is
// the journal of every pass (quiet minutes coalesced into runs); a card picker turns the
// history into that card's timeline; "what it is" explains the loop in the same words the
// cards use, and sets it beside the policeman so "which of the two wrote this?" is answerable.

const POLL_MS = 5000;
const VIEW_KEY = 'manageapp.boardCheckView';
function readView() {
  try { return localStorage.getItem(VIEW_KEY) === 'explain' ? 'explain' : 'history'; } catch { return 'history'; }
}
const short = (id) => (id || '').slice(0, 8);
const stateWord = { stuck: '🛑 stuck', dishonest: '⚠️ not verified yet', honest: '✅ honest', manual: '🔧 manual' };

function Flags({ list, verb }) {
  if (!list?.length) return null;
  return list.map((f) => (
    <div key={`${verb}-${f.id}`} className="bc__what" data-boardcheck-flag={f.id} data-boardcheck-flag-verb={verb}>
      <span className="bc__verb">{verb}</span> 🆘 <b>#{short(f.id)}</b> {f.title}{f.reason ? <span className="bc__dim"> — {f.reason}</span> : null}
    </div>
  ));
}

function Entry({ e, now }) {
  return (
    <tr className={`bc__row${e.error ? ' bc__row--err' : ''}${e.changes?.length || e.raised?.length || e.cleared?.length ? ' bc__row--loud' : ''}`} data-boardcheck-entry data-boardcheck-trigger={e.trigger} data-boardcheck-repeats={e.repeats}>
      <td className="bc__when" title={new Date(e.at).toLocaleString() + (e.repeats > 1 ? ` → ${new Date(e.lastAt).toLocaleString()}` : '')}>{entryWhen(e, now)}</td>
      <td className="bc__trigger">{triggerWord(e.trigger)}</td>
      <td className="bc__did">
        <div className="bc__sum">{entrySummary(e)}</div>
        {e.changes?.map((c, i) => (
          <div key={`m-${i}`} className="bc__what" data-boardcheck-move={c.id}>
            <span className="bc__verb">moved</span> <b>#{short(c.id)}</b> {c.title}{c.assignee ? <span className="bc__dim"> ({c.assignee})</span> : null}: {c.from} → <b>{c.to}</b>
          </div>
        ))}
        <Flags list={e.raised} verb="raised" />
        <Flags list={e.cleared} verb="cleared" />
      </td>
      <td className="bc__verdict" title="honest · not verified yet · need human · manual">{e.honest} · {e.dishonest} · {e.stuck} · {e.manual}</td>
      <td className="bc__dim bc__num">{e.checked}/{e.probed}</td>
      <td className="bc__dim bc__num">{e.durationMs} ms</td>
    </tr>
  );
}

function Explainer({ st }) {
  const interval = st?.intervalSeconds || 60;
  return (
    <div className="bc__explain pe" data-boardcheck-explainer>
      <section className="pe__sec">
        <h3>What the Board check is</h3>
        <p>
          <b>Harness code — not a model, not a prompt.</b> A background loop that runs once at startup and then every {interval} seconds,
          and also whenever you press <b>Re-verify</b> on the board or the policeman asks for a card to be synced. It is older
          than the policeman conversation and does most of the work the word "policeman" suggests: it reads the real facts,
          moves cards forward to what the facts prove, and judges every card. Everything it writes on a card says
          <b> auto-verifier</b> or <b>board-check</b>, so you always know it was this loop and not the policeman.
        </p>
      </section>
      <section className="pe__sec">
        <h3>One pass, in order</h3>
        <ol className="pe__pass" data-boardcheck-pass>
          {PASS.map(([k, text]) => <li key={k}><code>{k}</code><span>{text}</span></li>)}
        </ol>
      </section>
      <div className="pe__two">
        <section className="pe__sec">
          <h3>What it writes on a card</h3>
          <table className="pe__table" data-boardcheck-writes><tbody>
            {WRITES.map(([w, t]) => <tr key={w}><th>{w}</th><td>{t}</td></tr>)}
          </tbody></table>
        </section>
        <section className="pe__sec">
          <h3>What it never does</h3>
          <table className="pe__table pe__table--no" data-boardcheck-never><tbody>
            {NEVER.map((n) => <tr key={n}><th>never</th><td>{n}</td></tr>)}
          </tbody></table>
        </section>
      </div>
      <section className="pe__sec">
        <h3>Two writers on one card</h3>
        <p className="pe__note">The Board check and the policeman conversation both write on your cards. Side by side, so nothing is hidden:</p>
        <table className="pe__table pe__table--drive bc__writers" data-boardcheck-writers>
          <thead><tr><th></th><th>🔎 Board check</th><th>👮 Policeman</th></tr></thead>
          <tbody>
            {WRITERS.map(([label, a, b]) => <tr key={label}><th>{label}</th><td>{a}</td><td>{b}</td></tr>)}
          </tbody>
        </table>
        <p className="pe__note">
          They share one responsibility — keep the board honest — split by who can decide: the Board check decides by
          rules, the policeman by reading. The plan to fold them into one loop (the Board check runs the sweep and asks the
          model one question per card that has new messages) is openspec <code>one-policeman</code>; the Understanding app
          draws it.
        </p>
      </section>
    </div>
  );
}

export default function BoardCheckPanel() {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [card, setCard] = useState('');
  const [view, setViewState] = useState(readView);
  const [now, setNow] = useState(Date.now());
  const setView = (v) => { setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* private mode */ } };

  const load = useCallback(async () => {
    try {
      const d = await apiGet(`/taskgraph/boardcheck${card ? `?card=${encodeURIComponent(card)}` : ''}`);
      setSt(d);
      setErr('');
      setNow(Date.now());
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }, [card]);

  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const runNow = async () => {
    setBusy(true);
    setErr('');
    try { await apiPost('/taskgraph/verify', {}); await load(); }
    catch (e) { setErr(e?.message || String(e)); }
    finally { setBusy(false); }
  };

  const [tone, label] = checkState(st);
  const v = st?.integrity;
  const history = st?.history || [];
  const last = st?.last;

  return (
    <div className="pm bc" data-boardcheck>
      <div className="pm__bar" data-boardcheck-bar>
        <span className="pm__title">🔎 Board check</span>
        <span className={`pm__pill pm__pill--${tone}`} data-boardcheck-state={tone}>{label}</span>
        {st && <span className="pm__dim" data-boardcheck-meta>{timingLine(st, now)}</span>}
        <span className="pm__spacer" />
        <button type="button" className="pm__btn pm__btn--primary" onClick={runNow} disabled={busy || !!st?.running} title="One pass right now: git for this machine's assignees, GitHub for every card with a PR, then the judge" data-boardcheck-run>▶ Run a pass now</button>
      </div>
      <div className="pm__row">
        <span className="bc__lead">
          <b>Harness code, no model.</b> Every {st?.intervalSeconds || 60} s it reads git and GitHub, moves cards forward to what the facts prove, judges every card, and flags stuck ones. What you see as <b>Board check</b> on a card comes from here.
        </span>
      </div>
      <div className="pm__row">
        {v && (
          <span className={`pm__verdict${v.dishonest > 0 || v.stuck > 0 ? ' pm__verdict--alert' : ''}`} data-boardcheck-verdict>
            board now: {verdictLine(v)}
          </span>
        )}
        {last && <span className="pm__dim" data-boardcheck-last>last pass: {entrySummary(last)} · checked {last.checked}, probed {last.probed} · {last.durationMs} ms</span>}
      </div>
      {err && <div className="pm__err" data-boardcheck-error>{err}</div>}

      <div className="pm__views" role="tablist" aria-label="Board check views" data-boardcheck-views>
        <button type="button" role="tab" aria-selected={view === 'history'} className={`pm__view${view === 'history' ? ' pm__view--on' : ''}`} onClick={() => setView('history')} data-boardcheck-view="history">📜 History</button>
        <button type="button" role="tab" aria-selected={view === 'explain'} className={`pm__view${view === 'explain' ? ' pm__view--on' : ''}`} onClick={() => setView('explain')} data-boardcheck-view="explain">❓ What it is</button>
      </div>
      <div className="pm__body bc__body">
        {view === 'explain' ? <Explainer st={st} /> : (
          <div className="bc__hist" data-boardcheck-history>
            <div className="bc__hist-head">
              <label className="pm__field">card
                <select value={card} onChange={(e) => setCard(e.target.value)} data-boardcheck-card>
                  <option value="">every pass</option>
                  {(st?.cards || []).map((c) => <option key={c.id} value={c.id}>#{short(c.id)} {c.title}</option>)}
                </select>
              </label>
              <span className="pm__dim">
                {card
                  ? `every pass that moved, flagged or unflagged #${short(card)} — its timeline, newest first`
                  : `every pass, newest first · quiet minutes are folded into one row · ${st?.passes ?? 0} passes in all`}
              </span>
              {v?.flagged?.length ? <span className="pm__dim" data-boardcheck-flagged-now>flagged now: {v.flagged.map((f) => `#${short(f.id)} ${stateWord[f.state] || f.state}`).join(' · ')}</span> : null}
            </div>
            {history.length === 0 ? (
              <div className="pm__empty" data-boardcheck-empty>{card ? 'The journal has no pass that touched this card.' : 'No pass journaled yet — the first one runs at startup.'}</div>
            ) : (
              <table className="bc__table">
                <thead><tr><th>when</th><th>set off by</th><th>what it did</th><th title="honest · not verified yet · need human · manual">verdict</th><th>checked/probed</th><th>took</th></tr></thead>
                <tbody>{history.map((e) => <Entry key={`${e.at}-${e.trigger}`} e={e} now={now} />)}</tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
