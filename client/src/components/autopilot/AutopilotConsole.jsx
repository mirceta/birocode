import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete } from '../../api/client';
import ErrorBanner from '../shared/ErrorBanner';
import AgentsView from './AgentsView';
import LoopsView from './LoopsView';
import SystemTestsView from './SystemTestsView';
import ChatArchitectureView from './ChatArchitectureView';
import AutopilotArchitectureView from './AutopilotArchitectureView';
import '../../pages/autopilot.css';

// The full Autopilot console (plans/autopilot-to-harness.md): the complete
// detailed surface — Agents controls, Routine-prompt CRUD + mined drafts,
// Intercepted live feed, Suggestion history, and the Audit trail, all over
// /api/autopilot. This is the SINGLE implementation rendered by BOTH the routed
// Autopilot tab (pages/Autopilot.jsx, the mobile-first view) and the dashboard
// dock (components/dashboard/AutopilotPanel.jsx, viewable anywhere) — they are
// the same console, never two drifting copies.
//
// `embedded` drops the page header (the dock supplies its own title/summary).
//
// Two modes (the Auto-advance switch): OFF = suggest-only (it predicts, you press
// send); ON = auto-advance — a confident, non-risky suggestion is SENT to the
// agent on your behalf, every send recorded in the audit trail.
const POLL_MS = 4000;

// Intercept outcome → the badge class suffix (reuses .out-* from autopilot.css).
const OUT_CLS = { suggested: 'sugg', sent: 'sent', escalated: 'esc', skipped: 'skip' };

