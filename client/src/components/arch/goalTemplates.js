// GOAL TEMPLATES, the pure half (openspec arch-goal-templates, fleet task 545b9548): a cached-prompt entry with
// kind "goal-template" = a parameterised STEP PLAN — purpose, typed inputs, ordered steps (title, done-when, kind),
// defaults (cap, branch) and the goal it was captured from. This module fills a template from its inputs, renders the
// preview goal the stepper draws, composes the message the Arch chat receives, builds the "start now" request, and
// turns a finished or running goal into a template draft (generalising its concrete names into inputs).
// Framework-free, node-tested.
import { fillPlaceholder, placeholdersOf } from './archPrompts.js';

export const KIND = 'goal-template';
export const INPUT_TYPES = ['agent', 'repo', 'machine', 'task', 'goal', 'branch', 'text', 'number'];
export const STEP_KINDS = ['send', 'wait', 'transfer', 'verify', 'relay-loop', 'human', 'other'];

export const isTemplate = (p) => p?.kind === KIND;

/** The Prompts tab's placeholder kind for an input type (repo picks from the agents like agent does). */
export const pickKindOf = (type) => (type === 'repo' ? 'agent' : INPUT_TYPES.includes(type) ? type : 'text');

/** Every input's value: what was typed, else its default, else ''. */
export function valuesWithDefaults(tpl, values) {
  const out = {};
  for (const i of tpl?.inputs || []) {
    const v = String(values?.[i.name] ?? '').trim();
    out[i.name] = v || String(i.default ?? '').trim();
  }
  return out;
}

/** Inputs still without a value (no typed value, no default). */
export const missingInputs = (tpl, values) => {
  const v = valuesWithDefaults(tpl, values);
  return (tpl?.inputs || []).filter((i) => !v[i.name]).map((i) => i.name);
};

/** Substitute every input that has a value; the others stay {name}. */
export function fill(text, tpl, values) {
  let out = String(text || '');
  const v = valuesWithDefaults(tpl, values);
  for (const [name, val] of Object.entries(v)) if (val) out = fillPlaceholder(out, name, val);
  return out;
}

/** The filled step plan. */
export const filledSteps = (tpl, values) =>
  (tpl?.steps || []).map((s) => ({ title: fill(s.title, tpl, values), done: s.done ? fill(s.done, tpl, values) : null, kind: STEP_KINDS.includes(s.kind) ? s.kind : 'other' }));

/** A goal-shaped object the Subagents stepper (GoalPlanPanel) renders as a read-only PREVIEW: every step pending. */
export function previewGoal(tpl, values) {
  return {
    id: `template-${tpl?.id || 'draft'}`, state: 'preview', goal: fill(tpl?.purpose || '', tpl, values),
    plan: filledSteps(tpl, values).map((s, i) => ({ index: i + 1, title: s.title, done: s.done, kind: s.kind, state: 'pending' })),
  };
}

/** The structured message for the Arch chat: purpose, inputs, defaults and numbered STEP lines the server's step parser
 * reads ("STEP n — [kind] title — done when: …"), ending with the propose-discuss-start protocol. */
export function composeArchMessage(tpl, values) {
  const v = valuesWithDefaults(tpl, values);
  const lines = [];
  lines.push(`GOAL TEMPLATE "${tpl?.label || 'goal template'}" — propose it, we discuss it, start it only on my go.`);
  lines.push(`Purpose: ${fill(tpl?.purpose || '', tpl, values)}`);
  const ins = (tpl?.inputs || []).map((i) => `${i.name} = ${v[i.name] || `{${i.name}} (not set)`}`);
  if (ins.length) lines.push(`Inputs: ${ins.join(' · ')}`);
  const defs = [];
  if (tpl?.maxIterations) defs.push(`cap ${tpl.maxIterations}`);
  if (tpl?.branch) defs.push(`branch ${fill(tpl.branch, tpl, values)}`);
  if (defs.length) lines.push(`Defaults: ${defs.join(' · ')}`);
  lines.push('Steps:');
  filledSteps(tpl, values).forEach((s, i) => lines.push(`STEP ${i + 1} — [${s.kind}] ${s.title}${s.done ? ` — done when: ${s.done}` : ''}`));
  if (tpl?.sourceGoalId) lines.push(`(captured from goal ${tpl.sourceGoalId})`);
  lines.push('When I say "start it": start_arch_goal with goal = the purpose, the agents and cards in the inputs, the cap above, and steps = these STEP lines as { title, done, kind }.');
  return lines.join('\n');
}

/** The agents' handle → key map from the arch state (GET /api/arch → agents). */
export const agentKeys = (agents) => Object.fromEntries((agents || []).filter((a) => a?.handle && a?.key).map((a) => [a.handle, a.key]));

/** The "start now" request for POST /api/arch/goals: the declared plan, the agents (agent / repo inputs → keys) and
 * cards (task inputs) to drive, the cap, the arch as the starter. `{ body, problems }` — problems block the start. */
export function startRequest(tpl, values, agents) {
  const v = valuesWithDefaults(tpl, values);
  const keys = agentKeys(agents);
  const problems = missingInputs(tpl, values).map((n) => `fill {${n}}`);
  const repos = [];
  const tasks = [];
  for (const i of tpl?.inputs || []) {
    const val = v[i.name];
    if (!val) continue;
    if (i.type === 'agent' || i.type === 'repo') {
      if (keys[val]) repos.push(keys[val]); else problems.push(`${i.name}: "${val}" is not an agent the arch knows (pick one from the list)`);
    }
    if (i.type === 'task') tasks.push(val);
  }
  if (!repos.length && !tasks.length) problems.push('a goal needs at least one agent or card input to drive');
  const goal = `${fill(tpl?.purpose || '', tpl, values)} (goal template "${tpl?.label || ''}")`;
  return { body: { goal, repos, tasks, steps: filledSteps(tpl, values), maxIterations: tpl?.maxIterations || undefined, startedBy: 'arch' }, problems };
}

