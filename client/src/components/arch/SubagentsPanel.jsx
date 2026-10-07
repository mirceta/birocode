import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import Arch from '../../pages/Arch';
import AgentStatusDot from '../shared/AgentStatusDot';
import { subagentList, sortSubagents, subagentDot, subagentBadge, subagentTitle, iterationsWord, lastActivityAt, needsHuman } from './subagents';
import { progressWord, awaitingStep } from './goalPlan';
import GoalPlanPanel from './GoalPlanPanel';
import './subagents.css';

// The Subagents tab (fleet task 592abffb, openspec arch-subagents-tab): ALL goal
// conversations (and any other sibling arch conversation) in ONE place — a vertical
// selector on the left, the selected conversation on the right in the SAME view the Arch
// tab uses (so a running goal keeps its queued-message composer / NEEDS_HUMAN answer path,
// and a finished one reads back exactly as it ran). No more one toolbar tab per goal.
//
// Rows reuse the repo agents' AgentStatusDot (one palette: pulsing = a turn runs now,
// amber = NEEDS_HUMAN waits on you, green = armed between polls, grey = finished), carry
// the state word, iterations/cap and the last poll; attention sorts first. Running goals
// get Stop (the same stop_arch_goal); finished ones can be hidden per device so the list
// stays manageable (the conversation and its transcript stay on the server untouched).
//
// The goal's STEP PLAN (openspec goal-step-plan) rides along: the row carries the done/total
// fraction and the circle reflects the active step (a blocked step is amber attention); the
// selected goal shows its stepper (GoalPlanPanel) above the conversation, live on the same
// poll, with the answer box of a NEEDS_HUMAN hold and Continue-from-the-plan for ended goals.

const POLL_MS = 5000;
const SEL_KEY = 'manageapp.subagent';
const HIDDEN_KEY = 'manageapp.subagentsHidden';

const readJson = (k, fb) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? fb; } catch { return fb; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } };

function ago(ms) {
  if (!ms || ms <= 0) return '—';
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 5) return 'now';
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

