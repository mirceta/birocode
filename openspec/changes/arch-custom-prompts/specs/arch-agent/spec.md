## ADDED Requirements

### Requirement: The Arch agent conversation has cached prompts

The Arch agent conversation SHALL carry a library of CACHED PROMPTS — the repo agents'
custom-prompts feature on the same store, under owner `arch` — shown as a panel of cards
grouped by category above the arch composer: click inserts the prompt into the composer
(editable before sending), a send affordance sends it as a turn, and the Operator can add,
edit, delete, duplicate, reorder and search them. A prompt's `{placeholders}` (`machine`,
`agent`, `task`, `pr`, `url`, `branch`, `text`, …; the repo agents' `{{name}}` form too)
SHALL render as fill-in chips while the draft holds them, with pick lists from the arch's
machines, agents, branches and the task graph where the kind allows. The library SHALL be
seeded from the Arch examples catalogue on first use and on "Re-seed": one prompt per mined
category with the category's phrasing tip; a re-seed SHALL add missing categories only and
never overwrite an edited or custom prompt; every card SHALL say whether it is seeded,
edited or custom. The repo agents' own library SHALL be unaffected.

#### Scenario: First use seeds from the real catalogue

- **WHEN** the Operator opens the Arch agent conversation on a hub with no arch prompts yet
- **THEN** the panel shows one card per Arch-examples category, all marked seeded, grouped by category

#### Scenario: Placeholders become chips

- **WHEN** the Operator clicks "Investigate what an agent did" (`On {machine} check {agent}: …`)
- **THEN** the composer shows a `{machine}` chip offering the hub and the fleet machines and an `{agent}` chip offering the agents' handles; filling them replaces the placeholders in the draft, which is then sent like any typed message

#### Scenario: Re-seed never overwrites

- **WHEN** the Operator edits the seeded "redeploy this hub" prompt, deletes "delete a junk card", adds a custom prompt, and presses Re-seed
- **THEN** the edited text stands (marked edited), the deleted category is back, the custom prompt stays, and the note says one prompt was added

### Requirement: Cached-prompt tools

The arch agent's tool catalogue SHALL include `cache_prompt(label, text, category?, hint?)`,
`list_cached_prompts(category?)` and `remove_cached_prompt(id)` over the same library, in the
catalogue's result shape and audited per call; the role prompt SHALL teach that the arch
caches or removes a prompt ONLY on the Operator's ask and writes placeholders for the parts
that change.

#### Scenario: The Operator asks the arch to cache a prompt

- **WHEN** the Operator writes "cache this prompt: … with {machine}"
- **THEN** `cache_prompt` stores it as a custom prompt under the named category and the panel shows it on its next poll; the same text asked twice answers `exists`
