# loop-recipes — delta

Renames the seed recipes to name the ritual they drive (the mislabeled
"goal-based loop" is now the recipe loop, so its templates must say what they
are) and migrates untouched planted seeds once. Modifies a requirement
introduced by `adopt-autopilot-loops` (still unarchived).

## MODIFIED Requirements

### Requirement: Named reusable loop recipes with seeded defaults

The system SHALL persist a server-side set of named loop recipes — each with an
id, display name, prompt text, sentinel phrase, and iteration cap — shared by
all devices. On first load the set SHALL be seeded with built-in recipes
codifying the feature-delivery ritual, named for what they drive, including at
least "Drive the OpenSpec change" (keep implementing the current OpenSpec
change until its tasks are done) and "Finish and ship the change" (verify,
update docs, commit, open a PR). Recipes SHALL be editable and deletable, and
seeding SHALL never overwrite or resurrect a user-edited or user-deleted
recipe. A planted seed whose name and prompt are still byte-identical to a
prior seed version SHALL be migrated once to the current seed text; any
user-edited or user-deleted seed SHALL be left untouched.

#### Scenario: First load seeds the ritual recipes

- **WHEN** the harness starts with no recipe store on disk
- **THEN** the recipe set contains the built-in "Drive the OpenSpec change" and "Finish and ship the change" recipes

#### Scenario: Untouched planted seeds get the honest names

- **WHEN** the harness starts with planted seeds still byte-identical to the previous seed text
- **THEN** those recipes carry the current seed names and prompts after load

#### Scenario: Edits survive restarts, reseeding, and migration

- **WHEN** the user edits a seeded recipe's prompt and the harness later restarts
- **THEN** the edited text is retained and neither reseeded nor migrated
