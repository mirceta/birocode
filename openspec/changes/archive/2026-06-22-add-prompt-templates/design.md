# Design — prompt templates

## Context

Custom prompts already have a working spine that the UI stopped exposing: backend record
`Prompt(Id, Emoji, Label, Text)` persisted to `%APPDATA%\ClaudeWeb\prompts.json`
(`PromptsService.cs`), REST CRUD (`PromptsController.cs`), and a frontend
`PromptsContext.jsx` with `addPrompt/updatePrompt/deletePrompt`. Insertion into the composer
already exists too: `ChatInput.insertPrompt(text)` appends to the `draft` (ChatContext) and
refocuses. This change adds a thin layer on top of that spine, so the design is mostly about
**where the seams go**, not new infrastructure.

## Decision 1 — Reinstate the custom list vs. add a parallel "templates" list

**Chosen: reinstate the existing custom list as the template home (MODIFY the baseline).**
The retired feature, the dormant backend, and the user's ask are the same object — a
user-defined reusable prompt. Splitting "custom prompts" and "templates" into two lists would
duplicate CRUD, storage, and UI for no user-visible gain, and would leave the confusing
"retired" requirement standing next to a near-identical new one. The cost is honest: the
`prompts` baseline said the editable list was retired, so the delta must `MODIFY` that
requirement and say plainly that it is un-retired. Built-ins remain a separate, fixed,
insert-only set — unchanged.

*Rejected:* a second store/tab for templates (more surface, divergent CRUD, user confusion).

## Decision 2 — Placeholder syntax: `{{name}}` living inside the existing `Text` field

**Chosen: double-brace `{{name}}`, no backend schema change.** Parameters are *derived* from
the body, not stored separately: the distinct `{{…}}` names, in first-appearance order, ARE
the parameter list. This keeps `Prompt(Id, Emoji, Label, Text)`, `prompts.json`, and every
controller signature untouched — the feature is purely additive on the client.

- **Why double brace:** prompt bodies routinely contain shell/code with single `{ }` and
  `${VAR}`; `{{name}}` is far less likely to collide and reads as a template hole. A literal
  brace is not a goal for v1; if ever needed, `\{\{` can be reserved later.
- **Name grammar:** `{{` + `[A-Za-z0-9_ -]+` + `}}`, trimmed. Names are matched
  case-sensitively and de-duplicated, so `{{file}}` used three times asks **once** and
  substitutes all three occurrences.
- **Substitution:** replace every occurrence of each `{{name}}` with the field value
  (verbatim, including multi-line). Empty input is allowed (a hole may legitimately be blank).

*Rejected:* a `Parameters`/`IsTemplate` column on the record (schema + migration + a way for
the body and the declared params to drift out of sync — derivation can't drift). Also rejected
`${name}` and single `{name}` (collide with real prompt content).

## Decision 3 — When the form appears

`insertPrompt` is the single choke point. On "Use":

- parse the body for distinct `{{…}}` names;
- **zero names →** insert verbatim immediately (today's behavior, no regression);
- **one or more →** open the parameter-fill form (portaled, stacked over the pop-up like the
  manager already portals to `<body>`), one labelled text field per name in first-appearance
  order, focus the first; on **Confirm**, substitute and `insertPrompt(result)`; **Cancel**
  closes the form and inserts nothing.

Fields are plain `<textarea>`/`<input>` (free text, multi-line tolerant). No validation, no
required-ness, no typed parameters in v1 — explicitly out of scope so the form stays a
fill-the-holes affordance, not a schema builder.

## Decision 4 — Authoring affordance

The reinstated add/edit form (emoji, label, body) shows a **live read-out of detected
parameters** beneath the body field, so the author sees exactly which holes "Use" will ask
for as they type `{{…}}`. This is a preview only — nothing is persisted but the body itself
(consistent with Decision 2). No "parameter" inputs are stored.

## Risks / trade-offs

- **Brace collision:** a body that genuinely needs the literal text `{{x}}` would be treated
  as a parameter. Accepted for v1 (rare); escape hatch noted above.
- **Un-retiring a shipped decision:** reviewers will see the `MODIFIED` requirement flip the
  earlier "retired" stance. That is intended and called out in the proposal — the delta is the
  audit trail.
- **No per-parameter metadata** (labels, defaults, help): the field label is just the
  placeholder name. If users want friendlier labels later, a `{{name|Friendly label}}` form
  can extend the grammar without a schema change — left out of v1 to keep scope tight.

## Migration / compatibility

No data migration. Existing/older custom prompts (if any are in `prompts.json`) contain no
`{{…}}` and therefore behave exactly as before — insert verbatim. Built-ins are untouched.
The `customPrompts: 'advanced'` gate is unchanged, so Basic mode never sees any of this.
