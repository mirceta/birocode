# prompts — delta for update-close-feature-prompt

## MODIFIED Requirements

### Requirement: System-specific built-ins follow the toggle

The system SHALL offer the system-specific built-in prompts (kick off a feature, write
understanding first, close a finished feature, evaluate the options) in both OpenSpec
and legacy wording, and SHALL insert the variant matching the repository's selected
planning system. System-agnostic built-ins SHALL read identically under both options.

The OpenSpec variant of the **close a finished feature** built-in SHALL target a
PR-based close-out, in this order: commit any remaining work in logical commits with
explicit paths (never `git add -A`); tick the remaining items in the change's
`tasks.md`, run `openspec validate <change> --strict`, run `openspec archive <change>`,
and commit the archive; explicitly instruct NOT to merge to main, but instead to fetch
and merge `origin/main` into the feature branch, resolve conflicts, and verify the
build still works; create a pull request for the branch (or update an existing PR and
comment that it is ready for review); and finally check the working copy back out to
`main` locally, leaving the PR merge to the user.

#### Scenario: OpenSpec selected

- **WHEN** the planning system is OpenSpec and the operator uses a system-specific built-in
- **THEN** the inserted text targets the OpenSpec flow (e.g. start/validate/archive an OpenSpec change, write to `proposal.md` / `design.md`)

#### Scenario: Old system selected

- **WHEN** the planning system is Old system and the operator uses a system-specific built-in
- **THEN** the inserted text targets the legacy flow (e.g. a `plan.md` entry, `understanding.md`, the old close-out ritual)

#### Scenario: System-agnostic built-ins unchanged

- **WHEN** the operator switches between OpenSpec and Old system
- **THEN** the system-agnostic built-ins (doc-simplify, wall-of-text, understanding-app) read identically under both

#### Scenario: Close built-in ends in a PR, not a main merge

- **WHEN** the planning system is OpenSpec and the operator uses the close-a-finished-feature built-in
- **THEN** the inserted text instructs committing leftovers, archiving the change, merging `origin/main` into the branch, opening or updating a pull request, and returning the working copy to `main` — and contains no instruction to merge the branch into main