export default function SubagentsPanel({ select = null, onOpenDock = null, onConversationChanged = null }) {
  const [convs, setConvs] = useState(null);
  const [error, setError] = useState('');
  const [sel, setSelState] = useState(() => { try { return localStorage.getItem(SEL_KEY) || null; } catch { return null; } });
  const [hidden, setHidden] = useState(() => { const v = readJson(HIDDEN_KEY, []); return Array.isArray(v) ? v : []; });
  const [showHidden, setShowHidden] = useState(false);
  const setSel = (id) => { setSelState(id); try { localStorage.setItem(SEL_KEY, id || ''); } catch { /* private mode */ } };

  const load = useCallback(async () => {
    try {
      const r = await apiGet('/arch/conversations');
      setConvs(Array.isArray(r?.conversations) ? r.conversations : []);
      setError('');
    } catch (e) { setError(e?.message || String(e)); }
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(() => { if (!document.hidden) load(); }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // The host hands a conversation to select (a freshly started goal, a ?tab=arch:<id>
  // deep link from before this tab existed): honour it, once per value.
  useEffect(() => { if (select) setSel(select); }, [select]); // eslint-disable-line react-hooks/exhaustive-deps

  const all = useMemo(() => sortSubagents(subagentList(convs)), [convs]);
  const rows = useMemo(() => all.filter((c) => showHidden || !hidden.includes(c.id)), [all, hidden, showHidden]);
  const hiddenCount = all.length - all.filter((c) => !hidden.includes(c.id)).length;
  const current = all.find((c) => c.id === sel) || null;
  // Nothing picked (or the pick vanished): the topmost row is the obvious one.
  const shownId = current ? current.id : rows[0]?.id || null;
  const shown = all.find((c) => c.id === shownId) || null;

  const stopGoal = async (c, e) => {
    e.stopPropagation();
    const g = c.goal;
    if (!g || !window.confirm(`Stop goal ${g.id}? Its conversation releases the repos and tasks it owns.`)) return;
    try { await apiPost(`/arch/goals/${encodeURIComponent(g.id)}/stop`, {}); setTimeout(load, 300); }
    catch (x) { setError(x?.message || String(x)); }
  };
  const toggleHide = (c, e) => {
    e.stopPropagation();
    setHidden((prev) => {
      const next = prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id];
      save(HIDDEN_KEY, next);
      return next;
    });
  };

  return (
    <div className="sa" data-subagents>
      <aside className="sa__list" aria-label="Goal conversations" data-subagents-list>
        <div className="sa__head">
          <span className="sa__title">Goal conversations</span>
          <span className="sa__dim" data-subagents-count={all.length}>{all.length === 0 ? 'none yet' : `${all.length}`}</span>
        </div>
        {convs === null && !error && <div className="sa__dim sa__pad">Loading…</div>}
        {error && <div className="sa__err">{error}</div>}
        {convs !== null && all.length === 0 && (
          <div className="sa__dim sa__pad">No goal conversations yet. Start one from the Arch tab's Loops lane ("▶ Start goal conversation"), or ask the arch: “arch, run a goal: … on …”.</div>
        )}
        <div className="sa__rows">
          {rows.map((c) => {
            const dot = subagentDot(c);
            const badge = subagentBadge(c);
            const isHidden = hidden.includes(c.id);
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                className={`sa__row${shownId === c.id ? ' sa__row--on' : ''}${isHidden ? ' sa__row--hidden' : ''}`}
                onClick={() => setSel(c.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSel(c.id); } }}
                title={`${subagentTitle(c, 300)}${c.goal ? `\n${dot.label}` : ''}`}
                data-subagent={c.id}
                data-subagent-state={badge}
              >
                <AgentStatusDot state={dot.state} title={dot.label} />
                <span className="sa__row-text">
                  <span className="sa__row-title">{subagentTitle(c)}</span>
                  <span className="sa__row-meta">
                    <b className={`sa__badge sa__badge--${badge.replace(/\s+/g, '-')}`}>{badge}</b>
                    {c.goal && progressWord(c.goal) ? <span className="sa__progress" title="plan steps done / total" data-subagent-progress={progressWord(c.goal)}>{progressWord(c.goal)} steps</span> : null}
                    {c.goal ? <span className="sa__dim">{iterationsWord(c)} turns</span> : null}
                    {c.goal ? <span className="sa__dim" title="last poll">{ago(lastActivityAt(c))}</span> : null}
                    {c.goal?.queued ? <span className="sa__dim" title="messages queued for its next poll">✉ {c.goal.queued}</span> : null}
                  </span>
                  {needsHuman(c) && (awaitingStep(c.goal)?.note || c.goal?.stopDetail) ? <span className="sa__question" data-subagent-question>{awaitingStep(c.goal)?.note || c.goal.stopDetail}</span> : null}
                </span>
                <span className="sa__row-actions">
                  {c.goal && (c.busy || c.goal.state === 'running') && <button type="button" className="sa__act" onClick={(e) => stopGoal(c, e)} title={`Stop goal ${c.goal.id} (stop_arch_goal): releases the repos and tasks it owns`} data-stop-goal={c.goal.id}>■ stop</button>}
                  {!(c.busy || c.running) && <button type="button" className="sa__act" onClick={(e) => toggleHide(c, e)} title={isHidden ? 'Show this conversation in the list again' : 'Hide this finished conversation from the list (per device; nothing is deleted)'} data-hide-subagent={c.id}>{isHidden ? 'unhide' : 'hide'}</button>}
                </span>
              </div>
            );
          })}
        </div>
        {hiddenCount > 0 && (
          <button type="button" className="sa__showhidden" onClick={() => setShowHidden((v) => !v)} data-toggle-hidden>
            {showHidden ? 'conceal hidden again' : `show ${hiddenCount} hidden`}
          </button>
        )}
      </aside>
      <div className="sa__conv" data-subagents-conv={shown?.id || ''}>
        {shown?.goal && <GoalPlanPanel goal={shown.goal} onChanged={load} onStarted={(id) => { setSel(id); load(); onConversationChanged?.({ id, created: true }); }} />}
        {shown
          ? <Arch popup view="chat" conv={shown.id} onOpenDock={onOpenDock} onConversationChanged={onConversationChanged} />
          : <div className="sa__dim sa__pad" data-subagents-empty>Nothing selected — every goal the arch runs will appear in the list on the left, with its live state; the toolbar stays two tabs however many there are.</div>}
      </div>
    </div>
  );
}
