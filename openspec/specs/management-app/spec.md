# management-app Specification

## Purpose
TBD - created by archiving change arch-conversations. Update Purpose after archive.
## Requirements
### Requirement: Arch conversations are sibling Management tabs
The Management App SHALL show every non-default arch conversation as a tab and pane of
its own, keyed `arch:<conversation id>`, placed after Arch by default and labelled with
the conversation's name. A **＋** in the tab strip SHALL create a new conversation with a
name asked up front and open it. Renaming a conversation at the top of its tab SHALL
rename the tab; removing it SHALL drop the tab and show Arch. The persisted order, hidden
set and pane weights SHALL learn new conversation keys without a reset.

#### Scenario: New conversation from the strip
- **WHEN** the operator presses ＋ and names the conversation "Deploy train"
- **THEN** a tab "Deploy train" appears right after Arch, is selected, and its Arch page shows that name at the top

#### Scenario: Deep link
- **WHEN** the app is opened with `?tab=arch:@arch:1234abcd`
- **THEN** that conversation's pane is the active tab, or Arch when no such conversation exists

