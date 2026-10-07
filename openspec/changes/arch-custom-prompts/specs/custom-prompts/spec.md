## ADDED Requirements

### Requirement: The prompt library carries an owner

The prompt library (`prompts.json`, `/api/prompts`) SHALL support an optional `owner` per
prompt: prompts without an owner are the repo agents' composer presets exactly as before;
`owner=arch` prompts are the Arch agent's cached prompts. Listing SHALL filter by owner
(no owner = the repo agents' library), so the composer modal, the suggestion loop's routines
and discovery never see arch prompts. Prompts MAY carry a `category`, a `hint`, a `seedId`
and an `edited` flag; the API SHALL offer reorder within an owner, duplicate, and seeding an
owner from a seed set that adds only the seed ids not yet present.

#### Scenario: Old files and old callers

- **WHEN** a `prompts.json` written before this change is loaded and the composer lists prompts
- **THEN** every prompt is a repo-agent prompt and the list is what it was

#### Scenario: Seeding is additive

- **WHEN** an owner's library already holds a seed id (edited or not) and the seed set is applied again
- **THEN** that prompt is unchanged and only absent seed ids are added
