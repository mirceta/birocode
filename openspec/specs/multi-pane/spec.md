# multi-pane Specification

## Purpose
TBD - created by archiving change add-pane-span-buttons. Update Purpose after archive.
## Requirements
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

### Requirement: Wide pane content fills the available horizontal width

A pane rendered wider than the page's reading-width cap SHALL stretch its page
content to fill the pane's available horizontal width, instead of remaining
capped and centered with empty side gutters; a pane no wider than that cap (a
single tab-space, or any narrow pane) SHALL keep its existing capped, centered
reading width unchanged. This behavior SHALL be driven by each pane's own
rendered width — each pane's content area is its own size container
(`container-type: inline-size`) — so each pane fills (or not) based on the room
it actually has, independent of the other panes.

#### Scenario: A full-span tab fills the whole strip

- **WHEN** a tab's span is set so that it occupies all of the currently visible
  tab-spaces (the full width of the strip) and that tab is shown
- **THEN** its page content stretches to fill the entire horizontal width of the
  pane, with no centered cap and no empty side gutters

#### Scenario: A multi-space (but not full) tab fills its wider pane

- **WHEN** a tab spans more than one tab-space so its pane is rendered wider than
  the page's reading-width cap
- **THEN** the page content fills that pane's full horizontal width rather than
  staying centered at the cap

#### Scenario: A single-space / narrow pane keeps its reading width

- **WHEN** a tab occupies a single tab-space (or the pane is otherwise no wider
  than the page's reading-width cap)
- **THEN** the page content keeps its existing capped, centered reading width —
  the appearance is unchanged from before this change

#### Scenario: Each pane sizes independently

- **WHEN** two panes are shown side by side, one wide (multi-space) and one
  narrow (single-space)
- **THEN** the wide pane's content fills its width while the narrow pane's content
  keeps its reading cap, each decided by its own pane width

