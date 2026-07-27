## ADDED Requirements

### Requirement: Sound settings are a first-class tab in the consumer app

The consumer app SHALL surface its sound configuration as a first-class tab in the
app's main tab bar, alongside the existing views (Activity, Agents, GitHub), rather than
as controls in the page header or a one-off modal. Selecting the tab SHALL render a
dedicated sound-settings section containing the app's existing sound controls: the
per-device sound on/off toggle, the per-event-type user-supplied audio controls
(assign / replace / test / clear for the `turn.start`, `turn.ended`, and default slots),
and the host-cue controls (host on/off, beep-vs-voice mode, and test). Moving these
controls into the tab SHALL NOT change their behaviour: each control SHALL do exactly
what it did before the relocation. The tab SHALL participate in the app's existing tab
mechanics — it SHALL be URL-addressable (selectable via the app's `tab` query
parameter), its selection SHALL persist per device across reloads the same way the other
tabs do, and in the app's tabless display mode its section SHALL be rendered alongside
the other panels rather than hidden.

#### Scenario: Sound settings appear as a first-class tab

- **WHEN** the operator opens the consumer app
- **THEN** the main tab bar shows a Sounds tab alongside the existing views, and no
  loose sound controls remain in the page header

#### Scenario: The tab hosts the existing controls unchanged

- **WHEN** the operator selects the Sounds tab
- **THEN** the section shows the per-device sound on/off toggle, the per-event-type
  user-supplied audio controls (assign / replace / test / clear), and the host-cue
  controls, each behaving exactly as it did before being moved

#### Scenario: The tab is URL-addressable and persists

- **WHEN** the operator selects the Sounds tab, or loads the app with the tab query
  parameter set to the Sounds tab, and later reloads on the same device
- **THEN** the app opens on the Sounds tab without the operator re-selecting it

#### Scenario: Display mode shows the sound section

- **WHEN** the app is in its tabless display mode
- **THEN** the sound-settings section is rendered alongside the other panels rather than
  hidden behind a tab

#### Scenario: Relocation does not change sound behaviour

- **WHEN** sound is enabled and events are rendered after the controls have been moved
  into the tab
- **THEN** the app plays the same cues, honours the same per-type user-supplied audio,
  and drives the same host cues as before the relocation