// ---- save a goal as a template ---------------------------------------------------------------------------------

const BRANCH_RE = /\b(?:feat|fix|feature|chore|docs|analysis|hotfix|release)\/[A-Za-z0-9._\/-]*[A-Za-z0-9]/g;

/** The forms an agent is named by: "MACHINE/repo#2" → itself, "MACHINE/repo", "repo#2", "repo" (longest first). */
export function agentVariants(handle) {
  const h = String(handle || '').trim();
  if (!h) return [];
  const tail = h.includes('/') ? h.slice(h.lastIndexOf('/') + 1) : h;
  const forms = [h, h.replace(/#\d+$/, ''), tail, tail.replace(/#\d+$/, '')].filter((x) => x.length >= 3);
  return [...new Set(forms)].sort((a, b) => b.length - a.length);
}

/** The concrete names in a goal that could become inputs: the agents it drives (in every form they are named by), its
 * cards, the branches its text and plan mention. [{ name, type, value, variants, count }] — `count` = how often any
 * variant occurs in the text and plan. */
export function generalisationCandidates(goal) {
  const hay = [goal?.goal || '', ...(goal?.plan || []).flatMap((s) => [s.title || '', s.done || ''])].join('\n');
  const count = (v) => (v ? hay.split(v).length - 1 : 0);
  // Occurrences of the longest variants first, each match consumed, so "repo" inside "MACHINE/repo" counts once.
  const countAll = (vs) => { let h = hay; let n = 0; for (const v of vs) { const parts = h.split(v); n += parts.length - 1; h = parts.join('\u0000'); } return n; };
  const out = [];
  const taken = new Set();
  const add = (base, type, value, variants = [value]) => {
    if (!value || out.some((c) => c.value === value)) return;
    let name = base; let n = 2;
    while (taken.has(name)) name = `${base}${n++}`;
    taken.add(name);
    out.push({ name, type, value, variants, count: variants.length > 1 ? countAll(variants) : count(value) });
  };
  for (const o of goal?.owns || []) add('agent', 'agent', o.handle, agentVariants(o.handle));
  for (const t of goal?.tasks || []) add('task', 'task', String(t.id || '').slice(0, 8));
  for (const b of new Set(hay.match(BRANCH_RE) || [])) add('branch', 'branch', b);
  return out;
}

/** A template draft from a goal: its first line as the name, its text as the purpose, its plan as the steps, its cap,
 * the goal id as the source. */
export function draftFromGoal(goal) {
  const first = String(goal?.goal || '').split('\n')[0].replace(/^Request from [^:]+:\s*/i, '').trim();
  return {
    label: first.length > 80 ? first.slice(0, 79).trimEnd() + '…' : first || `Goal ${goal?.id || ''}`,
    category: 'Loops, goals & recurring', emoji: '🧭',
    purpose: String(goal?.goal || '').trim(),
    inputs: [], steps: (goal?.plan || []).map((s) => ({ title: s.title || '', done: s.done || '', kind: STEP_KINDS.includes(s.kind) ? s.kind : 'other' })),
    maxIterations: goal?.maxIterations || null, branch: '', sourceGoalId: goal?.id || null,
  };
}

/** Replace each chosen candidate's value with its {name} in the purpose and steps, and add it as an input (its value as
 * the default when `keepAsDefault`). Longer values first, so "feat/a-b" is not eaten by "feat/a". */
export function applyGeneralisation(draft, chosen, { keepAsDefault = false } = {}) {
  const pairs = (chosen || []).flatMap((c) => (c.variants?.length ? c.variants : [c.value]).map((v) => ({ v: String(v), name: c.name })))
    .sort((a, b) => b.v.length - a.v.length);
  const sub = (s) => pairs.reduce((acc, p) => acc.split(p.v).join(`{${p.name}}`), String(s || ''));
  const inputs = [...(draft.inputs || [])];
  for (const c of chosen || []) if (!inputs.some((i) => i.name === c.name)) inputs.push({ name: c.name, type: c.type, label: '', default: keepAsDefault ? c.value : '' });
  return {
    ...draft,
    purpose: sub(draft.purpose),
    steps: (draft.steps || []).map((s) => ({ ...s, title: sub(s.title), done: sub(s.done) })),
    branch: draft.branch ? sub(draft.branch) : draft.branch,
    inputs,
  };
}

/** Placeholders used in the purpose / steps that no input defines (the editor warns). */
export function undefinedPlaceholders(draft) {
  const names = new Set((draft?.inputs || []).map((i) => i.name));
  const used = new Set(placeholdersOf([draft?.purpose, draft?.branch, ...(draft?.steps || []).flatMap((s) => [s.title, s.done])].filter(Boolean).join('\n')));
  return [...used].filter((n) => !names.has(n));
}

/** The body POST/PUT /api/prompts/templates expects. */
export const templateBody = (d) => ({
  emoji: d.emoji || '🧭', label: d.label, category: d.category, purpose: d.purpose, hint: d.hint || null,
  inputs: (d.inputs || []).map((i) => ({ name: i.name, type: i.type, label: i.label || null, default: i.default || null })),
  steps: (d.steps || []).filter((s) => String(s.title || '').trim()).map((s) => ({ title: s.title, done: s.done || null, kind: s.kind || 'other' })),
  maxIterations: d.maxIterations ? Number(d.maxIterations) : null, branch: d.branch || null, sourceGoalId: d.sourceGoalId || null,
});
