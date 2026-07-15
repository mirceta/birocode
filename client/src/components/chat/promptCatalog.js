// The FIXED prompt catalog (openspec: organize-custom-prompts). The custom-prompt
// library was the discovery vehicle; the set it discovered — the de-duplicated
// union of every machine's library, 17 distinct prompts — now lives here as
// version-controlled constants, categorized and rendered as a grid. Texts resolve
// through i18n like the original 7 built-ins did (labels are translated, prompt
// bodies stay English in every locale).
//
//   kind 'sys'  → planning-system-specific: `<text>` is the OpenSpec wording,
//                 `<text>.legacy` the old plans/* wording; the per-repo toggle picks.
//   kind 'gen'  → identical under both systems. Promoted texts are VERBATIM from
//                 the library — including pre-OpenSpec wording — by explicit choice.
//   aliases     → retired wording variants of this prompt (raw strings, not i18n),
//                 used only to hide their store copies (see hiddenCatalogTexts).
//
// Bodies MAY carry `{{param}}` placeholders; the card shows the fields and Use
// opens the fill-in form, same as custom templates.

// Fixed display order of the sections; not user-editable (that's the point —
// this is step 1 of ordering, and it ships with the harness).
export const CATEGORIES = [
  { id: 'lifecycle', label: 'prompts.cat.lifecycle' },
  { id: 'decide', label: 'prompts.cat.decide' },
  { id: 'understanding', label: 'prompts.cat.understanding' },
  { id: 'flow', label: 'prompts.cat.flow' },
  { id: 'apps', label: 'prompts.cat.apps' },
];

export const CATALOG = [
  // — Feature lifecycle —
  { id: 'kickoff', category: 'lifecycle', emoji: '\u{1F680}', label: 'feature.kickoff', text: 'feature.kickoffPrompt', kind: 'sys' },
  { id: 'mergebranch', category: 'lifecycle', emoji: '\u{1F500}', label: 'prompts.builtin.mergebranch.label', text: 'prompts.builtin.mergebranch', kind: 'gen' },
  { id: 'close', category: 'lifecycle', emoji: '\u{1F3C1}', label: 'prompts.builtin.close.label', text: 'prompts.builtin.close', kind: 'sys' },
  // — Plan & decide —
  { id: 'evaluate', category: 'decide', emoji: '\u{1F4A1}', label: 'prompts.builtin.evaluate.label', text: 'prompts.builtin.evaluate', kind: 'sys' },
  { id: 'evaluatestars', category: 'decide', emoji: '\u{1F31F}', label: 'prompts.builtin.evaluatestars.label', text: 'prompts.builtin.evaluatestars', kind: 'gen' },
  { id: 'archplanning', category: 'decide', emoji: '\u{1F9E0}', label: 'prompts.builtin.archplanning.label', text: 'prompts.builtin.archplanning', kind: 'gen' },
  { id: 'confidence', category: 'decide', emoji: '\u{1F3AF}', label: 'prompts.builtin.confidence.label', text: 'prompts.builtin.confidence', kind: 'gen' },
  // — Understanding & docs —
  { id: 'understanding', category: 'understanding', emoji: '\u{1F4DD}', label: 'understanding.prefill', text: 'understanding.prefillPrompt', kind: 'sys' },
  { id: 'docsimplify', category: 'understanding', emoji: '\u{1F4C4}', label: 'prompts.builtin.docsimplify.label', text: 'prompts.builtin.docsimplify', kind: 'gen' },
  {
    id: 'understandingapp', category: 'understanding', emoji: '\u{1F916}',
    label: 'prompts.builtin.understandingapp.label', text: 'prompts.builtin.understandingapp', kind: 'gen',
    aliases: ['Serve for me the understanding in the understanding local app.'],
  },
  // — Conversation flow —
  { id: 'wherewerewe', category: 'flow', emoji: '\u{1F9ED}', label: 'prompts.builtin.wherewerewe.label', text: 'prompts.builtin.wherewerewe', kind: 'gen' },
  { id: 'walloftext', category: 'flow', emoji: '\u{1F4AC}', label: 'prompts.builtin.walloftext.label', text: 'prompts.builtin.walloftext', kind: 'gen' },
  { id: 'handoff', category: 'flow', emoji: '\u{1F91D}', label: 'prompts.builtin.handoff.label', text: 'prompts.builtin.handoff', kind: 'gen' },
  // — Local apps & repo —
  { id: 'findwebapps', category: 'apps', emoji: '\u{1F310}', label: 'prompts.builtin.findwebapps.label', text: 'prompts.builtin.findwebapps', kind: 'gen' },
  { id: 'newlocalapprepo', category: 'apps', emoji: '\u{1F4E6}', label: 'prompts.builtin.newlocalapprepo.label', text: 'prompts.builtin.newlocalapprepo', kind: 'gen' },
  { id: 'newappinrepo', category: 'apps', emoji: '\u{1F9E9}', label: 'prompts.builtin.newappinrepo.label', text: 'prompts.builtin.newappinrepo', kind: 'gen' },
  { id: 'rundetached', category: 'apps', emoji: '\u{1F50C}', label: 'prompts.builtin.rundetached.label', text: 'prompts.builtin.rundetached', kind: 'gen' },
];

// Text identity for hiding a store custom behind its catalog card: whitespace
// runs collapse and case is ignored, so a stray trailing space never resurrects
// a duplicate row.
export function normalizeText(s) {
  return (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
}

// Every text a catalog entry answers for — base + legacy wording (regardless of
// the current toggle) + retired aliases — normalized. A custom prompt whose text
// lands in this set is a promoted copy still sitting in prompts.json (kept there
// on purpose: the Autopilot routine set reads the store) and must not show twice.
export function hiddenCatalogTexts(t) {
  const set = new Set();
  for (const entry of CATALOG) {
    set.add(normalizeText(t(entry.text)));
    if (entry.kind === 'sys') set.add(normalizeText(t(`${entry.text}.legacy`)));
    for (const alias of entry.aliases || []) set.add(normalizeText(alias));
  }
  return set;
}
