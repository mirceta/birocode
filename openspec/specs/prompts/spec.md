# prompts Specification

## Purpose
TBD - created by archiving change prompt-system-toggle. Update Purpose after archive.
## Requirements
### Requirement: Fixed, hard-coded built-in prompt set

The one-off **built-in** composer prompts SHALL remain a fixed, version-controlled set with
no add / edit / delete — shown insert-only (a Use action). Separately, the editable,
JSON-backed **custom-prompt list is reinstated** (un-retiring the previously removed list): the
operator MAY add, edit, and delete their own prompts, which are stored as templates (see the
template requirements below) and listed alongside the built-ins in the same pop-up. The
prompt **Plans** and **Notes** tabs are unaffected.

#### Scenario: Built-ins stay insert-only

- **WHEN** the operator opens the prompts pop-up and views the built-in prompts
- **THEN** each built-in offers only a Use action, with no form to add, edit, or delete it

#### Scenario: Custom prompts are editable again

- **WHEN** the operator opens the prompts pop-up
- **THEN** they can add a new custom prompt, and edit or delete an existing custom prompt, while the built-in set remains fixed

### Requirement: Per-repo planning-system toggle

The custom-prompts pop-up SHALL present a top-level toggle with two options —
**OpenSpec** and **Old system** — and SHALL remember the selected option per
repository, defaulting to **OpenSpec** when unset.

#### Scenario: Choice persists per repository

- **WHEN** the operator selects "Old system" while repository A is open and later reopens the pop-up for repository A
- **THEN** the pop-up shows "Old system" selected, and other repositories keep their own independent selection

#### Scenario: Default when unset

- **WHEN** a repository has no stored planning-system choice
- **THEN** the pop-up defaults to **OpenSpec**

### Requirement: System-specific built-ins follow the toggle

The system SHALL offer the system-specific built-in prompts (kick off a feature, write
understanding first, close a finished feature, evaluate the options) in both OpenSpec
and legacy wording, and SHALL insert the variant matching the repository's selected
planning system. System-agnostic built-ins SHALL read identically under both options.

#### Scenario: OpenSpec selected

- **WHEN** the planning system is OpenSpec and the operator uses a system-specific built-in
- **THEN** the inserted text targets the OpenSpec flow (e.g. start/validate/archive an OpenSpec change, write to `proposal.md` / `design.md`)

#### Scenario: Old system selected

- **WHEN** the planning system is Old system and the operator uses a system-specific built-in
- **THEN** the inserted text targets the legacy flow (e.g. a `plan.md` entry, `understanding.md`, the old close-out ritual)

#### Scenario: System-agnostic built-ins unchanged

- **WHEN** the operator switches between OpenSpec and Old system
- **THEN** the system-agnostic built-ins (doc-simplify, wall-of-text, understanding-app) read identically under both

### Requirement: Parameterized prompt templates

A custom prompt's body MAY contain named placeholders written as `{{name}}`. The system SHALL
treat the set of **distinct** placeholder names found in the body, in first-appearance order,
as the template's parameters, deriving them from the body itself (no separately stored
parameter list). A placeholder name used more than once SHALL count as a single parameter and,
when filled, SHALL substitute at every occurrence. The stored shape of a prompt is unchanged
(the placeholders live inside the existing body text).

#### Scenario: Parameters are derived from the body

- **WHEN** a custom prompt body contains `{{ticket}}` once and `{{file}}` twice
- **THEN** the template exposes exactly two parameters, `ticket` and `file`, in that order

#### Scenario: A repeated placeholder fills everywhere

- **WHEN** the operator fills a value for a placeholder that appears multiple times in the body
- **THEN** every occurrence of that placeholder is replaced with the same value

### Requirement: Fill template parameters via a form before insert

The system SHALL present a parameter-fill form when the operator chooses Use on a custom
prompt that has one or more parameters — one labelled free-text field per distinct parameter
(in first-appearance order) layered over the prompts pop-up — rather than inserting the raw
body. On confirm, the system SHALL substitute each parameter's entered value into every matching
placeholder and insert the resulting text into the composer draft (the same insertion path as
other prompts, preserving any existing draft). Cancelling the form SHALL insert nothing and
leave the draft unchanged. An empty field value is permitted and substitutes empty text.

#### Scenario: Fill then insert