export default function AutopilotConsole({ embedded = false }) {
  const [tab, setTab] = useState('agents');
  const [data, setData] = useState(null); // { enabled, threshold, denyList, agents, log }
  const [discover, setDiscover] = useState(null);
  const [prompts, setPrompts] = useState(null); // the EDITABLE custom-prompt library
  const [draft, setDraft] = useState({ emoji: '', label: '', text: '' }); // add-prompt form
  const [editing, setEditing] = useState(null); // { id, emoji, label, text } | null
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [gated, setGated] = useState(false); // operator gate is off (HTTP 403)
  const [open, setOpen] = useState({});
  const timer = useRef(null);

  const load = useCallback(async () => {
    try {
      setData(await apiGet('/autopilot'));
      setGated(false);
      setError('');
    } catch (e) {
      // The whole API is fenced by the operator gate (default off); a 403 isn't a
      // failure, it's "the host hasn't enabled autopilot" — surface that explicitly
      // rather than as a generic error (plans/loop-autopilot-safety.md).
      if (e?.status === 403) {
        setGated(true);
        setError('');
      } else {
        setError('Could not load autopilot state.');
      }
    }
  }, []);

  useEffect(() => {
    load();
    timer.current = setInterval(load, POLL_MS);
    return () => clearInterval(timer.current);
  }, [load]);

  // The editable library and the mined drafts back the Routine-prompts tab.
  const loadPrompts = useCallback(async () => {
    try {
      setPrompts(await apiGet('/prompts'));
    } catch {
      setError('Could not load your routine prompts.');
    }
  }, []);
  const loadDiscover = useCallback(async () => {
    try {
      setDiscover(await apiGet('/autopilot/discover'));
    } catch {
      setError('Could not load mined suggestions.');
    }
  }, []);

  // Lazy-load both the first time the Routine-prompts tab opens.
  useEffect(() => {
    if (tab !== 'prompts') return;
    if (!prompts) loadPrompts();
    if (!discover) loadDiscover();
  }, [tab, prompts, discover, loadPrompts, loadDiscover]);

  const mutate = useCallback(async (body) => {
    try {
      setData(await apiPost('/autopilot/config', body)); // returns fresh state
    } catch {
      setError('Could not update autopilot settings.');
    }
  }, []);

  // Loop mode: arm / edit / stop a per-agent fixed-prompt resend loop. Returns the
  // fresh state so the live counters reconcile without waiting for the next poll.
  const loopAction = useCallback(async (body) => {
    try {
      setData(await apiPost('/autopilot/loop', body));
      setError('');
    } catch {
      setError('Could not update the loop.');
    }
  }, []);

  // --- editable custom-prompt CRUD (the recommender's label space) ---
  const addPrompt = useCallback(async (body) => {
    if (!body.text?.trim()) return;
    setBusy(true);
    try {
      await apiPost('/prompts', body);
      await loadPrompts();
      setError('');
    } catch {
      setError('Could not add the prompt.');
    } finally {
      setBusy(false);
    }
  }, [loadPrompts]);

  const savePrompt = useCallback(async (id, body) => {
    if (!body.text?.trim()) return;
    setBusy(true);
    try {
      await apiPatch(`/prompts/${id}`, body);
      setEditing(null);
      await loadPrompts();
      setError('');
    } catch {
      setError('Could not save the prompt.');
    } finally {
      setBusy(false);
    }
  }, [loadPrompts]);

  const removePrompt = useCallback(async (id) => {
    setBusy(true);
    try {
      await apiDelete(`/prompts/${id}`);
      await loadPrompts();
      setError('');
    } catch {
      setError('Could not delete the prompt.');
    } finally {
      setBusy(false);
    }
  }, [loadPrompts]);

  // Promote a mined draft into the editable library, then refresh both lists so
  // the draft shows as adopted (★) and the recommender picks it up next tick.
  const promoteMined = useCallback(async (text) => {
    setBusy(true);
    try {
      await apiPost('/prompts', { text });
      await Promise.all([loadPrompts(), loadDiscover()]);
      setError('');
    } catch {
      setError('Could not add that suggestion.');
    } finally {
      setBusy(false);
    }
  }, [loadPrompts, loadDiscover]);

  const log = data?.log ?? [];
  const audit = data?.audit ?? [];
  const activeLoops = (data?.loops ?? []).filter((l) => l.active).length;
  const intercepts = data?.intercepts ?? [];
  const autoAdvance = data?.autoAdvance ?? false;
  const library = prompts ?? [];
  const mined = discover?.routines ?? [];

  return (
    <div className={`autopilot${embedded ? ' autopilot--embedded' : ''}`}>
      {!embedded && (
        <header className="autopilot__head">
          <div>
            <h2 className="autopilot__title">Autopilot</h2>
            <p className="autopilot__sub">
              Advances idle agents through your routine prompts, or escalates when it
              hits a real decision. {autoAdvance
                ? 'Auto-advance is ON — confident, non-risky prompts are sent for you.'
                : 'Suggest-only — you still press send.'}
            </p>
          </div>
        </header>
      )}

      {error && <ErrorBanner message={error} />}

      {gated ? (
        <div className="ap-gateoff" role="status">
          <h3 className="ap-gateoff__title">Autopilot is turned off by the operator</h3>
          <p>
            Every <code>/api/autopilot</code> endpoint is fenced by an operator-side
            gate that defaults to <b>off</b>. The web UI <b>can never turn it on</b> —
            that switch lives only in the desktop app, so a steered web client or a
            prompt-injected brain can’t grant autopilot the authority to act.
          </p>
          <p>
            To enable it, open the <b>Claude Web</b> window on the host PC and click the
            <b> Autopilot: OFF</b> button (it turns green <b>ON</b>). It takes effect
            immediately — then reload.
          </p>
        </div>
      ) : (
      <>
      <nav className="ap-tabs">
        <button className={tab === 'agents' ? 'on' : ''} onClick={() => setTab('agents')}>Agents</button>
        <button className={tab === 'loops' ? 'on' : ''} onClick={() => setTab('loops')}>
          Loops{activeLoops ? ` ${activeLoops}` : ''}
        </button>
        <button className={tab === 'prompts' ? 'on' : ''} onClick={() => setTab('prompts')}>
          Routine prompts{library.length ? ` ${library.length}` : ''}
        </button>
        <button className={tab === 'intercepts' ? 'on' : ''} onClick={() => setTab('intercepts')}>
          Intercepted
        </button>
        <button className={tab === 'history' ? 'on' : ''} onClick={() => setTab('history')}>
          Suggestion history
        </button>
        <button className={tab === 'audit' ? 'on' : ''} onClick={() => setTab('audit')}>
          Audit{audit.length ? ` ${audit.length}` : ''}
        </button>
        <button className={tab === 'systests' ? 'on' : ''} onClick={() => setTab('systests')}>
          System tests
        </button>
        <button className={tab === 'chatarch' ? 'on' : ''} onClick={() => setTab('chatarch')}>
          How chat works
        </button>
        <button className={tab === 'autoarch' ? 'on' : ''} onClick={() => setTab('autoarch')}>
          How autopilot works
        </button>
      </nav>

      {tab === 'agents' && <AgentsView data={data} mutate={mutate} />}

      {tab === 'loops' && <LoopsView data={data} loopAction={loopAction} />}

      {tab === 'systests' && <SystemTestsView />}

      {tab === 'chatarch' && <ChatArchitectureView />}

      {tab === 'autoarch' && <AutopilotArchitectureView />}

      {tab === 'prompts' && (
        <>
          <p className="autopilot__summary">
            The brain's entire label space — <b>your editable list</b>. Autopilot can only
            ever send one of these, or escalate; nothing here, nothing gets sent. Edit them
            freely; below, your history suggests drafts you can add in one click.
          </p>

          {/* Add a prompt */}
          <form
            className="rp-add"
            onSubmit={(e) => {
              e.preventDefault();
              addPrompt(draft);
              setDraft({ emoji: '', label: '', text: '' });
            }}
          >
            <input
              className="rp-add__emoji"
              value={draft.emoji}
              onChange={(e) => setDraft((d) => ({ ...d, emoji: e.target.value }))}
              placeholder="🙂"
              aria-label="Emoji (optional)"
            />
            <input
              className="rp-add__label"
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
              placeholder="Label (optional)"
            />
            <input
              className="rp-add__text"
              value={draft.text}
              onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
              placeholder="Prompt autopilot can send, e.g. “keep it”"
            />
            <button className="rp-add__btn" type="submit" disabled={busy || !draft.text.trim()}>Add</button>
          </form>

          {/* The editable library */}
          <ul className="rp-list">
            {library.map((p) => (
              <li key={p.id} className="rp-item">
                {editing?.id === p.id ? (
                  <div className="rp-edit">
                    <input
                      className="rp-edit__emoji"
                      value={editing.emoji}
                      onChange={(e) => setEditing((s) => ({ ...s, emoji: e.target.value }))}
                      aria-label="Emoji"
                    />
                    <input
                      className="rp-edit__label"
                      value={editing.label}
                      onChange={(e) => setEditing((s) => ({ ...s, label: e.target.value }))}
                      placeholder="Label"
                    />
                    <input
                      className="rp-edit__text"
                      value={editing.text}
                      onChange={(e) => setEditing((s) => ({ ...s, text: e.target.value }))}
                      placeholder="Prompt text"
                    />
                    <button className="rp-mini on" disabled={busy || !editing.text.trim()}
                      onClick={() => savePrompt(p.id, { emoji: editing.emoji, label: editing.label, text: editing.text })}>
                      Save
                    </button>
                    <button className="rp-mini" disabled={busy} onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                ) : (
                  <>
                    <div className="rp-item__main">
                      {(p.emoji || p.label) && (
                        <div className="rp-item__head">
                          {p.emoji && <span className="rp-item__emoji">{p.emoji}</span>}
                          {p.label && <span className="rp-item__label">{p.label}</span>}
                        </div>
                      )}
                      <code className="rp-item__text">{p.text}</code>
                    </div>
                    <div className="rp-item__actions">
                      <button className="rp-mini" disabled={busy}
                        onClick={() => setEditing({ id: p.id, emoji: p.emoji || '', label: p.label || '', text: p.text })}>
                        Edit
                      </button>
                      <button className="rp-mini rp-mini--danger" disabled={busy} onClick={() => removePrompt(p.id)}>
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </li>
            ))}
            {prompts && library.length === 0 && (
              <li className="autopilot__empty">
                No routine prompts yet — add one above (or adopt a suggestion below). Until you do,
                autopilot escalates every turn.
              </li>
            )}
          </ul>

          {/* Mined drafts — suggested from history, one-click adopt */}
          <h3 className="rp-section">Suggested from your history</h3>
          <p className="autopilot__summary autopilot__summary--sub">
            Replies you’ve repeated ≥3× across repos. These are <b>drafts only</b> — nothing here is
            recommendable until you add it to your list. Already-adopted ones are marked ★.
          </p>
          <ol className="autopilot__list">
            {mined.map((r, i) => (
              <li key={i} className="routine">
                <div className="routine__rank">{i + 1}</div>
                <div className="routine__body">
                  <div className="routine__line">
                    <span className="routine__text">{r.text}</span>
                    <span className="routine__count">×{r.count}</span>
                    {r.matchesCustomPrompt
                      ? <span className="routine__tag">★ added</span>
                      : (
                        <button className="rp-mini on routine__add" disabled={busy} onClick={() => promoteMined(r.text)}>
                          + Add to my prompts
                        </button>
                      )}
                  </div>
                  <div className="routine__meta">
                    {r.sessions} sessions · {r.repos} repos
                    {r.sampleContexts?.length > 0 && (
                      <button className="routine__toggle" onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}>
                        {open[i] ? 'hide contexts' : 'show contexts'}
                      </button>
                    )}
                  </div>
                  {open[i] && r.sampleContexts?.length > 0 && (
                    <ul className="routine__contexts">
                      {r.sampleContexts.map((c, j) => (
                        <li key={j} className="routine__context">
                          <span className="routine__context-label">after</span> {c}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </li>
            ))}
            {discover && mined.length === 0 && <li className="autopilot__empty">No recurring replies found in your history yet.</li>}
          </ol>
        </>
      )}

      {tab === 'intercepts' && (
        <>
          <p className="autopilot__summary">
            Every agent message the engine <b>grabs and processes</b>, newest first — a live feed
            of the loop at work. Each row moves from <b>processing…</b> to its outcome.
          </p>
          <ul className="ap-feed">
            {intercepts.map((e) => {
              const processing = e.phase === 'processing';
              const out = e.outcome || 'suggested';
              return (
                <li key={e.id} className={`ap-feed__row ${processing ? 'is-proc' : ''}`}>
                  <span className="ap-log__t">{new Date(e.at).toLocaleTimeString()}</span>
                  <span className="ap-feed__ag">{e.repoName}</span>
                  <span className="ap-feed__snip" title={e.snippet}>{e.snippet}</span>
                  <span className="ap-feed__status">
                    {processing ? (
                      <><span className="ap-spinner" /> <span className="ap-muted">processing…</span></>
                    ) : (
                      <>
                        <span className={`ap-out out-${OUT_CLS[out] ?? 'skip'}`}>{out}</span>
                        {e.label && (out === 'sent' || out === 'suggested') && <code>{e.label}</code>}
                      </>
                    )}
                  </span>
                </li>
              );
            })}
            {intercepts.length === 0 && (
              <li className="autopilot__empty">
                No interceptions yet — arm an agent and the engine will start grabbing its replies.
              </li>
            )}
          </ul>
        </>
      )}

      {tab === 'history' && (
        <ul className="ap-log">
          {log.map((e, i) => (
            <li key={i}>
              <span className="ap-log__t">{new Date(e.at).toLocaleTimeString()}</span>
              <span className="ap-log__ag">{e.repoName}</span>
              <span className={`ap-out out-${e.outcome === 'escalated' ? 'esc' : 'sugg'}`}>{e.outcome}</span>
              <span className="ap-log__pr">{e.label ? <code>{e.label}</code> : <span className="ap-muted">—</span>}</span>
              <span className="ap-log__cf">{e.confidence ? e.confidence.toFixed(2) : ''}</span>
            </li>
          ))}
          {log.length === 0 && <li className="autopilot__empty">No suggestions yet — arm an agent and wait for its next idle turn.</li>}
        </ul>
      )}

      {tab === 'audit' && (
        <>
          <p className="autopilot__summary">
            Every prompt autopilot actually <b>sent</b> on your behalf — the durable,
            append-only record (most recent first).
          </p>
          <ul className="ap-log ap-log--audit">
            {audit.map((e, i) => (
              <li key={i}>
                <span className="ap-log__t">{new Date(e.at).toLocaleString()}</span>
                <span className="ap-log__ag">{e.repoName}</span>
                <span className="ap-out out-sent">sent</span>
                <span className="ap-log__pr"><code>{e.prompt}</code></span>
                <span className="ap-log__cf">{e.confidence ? e.confidence.toFixed(2) : ''}</span>
                <span className="ap-log__ans" title={e.answeredMessage}>↳ {e.answeredMessage}</span>
              </li>
            ))}
            {audit.length === 0 && (
              <li className="autopilot__empty">
                Nothing auto-sent yet. Turn on Auto-advance and arm an agent.
              </li>
            )}
          </ul>
        </>
      )}
      </>
      )}
    </div>
  );
}
