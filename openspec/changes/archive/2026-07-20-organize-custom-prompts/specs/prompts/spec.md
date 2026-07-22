# prompts — delta for organize-custom-prompts

## ADDED Requirements

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
