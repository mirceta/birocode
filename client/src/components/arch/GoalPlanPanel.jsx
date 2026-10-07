import { useEffect, useState } from 'react';
import { apiPost } from '../../api/client';
import { planOf, planProgress, planHeadline, stateWords, kindWord, evidenceLines, nextStates, awaitingStep, canContinue } from './goalPlan';

// The goal's STEP PLAN, live (openspec goal-step-plan, fleet task 94c722e7): a vertical
// stepper above the selected goal conversation in the Subagents tab. Every step shows its
// state (done = green check, active = pulsing accent, pending = grey, blocked = amber with
// the question inline and an answer box, skipped = struck through), its kind, what proves
// it, the arch's note and its evidence compactly (the closing line in monospace, a PR / hub
// path as a link or a row). The Operator can mark a step from here (the same mark_step path
// the arch uses, without the owner rule), answer a blocked step (the answer resumes a held
// goal's loop), and continue an ended goal with its plan carried over. The tab's 5 s poll is
// the live channel — the panel renders whatever the goal view carries.

function Evidence({ step }) {
  const lines = evidenceLines(step);
  if (lines.length === 0) return null;
  return (
    <div className="gp__evidence" data-plan-evidence>
      {lines.map((l, i) => (
        <div key={i} className="gp__ev">
          {l.label ? <span className="gp__ev-label">{l.label}</span> : null}
          {l.href
            ? <a className="gp__ev-link" href={l.href} target="_blank" rel="noreferrer">{l.text}</a>
            : <span className={l.mono ? 'gp__ev-mono' : 'gp__ev-text'}>{l.text}</span>}
        </div>
      ))}
    </div>
  );
}

export default function GoalPlanPanel({ goal, onChanged = null, onStarted = null }) {
  const [answer, setAnswer] = useState('');
  const [note, setNote] = useState('');
  const [marking, setMarking] = useState(null); // step index whose mark menu is open
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(true);
  const steps = planOf(goal);
  const { done, total } = planProgress(goal);
  const awaiting = awaitingStep(goal);
  const live = goal?.state === 'running';
  useEffect(() => { setAnswer(''); setMarking(null); setNote(''); }, [goal?.id]);

  const post = async (path, body, after) => {
    setBusy(true); setNote('…');
    try {
      const r = await apiPost(path, body);
      setNote(r?.detail || r?.status || 'ok');
      after?.(r);
      onChanged?.();
    } catch (e) {
      setNote(e?.message || String(e));
    } finally { setBusy(false); }
  };
  const mark = (step, state) => { setMarking(null); post(`/arch/goals/${encodeURIComponent(goal.id)}/steps/${step.index}`, { state }); };
  const send = () => {
    const text = answer.trim();
    if (!text) return;
    post(`/arch/goals/${encodeURIComponent(goal.id)}/answer`, { text }, () => setAnswer(''));
  };
  const cont = () => {
    if (!window.confirm(`Continue goal ${goal.id} as a new goal? Its plan carries over: ${done}/${total} done steps stay done, so no brief is sent twice.`)) return;
    post(`/arch/goals/${encodeURIComponent(goal.id)}/continue`, {}, (r) => { const id = r?.goal?.conversation?.id; if (id) onStarted?.(id); });
  };

  if (!goal) return null;
  return (
    <section className={`gp${open ? '' : ' gp--closed'}`} data-goal-plan={goal.id} data-plan-progress={`${done}/${total}`} data-plan-live={live ? '1' : '0'}>
      <div className="gp__head">
        <button type="button" className="gp__toggle" onClick={() => setOpen((v) => !v)} title={open ? 'Collapse the plan' : 'Expand the plan'} data-plan-toggle>{open ? '▾' : '▸'}</button>
        <span className="gp__title">Step plan</span>
        {total > 0 && <span className="gp__fraction" title="done (and skipped) steps over the plan" data-plan-fraction>{done}/{total}</span>}
        <span className="gp__headline" data-plan-headline>{planHeadline(goal)}</span>
        <span className="gp__spacer" />
        {canContinue(goal) && <button type="button" className="gp__btn gp__btn--primary" onClick={cont} disabled={busy} title="Start a new goal with the same text, agents and tasks; the plan carries over with its done steps" data-plan-continue>↻ Continue from the plan</button>}
        {note && <span className="gp__note" data-plan-note>{note}</span>}
      </div>
      {open && (
        total === 0
          ? <div className="gp__empty" data-plan-empty>{live ? 'No step plan yet. The arch declares one on its first turn (edit_goal_plan), or start the goal with steps.' : 'This goal ran without a step plan.'}</div>
          : (
            <ol className="gp__steps" data-plan-steps={total}>
              {steps.map((s) => {
                const w = stateWords(s.state);
                const isAwaiting = awaiting && awaiting.index === s.index;
                return (
                  <li key={s.index} className={`gp__step gp__step--${s.state}${isAwaiting ? ' gp__step--awaiting' : ''}`} data-plan-step={s.index} data-plan-state={s.state} data-plan-awaits={isAwaiting ? '1' : '0'}>
                    <span className="gp__rail"><span className="gp__dot" aria-label={w.word} title={w.word}>{w.glyph}</span></span>
                    <div className="gp__body">
                      <div className="gp__line">
                        <span className="gp__num">{s.index}.</span>
                        <span className="gp__step-title">{s.title}</span>
                        <span className={`gp__kind gp__kind--${s.kind}`}>{kindWord(s.kind)}</span>
                        <span className={`gp__state gp__state--${s.state}`}>{w.word}{s.kind === 'relay-loop' && s.counter ? ` · ${s.counter} relayed` : ''}</span>
                        {live && (
                          <span className="gp__mark">
                            <button type="button" className="gp__btn" onClick={() => setMarking(marking === s.index ? null : s.index)} disabled={busy} title="Mark this step (the same path as the arch's mark_step)" data-plan-mark={s.index}>mark ▾</button>
                            {marking === s.index && (
                              <span className="gp__menu" data-plan-mark-menu>
                                {nextStates(s).map((st) => <button key={st} type="button" className={`gp__btn gp__btn--${st}`} onClick={() => mark(s, st)} data-plan-mark-as={st}>{stateWords(st).glyph} {st}</button>)}
                              </span>
                            )}
                          </span>
                        )}
                      </div>
                      {s.done && s.state !== 'done' && s.state !== 'skipped' && <div className="gp__done" title="what proves this step">done when: {s.done}</div>}
                      {s.note && s.state !== 'blocked' && <div className="gp__note-line">{s.note}</div>}
                      {s.state === 'blocked' && (
                        <div className="gp__blocked" data-plan-question>
                          <b>{isAwaiting ? 'Waiting on you: ' : 'Blocked: '}</b>{s.note || 'no reason given'}
                        </div>
                      )}
                      <Evidence step={s} />
                      {isAwaiting && (
                        <div className="gp__answer" data-plan-answer>
                          <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} placeholder="Your answer — it reaches the goal conversation as its next turn and resumes the loop" onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) send(); }} data-plan-answer-text />
                          <button type="button" className="gp__btn gp__btn--primary" onClick={send} disabled={busy || !answer.trim()} data-plan-answer-send>Answer and resume</button>
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          )
      )}
    </section>
  );
}