- **WHEN** the operator chooses Use on a template with parameters, fills the fields, and confirms
- **THEN** the substituted text (placeholders replaced by the entered values) is inserted into the composer, appended to any existing draft

#### Scenario: Cancel inserts nothing

- **WHEN** the operator opens the fill form for a template and cancels it
- **THEN** no text is inserted and the existing composer draft is unchanged

### Requirement: Templates without parameters insert directly

The system SHALL insert the body verbatim with no intervening form when the operator chooses
Use on a custom prompt whose body contains no `{{name}}` placeholders, identical to the
pre-existing insert behavior.

#### Scenario: No placeholders, no form

- **WHEN** the operator chooses Use on a custom prompt that contains no placeholders
- **THEN** the body is inserted into the composer immediately, with no parameter form shown

### Requirement: Authoring surfaces the detected parameters

While the operator is creating or editing a custom prompt, the system SHALL show which
parameters its body currently defines — the distinct `{{name}}` placeholders detected in the
body — updating as the body changes, so the author can see which fields Use will ask for. This
read-out is a preview only and SHALL NOT persist anything beyond the body itself.

#### Scenario: Detected parameters update with the body

- **WHEN** the operator types `{{target}}` into the body of a custom prompt being edited
- **THEN** the authoring view lists `target` as a detected parameter

### Requirement: Fixed categorized prompt catalog

The harness SHALL ship a fixed, version-controlled catalog of built-in prompts covering
every prompt proven in practice (the de-duplicated union of the machines' libraries: 17
prompts at the time of this change). Catalog prompts are constants in the harness source
(texts via i18n, like the pre-existing built-ins), are insert-only (no edit/delete in the
UI), and each belongs to exactly one fixed, assistant-identified category. Categories and
their order are version-controlled constants, not user-editable data. Planning-system
sensitive catalog prompts SHALL keep the existing per-repo OpenSpec/Old-system text swap.

#### Scenario: Catalog renders by category

- **WHEN** the operator opens the Prompts tab
- **THEN** the catalog prompts render under their fixed category headings, in version-controlled order, each insertable via Use

#### Scenario: Catalog prompts are not editable

- **WHEN** the operator views a catalog prompt
- **THEN** it offers Use but no Edit or Delete

### Requirement: Grid rendering

The Prompts tab SHALL render prompts as a responsive grid of cards (emoji, label, clamped
body preview, actions) under section headings, instead of a single flat list, sized so
that a phone shows at least two cards per row.

#### Scenario: Grid on a phone

- **WHEN** the pop-up opens on a narrow (phone) viewport
- **THEN** each section lays its prompt cards out in a grid of at least two columns

### Requirement: Template parameters on catalog prompts

Catalog prompts MAY carry `{{name}}` template parameters. Their cards SHALL show the
detected fields, and Use SHALL open the existing fill-in form before insertion — the same
behavior custom templates already have.

#### Scenario: Catalog template fills before insert

- **WHEN** the operator uses a catalog prompt containing `{{placeholders}}`
- **THEN** the fill-in form opens, and the substituted text is inserted on confirm

### Requirement: Custom prompts as the New ideas inbox

The custom-prompt list SHALL remain fully functional (backend-synced store, add/edit/
delete, templates) and SHALL render as the final "New ideas" section — the fast capture
path for prompt ideas that are not yet promoted into the catalog. However, a custom
prompt whose text matches a catalog prompt's text (or a recorded retired variant of it),
compared case-insensitively with normalized whitespace, SHALL be hidden from the pop-up
so promoted prompts never show twice. The store itself SHALL NOT be modified by this
hiding, and other store consumers (including the Autopilot routine-set builder) SHALL
keep receiving the full list.

#### Scenario: Capture a new idea

- **WHEN** the operator adds a custom prompt whose text matches no catalog prompt
- **THEN** it appears under New ideas with Use/Edit/Delete, synced across devices as before

#### Scenario: Promoted store copies are hidden

- **WHEN** the store contains a custom prompt whose text equals a catalog prompt's text
- **THEN** the pop-up shows only the catalog card, while the store and the API list keep the custom entry

#### Scenario: Edited store copy resurfaces

- **WHEN** a hidden store copy's text is later edited so it no longer matches the catalog
- **THEN** it reappears under New ideas as a distinct prompt

