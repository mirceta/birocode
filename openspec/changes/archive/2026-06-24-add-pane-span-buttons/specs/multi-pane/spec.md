## ADDED Requirements

### Requirement: In-pane span controls

Each visible pane's top bar SHALL present a decrement ("−") and an increment ("+") control beside the tab label that adjust that tab's span, and these controls SHALL appear only while the multi-pane layout is active — that is, only when at least two tabs are rendered side by side. The increment control SHALL grow the tab's span by one tab-space and the decrement control SHALL shrink it by one, operating on the **same** per-tab span value (1–4) that the Settings tab configures, persisted through the same mechanism, with no separate state or storage. The controls SHALL honor the 1–4 range — decrement disabled at 1, increment disabled at 4 — and SHALL be available only in Advanced UI mode, consistent with the multi-pane layout itself.

#### Scenario: Span controls appear only with two or more visible tabs

- **WHEN** the viewport is wide enough that the multi-pane layout renders at least two tabs side by side
- **THEN** each visible pane's top bar shows a "−" and a "+" control next to its label
- **AND WHEN** the viewport is too narrow to show two tabs and the app falls back to the single full-width view
- **THEN** no span controls are shown

#### Scenario: Increment grows the tab by one tab-space

- **WHEN** the "+" control on a pane is pressed and that tab's span is below the maximum
- **THEN** the tab occupies one more tab-space than before, and the change persists through the same store the Settings tab writes

#### Scenario: Decrement shrinks the tab by one tab-space

- **WHEN** the "−" control on a pane is pressed and that tab's span is above the minimum
- **THEN** the tab occupies one fewer tab-space than before, and the change persists through the same store the Settings tab writes

#### Scenario: Controls and Settings stay in agreement

- **WHEN** a tab's span is changed from a pane's "+"/"−" controls
- **THEN** the Settings tab's width stepper for that tab reflects the same value, because both read and write the one shared per-tab span

#### Scenario: Range is clamped to one through four

- **WHEN** a tab's span is at the minimum (1) or maximum (4)
- **THEN** the corresponding control ("−" at 1, "+" at 4) is disabled so the span never leaves the 1–4 range
