// Recurring tab (openspec recurring-tasks): the pure half — ordering, the words on a card,
// the editor form ⇄ API body, validation. Framework-free, unit-tested under `node --test`.
// The server (RecurringEngine.Board) decides everything that needs the clock grid or the
// agent's state — next due, hold reason, the live goal-loop phase, the strip; this module
// only arranges and words it.

export const POLL_MS = 5000;
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const UNIT_MIN = { min: 1, h: 60, d: 1440 };

/** The board's assignee key convention: "" sourceId = this machine. */
export const agentKey = (sourceId, repoId) => `${sourceId || ''}|${repoId}`;

/** Every repo agent the fleet status knows, for the assignee picker (the Kanban's list). */
export function agentOptions(fleet) {
  const out = [];
  for (const m of fleet?.machines || []) {
    for (const a of m.agents || []) {
      out.push({
        key: agentKey(m.self ? '' : m.sourceId, a.repoId), sourceId: m.self ? null : m.sourceId, repoId: a.repoId,
        label: `${a.handle || `${m.machine}/${a.name}`}${a.managed ? ' 🏛' : ''}`, machine: m, self: !!m.self,
        busy: a.runningSince != null, reachable: m.self || !!m.reachable,
      });
    }
  }
  return out;
}

export function inWords(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `in ${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `in ${m} min`;
  if (m < 48 * 60) return `in ${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `in ${Math.round(m / 1440)} d`;
}

export function agoWords(at, now) {
  if (!at) return '';
  const m = Math.max(0, Math.round((now - at) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}

export function tookWords(run) {
  if (!run?.armedAt || !run?.endedAt) return '—';
  const s = Math.max(0, Math.round((run.endedAt - run.armedAt) / 1000));
  return s < 90 ? `${s} s` : `${Math.round(s / 60)} min`;
}

/** The right-hand line of a card: paused / running (phase + turn) / held (why) / next run. */
export function nextLine(task, now) {
  if (!task.enabled) {
    const why = task.pausedReason === 'operator' || !task.pausedReason ? 'by the Operator' : task.pausedReason;
    return { kind: 'paused', text: `paused — ${why}` };
  }
  const r = task.running;
  if (r) {
    return r.mode === 'single'
      ? { kind: 'running', text: 'one prompt — the turn is running', phase: null, turns: 1 }
      : { kind: 'running', text: `goal loop · turn ${Math.max(1, r.turns || 0)}`, phase: r.phase || 'work', turns: r.turns || 0 };
  }
  if (task.hold) return { kind: 'hold', text: `due ${agoWords(task.hold.dueAt, now)} — held: ${task.hold.reason}${task.hold.missed ? ` (covers ${task.hold.missed} earlier)` : ''}` };
  if (task.nextDueAt) return { kind: 'next', text: task.nextDueAt <= now ? 'due now' : `next run ${inWords(task.nextDueAt - now)}` };
  return { kind: 'none', text: '' };
}

/** Needs-attention first, then what is due/held/running, then by next run, paused last. */
export function orderCards(tasks) {
  const rank = (t) => (!t.enabled ? (t.attention ? 3 : 4) : t.attention ? 0 : t.running || t.hold ? 1 : 2);
  return [...(tasks || [])].sort((a, b) => rank(a) - rank(b)
    || (a.nextDueAt ?? Infinity) - (b.nextDueAt ?? Infinity)
    || a.title.localeCompare(b.title));
}

export const attentionCount = (tasks) => (tasks || []).filter((t) => t.attention).length;

export function summaryLine(tasks, now) {
  const all = tasks || [];
  const active = all.filter((t) => t.enabled);
  const parts = [`${active.length} active`];
  if (all.length - active.length) parts.push(`${all.length - active.length} paused`);
  const running = all.filter((t) => t.running).length;
  if (running) parts.push(`${running} running`);
  const attn = attentionCount(all);
  if (attn) parts.push(`${attn} need${attn === 1 ? 's' : ''} attention`);
  const next = active.map((t) => t.nextDueAt).filter((d) => d && d > now).sort((a, b) => a - b)[0];
  if (next) parts.push(`next run ${inWords(next - now)}`);
  return parts.join(' · ');
}

/** How the run's loop ended, for the history table. */
export function loopWord(run) {
  if (run.mode === 'single') return run.status === 'running' ? 'turn running…' : run.status === 'done' ? 'one prompt' : run.status;
  switch (run.status) {
    case 'running': return `${run.phase || 'work'}…`;
    case 'done': return run.stopReason === 'verified' ? 'verified ✓' : 'done';
    case 'escalated': return 'needs-human';
    case 'capped': return 'turn budget reached';
    case 'stopped': return 'stopped';
    case 'error': return run.stopReason ? `error · ${run.stopReason}` : 'error';
    case 'lost': return 'lost';
    default: return '—';
  }
}

export const runText = (run) => run.summary || run.reason || (run.status === 'running' ? 'working toward the goal…' : '');
export const badgeText = (word) => (word === 'ok' ? 'OK' : (word || '').toUpperCase());

// ── the editor form ────────────────────────────────────────────────────────────────────

export function blankForm(agent = '') {
  return { title: '', agent, instructions: '', scheduleKind: 'interval', every: 2, unit: 'h', at: '07:00', days: [],
    mode: 'goal', maxTurns: 6, catchUp: true, skipWhenBusy: false, usageLimit: 85, requireDefaultBranch: false };
}

export function formOf(task) {
  const s = task.schedule || {};
  const mins = s.everyMinutes || 120;
  const unit = mins % 1440 === 0 ? 'd' : mins % 60 === 0 ? 'h' : 'min';
  return {
    title: task.title || '', agent: agentKey(task.sourceId, task.repoId), instructions: task.instructions || '',
    scheduleKind: s.kind === 'daily' ? 'daily' : 'interval', every: mins / UNIT_MIN[unit], unit, at: s.at || '07:00', days: [...(s.days || [])],
    mode: task.run?.mode === 'single' ? 'single' : 'goal', maxTurns: task.run?.maxTurns ?? 6,
    catchUp: task.policy?.catchUp !== false, skipWhenBusy: !!task.policy?.skipWhenBusy,
    usageLimit: task.policy?.skipAbovePlanUsage ?? 85, requireDefaultBranch: !!task.policy?.requireDefaultBranch,
  };
}

export function bodyOf(form) {
  const [sourceId, ...rest] = (form.agent || '|').split('|');
  const schedule = form.scheduleKind === 'daily'
    ? { kind: 'daily', at: form.at, days: WEEKDAYS.filter((d) => (form.days || []).includes(d)) }
    : { kind: 'interval', everyMinutes: Math.round(Number(form.every) * UNIT_MIN[form.unit || 'min']) };
  return {
    title: (form.title || '').trim(), sourceId: sourceId || null, repoId: rest.join('|'), instructions: (form.instructions || '').trim(), schedule,
    run: { mode: form.mode === 'single' ? 'single' : 'goal', maxTurns: Number(form.maxTurns) || 6 },
    policy: { catchUp: !!form.catchUp, skipWhenBusy: !!form.skipWhenBusy, skipAbovePlanUsage: Number(form.usageLimit) || 0, requireDefaultBranch: !!form.requireDefaultBranch },
  };
}

/** Null when the form can be saved, else the sentence to show under it. */
export function validateForm(form, minIntervalMinutes = 5) {
  const b = bodyOf(form);
  if (!b.title) return 'Give the task a title.';
  if (!b.repoId) return 'Assign a repo agent.';
  if (!b.instructions) return 'Write the instructions — they are the goal of every run.';
  if (b.schedule.kind === 'interval') {
    if (!Number.isFinite(b.schedule.everyMinutes) || b.schedule.everyMinutes < minIntervalMinutes) return `The interval must be at least ${minIntervalMinutes} minutes.`;
    if (b.schedule.everyMinutes > 43200) return 'The interval must be at most 30 days.';
  } else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(b.schedule.at || '')) return 'The time of day must be HH:mm.';
  if (b.run.maxTurns < 2 || b.run.maxTurns > 30) return 'The turn budget must be 2–30.';
  if (b.policy.skipAbovePlanUsage < 0 || b.policy.skipAbovePlanUsage > 100) return 'The plan-usage limit must be 0–100 (0 = off).';
  return null;
}

export const sameForm = (a, b) => JSON.stringify(bodyOf(a)) === JSON.stringify(bodyOf(b));

/** The server answers errors as {"error": "..."}; the API client throws the raw text. */
export function errorText(err) {
  const raw = err?.message || String(err || '');
  try { const j = JSON.parse(raw); if (j?.error) return j.error; } catch { /* not JSON */ }
  return raw || 'Request failed';
}
