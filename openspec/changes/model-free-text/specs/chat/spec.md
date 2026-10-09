# chat — delta for model-free-text

## ADDED Requirements

### Requirement: The model is pickable from the catalogue or typed as a free-text id
The chat's model picker SHALL list Claude Opus 5.5 (`claude-opus-5-5`) in the
Claude group, ordered newest/most capable first, and SHALL additionally accept
a FREE-TEXT model id: a "Custom model id…" entry reveals a text input whose
value is validated for shape only (non-empty, no whitespace) and then used,
persisted and displayed exactly like a picked catalogue value — so a new model
release is usable without a harness change or redeploy. Typed ids SHALL be
remembered per device in a bounded recently-used list and re-pickable; a
current value the catalogue does not know SHALL be shown as-is, there and in
every other surface that names a model. The server SHALL keep passing an
unknown-family id through to the provider CLI, whose rejection surfaces as the
turn's visible error. The arch agent's model setting SHALL offer the same
picker and free-text entry, with its default unchanged (`claude-fable-5-1`)
and its Claude-only rule intact.

#### Scenario: Opus 5.5 from the list
- **WHEN** the Operator picks "Opus 5.5" and sends a prompt
- **THEN** the turn runs with `claude-opus-5-5`, listed between the Fable entries and the 4.x line

#### Scenario: A brand-new id, typed
- **WHEN** the Operator chooses "Custom model id…", types a one-word id and confirms
- **THEN** the id is used for the agent's turns, persisted like a picked value, shown as the picker's current value, and offered again from the recent list after a reload; an id with whitespace cannot be applied

#### Scenario: The provider is the judge
- **WHEN** the typed id is not a real model
- **THEN** the turn fails with the provider's own error visible in the chat — never silently
