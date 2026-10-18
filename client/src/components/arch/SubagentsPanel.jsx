import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiGet, apiPost } from '../../api/client';
import Arch from '../../pages/Arch';
import AgentStatusDot from '../shared/AgentStatusDot';
import { subagentList, sortSubagents, subagentDot, subagentBadge, subagentTitle, iterationsWord, lastActivityAt, needsHuman } from './subagents';
import { progressWord, awaitingStep } from './goalPlan';
import GoalPlanPanel from './GoalPlanPanel';
import { archOwner } from './subagentOwner';
import GoalUnderstandingTab from './GoalUnderstandingTab';
import { GOAL_TABS, planBlocked, resolveGoalTab, writeGoalTab } from './goalTabs';
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

// The OWNER (openspec repo-agent-subagents): the arch by default (this tab, unchanged), or one
// repo agent (the dock's Subagents lane) — every path, label and storage key comes from it, and
// the right pane renders through `renderConversation` (the Arch page for the arch, the
// subagent's transcript for a repo agent). One component, two owners — never a fork.
const POLL_MS = 5000;

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

export default function SubagentsPanel({ select = null, onOpenDock = null, onConversationChanged = null, owner = archOwner, renderConversation = null, header = null, onRows = null }) {
  const SEL_KEY = owner.storageKey('subagent');
  const HIDDEN_KEY = owner.storageKey('subagentsHidden');
  const [convs, setConvs] = useState(null);
  const [error, setError] = useState('');
  const [sel, setSelState] = useState(() => { try { return localStorage.getItem(SEL_KEY) || null; } catch { return null; } });
  const [hidden, setHidden] = useState(() => { const v = readJson(HIDDEN_KEY, []); return Array.isArray(v) ? v : []; });
  const [showHidden, setShowHidden] = useState(false);
  // The per-goal tabbed right pane (fleet task 93b481e6): Step plan · Chat · Understanding,
  // remembered per goal conversation. The remembered choice wins; the default (Step plan when
  // a step is blocked, else Chat) applies only when none is remembered.
  const [tab, setTabState] = useState('chat');
  const setSel = (id) => { setSelState(id); try { localStorage.setItem(SEL_KEY, id || ''); } catch { /* private mode */ } };

  const load = useCallback(async () => {
    try {
      const r = await apiGet(owner.listPath);
      const rows = owner.rowsOf(r) || [];
      setConvs(rows);
      onRows?.(rows, r);
      setError('');
    } catch (e) { setError(e?.message || String(e)); }
  }, [owner.listPath]); // eslint-disable-line react-hooks/exhaustive-deps
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

  // Resolve the tab when the SELECTION changes (not on every poll, so a live update never
  // yanks the Operator off a tab they chose). Keyed by conversation id; remembered per goal.
  const setTab = (t) => { setTabState(t); writeGoalTab(shownId, t, (k, v) => localStorage.setItem(k, v)); };
  useEffect(() => {
    if (shown?.goal) setTabState(resolveGoalTab(shownId, shown.goal, (k) => localStorage.getItem(k)));
  }, [shownId]); // eslint-disable-line react-hooks/exhaustive-deps

  const stopGoal = async (c, e) => {
    e.stopPropagation();
    const g = c.goal;
    if (!g || !window.confirm(owner.stopConfirm(g.id))) return;
    try { await apiPost(owner.goalPath(g.id, 'stop'), {}); setTimeout(load, 300); }
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
    <div className={`sa sa--${owner.kind}`} data-subagents data-subagents-owner={owner.kind}>
      <aside className="sa__list" aria-label={owner.title} data-subagents-list>
        {header}
        <div className="sa__head">
          <span className="sa__title">{owner.title}</span>
          <span className="sa__dim" data-subagents-count={all.length}>{all.length === 0 ? 'none yet' : `${all.length}`}</span>
        </div>
        {convs === null && !error && <div className="sa__dim sa__pad">Loading…</div>}
        {error && <div className="sa__err">{error}</div>}
        {convs !== null && all.length === 0 && (
          <div className="sa__dim sa__pad" data-subagents-none>{owner.emptyText}</div>
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
                    {c.readOnly ? <span className="sa__dim" title="a read-only helper: it never modifies the checkout">read-only</span> : c.goal?.concurrent ? <span className="sa__dim" title="a writer that runs alongside the agent (no lock)">concurrent</span> : null}
                    {c.goal ? <span className="sa__dim" title="last poll">{ago(lastActivityAt(c))}</span> : null}
                    {c.goal?.queued ? <span className="sa__dim" title="messages queued for its next poll">✉ {c.goal.queued}</span> : null}
                  </span>
                  {needsHuman(c) && (awaitingStep(c.goal)?.note || c.goal?.stopDetail) ? <span className="sa__question" data-subagent-question>{awaitingStep(c.goal)?.note || c.goal.stopDetail}</span> : null}
                </span>
                <span className="sa__row-actions">
                  {c.goal && (c.busy || c.goal.state === 'running') && <button type="button" className="sa__act" onClick={(e) => stopGoal(c, e)} title={owner.stopTitle(c.goal.id)} data-stop-goal={c.goal.id}>■ stop</button>}
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
        {shown && shown.goal ? (
          // A goal conversation: the tabbed view — Step plan · Chat · Understanding (fleet task
          // 93b481e6). The plan and chat panels are moved into tabs UNCHANGED (same props, same
          // endpoints); the Understanding tab is new. The owner rule (openspec
          // repo-agent-subagents) rides along: the plan posts through the owner's paths and the
          // chat renders through the owner's renderConversation when one is given.
          <div className="sa__tabs-wrap" data-goal-view={shown.id}>
            <div className="sa__tabbar" role="tablist" aria-label="Goal view" data-goal-tabs>
              {GOAL_TABS.map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  className={`sa__tab${tab === k ? ' sa__tab--on' : ''}`}
                  data-goal-tab={k}
                  onClick={() => setTab(k)}
                >
                  {label}
                  {k === 'plan' && planBlocked(shown.goal) && <span className="sa__tab-badge" title="a step is blocked or awaiting your answer" data-goal-tab-badge aria-label="blocked step" />}
                  {k === 'understanding' && shown.goal.understanding?.built && <span className="sa__tab-dot" title="an Understanding app has been built for this goal" data-goal-tab-built />}
                </button>
              ))}
            </div>
            <div className="sa__tabpanel" data-goal-tabpanel={tab}>
              {tab === 'plan' && <GoalPlanPanel goal={shown.goal} owner={owner} onChanged={load} onStarted={(id) => { setSel(id); load(); onConversationChanged?.({ id, created: true }); }} />}
              {tab === 'chat' && (renderConversation ? renderConversation(shown, load) : <Arch popup view="chat" conv={shown.id} onOpenDock={onOpenDock} onConversationChanged={onConversationChanged} />)}
              {tab === 'understanding' && <GoalUnderstandingTab goalId={shown.goal.id} />}
            </div>
          </div>
        ) : shown ? (
          // A non-goal sibling conversation: just the chat, exactly as before (no tabs).
          renderConversation ? renderConversation(shown, load) : <Arch popup view="chat" conv={shown.id} onOpenDock={onOpenDock} onConversationChanged={onConversationChanged} />
        ) : (
          <div className="sa__dim sa__pad" data-subagents-empty>{owner.nothingSelected}</div>
        )}
      </div>
    </div>
  );
}
