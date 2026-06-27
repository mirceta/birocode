## ADDED Requirements

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
