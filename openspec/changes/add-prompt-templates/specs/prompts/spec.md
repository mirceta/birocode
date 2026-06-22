# prompts

## MODIFIED Requirements

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

## ADDED Requirements

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
