## ADDED Requirements

### Requirement: Every agent badge carries a colour-independent identity mark
Every agent badge on the Kanban cards and on the Fleet Status tab SHALL show, in
addition to the machine/repo hue, an identity mark from the one shared colour module:
a glyph drawn from a fixed set of sixteen geometric shapes and a monogram of the form
`<machine skeleton>/<repo prefix><handle index>` (for example `rz/prg2`, `lv/web`). The
mark SHALL be a pure function of the agent's stable identity — its machine key and repo
key together with the machine label and repo handle the fleet reports — and SHALL NOT
depend on list order, on the device, or on the persisted hue slots, so the same agent
shows the same mark after every reload and in both views. Hue, glyph and monogram
together SHALL identify an agent uniquely even when several agents share a hue; the
monogram SHALL be readable without colour. The badge SHALL carry the agent's full
handle as its title and accessible label.

#### Scenario: Six agents on one hue
- **WHEN** the same repository is a managed agent on six machines, so their Kanban chips share the repo tint
- **THEN** each chip shows a different monogram (each machine's skeleton), the chips can be told apart without colour, and hovering a chip names the full handle

#### Scenario: Same agent, both views
- **WHEN** an agent appears as a Fleet Status chip and as an assignee chip on a Kanban card
- **THEN** both badges show the identical glyph and monogram, and a reload on another device shows the same mark

#### Scenario: Palette wraps
- **WHEN** more machines than the palette has hues are in view, so two machines share a machine hue
- **THEN** their agents still differ by monogram (and glyph), and the badge titles name each machine
