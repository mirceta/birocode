## ADDED Requirements

### Requirement: A repo agent can look up what a harness feature is and how to use it
The `claude-web` server SHALL offer `harness_help`. With no arguments it SHALL return the
index of harness topics; with `topic` it SHALL return that topic's text (a whole doc or one
`##` section); with `query` it SHALL return the best-matching topic or section for the
words asked. The knowledge SHALL be the convention docs of the harness's own checkout
(`docs/*.md` of the repo registered as self), read on each call, with the same files as
embedded in the build used only when that checkout is not on disk; the answer SHALL name
which source it read and the file. The index SHALL be derived from the docs' file names and
headings — adding a doc adds a topic — and every answer SHALL be prefixed with what the topic
means for the calling repo (its name, path and Local-tab URLs).

#### Scenario: How do I update the Understanding app
- **WHEN** a repo agent on repo `prg` calls `harness_help` with query "how do I update the understanding app"
- **THEN** the answer is the Understanding-app convention (its four-line contract) read from the harness's `docs/understanding-app-convention.md`, prefixed with `prg`'s own path for `understanding-app/index.html` and its Local-tab URL

#### Scenario: A new doc is a new topic
- **WHEN** `docs/new-feature.md` is added to the harness checkout
- **THEN** the next `harness_help` index lists `new-feature` with its first heading, without any code change

#### Scenario: The checkout is not on disk
- **WHEN** the harness runs where its self repo is not registered
- **THEN** `harness_help` answers from the embedded copy and says `source: embedded`

### Requirement: A repo agent can add a prompt to its own stash
The server SHALL offer `stash_prompt(text, first?)`: it SHALL append the text to the stash
of the agent's own dock tab — the tab whose session is the repo's running session, else the
repo's dashboard tab, else its newest tab — through the same store the dock and the queue
loop use, cap the text as the dock does, put it at the head when `first` is true, and return
the queue as it stands. With no dock tab for the repo it SHALL refuse and say so.

#### Scenario: Splitting one instruction into a queue
- **WHEN** an agent calls `stash_prompt` three times with three task texts
- **THEN** the dock's stash shows the three prompts in that order and the result of the third call lists all three

### Requirement: A repo agent can arm, update, stop and read its own loop
The server SHALL offer `arm_my_loop(action?, kind?, mode?, goal?, prompt?, sentinel?,
maxIterations?, recipe?, verifyEnabled?, includeFooterClauses?)` with `action` start
(default) · update · stop · status, taking the Loop panel's parameters and no others. It
SHALL arm through the same path the arch's `start_loop` uses (one shared armer), pinned to
the agent's own session, armed by `agent`, audited; the queue kind SHALL drain the agent's
own tab and refuse an empty stash; a closed autopilot gate SHALL refuse every action but
`status` with nothing changed; invalid parameters SHALL be named back with nothing changed.

#### Scenario: Arm a goal loop on itself
- **WHEN** an agent calls `arm_my_loop` with goal "all queue items done" and maxIterations 5 while the gate is open
- **THEN** a goal loop is armed on its repo in drive mode, cap 5, armed by `agent`, and the Loop panel shows it so

#### Scenario: Gate closed
- **WHEN** the Operator's autopilot gate is closed and an agent calls `arm_my_loop` start
- **THEN** the call returns `not-accepting` and no loop changes

#### Scenario: Queue loop over its own stash
- **WHEN** an agent stashed prompts and calls `arm_my_loop` with kind queue
- **THEN** the queue loop is armed on the agent's own tab's stash
