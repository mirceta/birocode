## ADDED Requirements

### Requirement: Each registered repo holds exactly one draft per draft type

The harness SHALL persist, for every repo registered in the repo selector, at most
one loop draft per draft type, with exactly three draft types: **queue-plan** (a
sequence of self-contained prompts destined for the queued-prompts loop, separated
by a `---` line), **goal** (a single coherent goal definition for a goal-based
loop), and **freestyle** (unstructured working text not yet ready to become either).
A draft SHALL be plain text in v1, and each (repo, type) draft SHALL carry a
last-edited timestamp updated on every save.

#### Scenario: One draft per repo and type

- **WHEN** a draft is saved for repo R and type queue-plan, and a second save for the same (R, queue-plan) follows
- **THEN** the second save replaces the first draft's content — no second draft is created — and the last-edited stamp updates

#### Scenario: Types are independent

- **WHEN** repo R's freestyle draft is saved
- **THEN** R's queue-plan and goal drafts are unchanged, each keeping its own content and stamp

### Requirement: Drafts are readable and writable over a repo-validated HTTP API

The harness SHALL expose the drafts over HTTP: a read endpoint and a write
endpoint addressed by repo id and draft type
(`GET/PUT /api/autopilot/drafts/<repoId>/<type>`), plus a list endpoint
(`GET /api/autopilot/drafts`) reporting, for every registered repo, which types
have non-empty content and their last-edited stamps. The API SHALL reject an
unknown repo id or draft type with a client error, SHALL require session
authentication like the rest of `/api`, and SHALL NOT be fenced by the operator
autopilot gate — drafting is idea capture with no send path. This API is the
**only** write path: agents edit drafts via HTTP, never via files on disk.

#### Scenario: Agent round-trip

- **WHEN** an authenticated caller PUTs text for a valid (repoId, type) and then GETs the same address
- **THEN** the GET returns exactly the saved text plus its last-edited stamp

#### Scenario: Unknown repo or type rejected

- **WHEN** a caller PUTs to a repo id not in the registered-repo store, or to a type other than queue-plan / goal / freestyle
- **THEN** the API responds with a client error and stores nothing

#### Scenario: Gate off, drafts still writable

- **WHEN** the operator autopilot gate is off and an authenticated caller PUTs a draft
- **THEN** the save succeeds — the gate does not fence draft storage

### Requirement: The Drafts tab edits any (repo, type) draft with explicit save

The Autopilot console's Drafts root tab SHALL list every registered repo as a
subtab and, within a repo, offer a three-way type switcher (queue-plan / goal /
freestyle). Each type SHALL render its draft in a large plain textarea with
explicit **Save** and **Reload** actions — no autosave — showing the draft's
last-edited stamp, and the type switcher SHALL badge which types currently have
non-empty content. The tab SHALL register as `advanced` in the UI-mode capability
map.

#### Scenario: Edit and save a draft

- **WHEN** the user opens Drafts → repo R → goal, types text, and clicks Save
- **THEN** the draft persists via the drafts API and the last-edited stamp refreshes

#### Scenario: Reload fetches an agent's edit

- **WHEN** an agent updates repo R's queue-plan draft via the API while the user has the same draft open
- **THEN** clicking Reload replaces the textarea content with the agent's saved text without saving the user's unsaved edits first

#### Scenario: Non-empty badges

- **WHEN** repo R has content in freestyle only
- **THEN** the type switcher marks freestyle as non-empty and the other two types as empty

### Requirement: An agent-agnostic convention doc defines the drafting contract

The repo SHALL carry `docs/loop-drafts-convention.md` as the single source of
truth any agent on the box can read off disk: what each of the three draft types
means and the content shape it expects (queue-plan: one self-contained prompt per
`---`-separated block; goal: one coherent goal statement; freestyle: anything),
and the exact HTTP calls — login for a session cookie, then GET/PUT by repo id
and type — to read and edit a draft. Changes to the contract SHALL be made in
this doc, not by re-describing it elsewhere.

#### Scenario: Doc suffices for an outside agent

- **WHEN** an agent that has never seen this repo is given only the convention doc plus a base URL, access code, repo id, and type
- **THEN** the doc's instructions are sufficient for it to authenticate, read the current draft, and save an edited draft

### Requirement: The homepage exposes a paste-ready "Fill the loop" prompt

The homepage app on :5305 SHALL carry a "Fill the loop" topic, built like the
existing topics (build-less, self-contained, relative URLs), that generates a
copy-pastable prompt from operator-filled fields — at minimum the target repo,
the draft type, and what the draft should contain — with copy disabled until the
required fields are filled. The generated prompt SHALL point the pasted agent at
`docs/loop-drafts-convention.md` for the how, and SHALL state the type-specific
content expectation (queue-plan: a sequence of self-contained prompts; goal: one
goal definition; freestyle: free text).

#### Scenario: Generated prompt is paste-ready

- **WHEN** the operator fills the repo, type, and content fields on the topic
- **THEN** the preview shows a prompt with no unfilled placeholders and the copy action becomes available

#### Scenario: Prompt points at the convention

- **WHEN** the operator selects the queue-plan type
- **THEN** the generated prompt references the convention doc and instructs the agent to write `---`-separated self-contained prompts
