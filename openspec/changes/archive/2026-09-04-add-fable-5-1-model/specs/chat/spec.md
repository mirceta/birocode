# Chat (delta)

## ADDED Requirements

### Requirement: Choose the model for a chat turn

The chat composer SHALL offer a model dropdown (capability `modelSelector`)
listing the supported Claude models by friendly label. The selection is stored
device-locally (`claudeweb_model`) and passed verbatim to the CLI as
`--model`; when no selection is saved, the first list entry is the default.
The list SHALL lead with the current recommended default model
(`claude-fable-5-1`, "Fable 5.1").

#### Scenario: Default model on a fresh device

- **GIVEN** a device with no saved model choice
- **WHEN** the user opens the chat composer
- **THEN** the model dropdown shows "Fable 5.1" selected, and a sent turn
  runs with `--model claude-fable-5-1`

#### Scenario: Saved choice wins

- **GIVEN** a device that previously picked another listed model
- **WHEN** the user opens the chat composer
- **THEN** the saved model stays selected and is used for the next turn
