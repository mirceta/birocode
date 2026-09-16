## ADDED Requirements

### Requirement: Conversation panes keep their lane strip and composer in view
The Management App's Arch and Tasks panes SHALL keep the conversation's title row and
its Chat / Tools / History lane strip pinned at the top of the pane and the composer at
the bottom, in the tabs layout and side by side at any pane width; only the message
list SHALL scroll, and neither the pane nor the page SHALL grow a second scrollbar for
the transcript.

#### Scenario: Side-by-side panes on a laptop
- **WHEN** the Arch and Tasks panes are shown side by side in a 1366px-wide window and each conversation is scrolled to its last message
- **THEN** both panes still show their lane strip at the top and their composer at the bottom, and the lane tabs can be clicked where they are

#### Scenario: Rendering test guards it
- **WHEN** `npm --prefix client run test:ui` runs
- **THEN** it renders the Management App against a 60-message transcript in a headless browser at big-screen and laptop sizes, in both layouts, and fails if the strip or the composer leaves the pane after scrolling or if anything but the message list scrolls
