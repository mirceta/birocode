## ADDED Requirements

### Requirement: A repo agent can start goal-driven goal conversations in its own checkout
A repo agent SHALL have `start_goal_conversation(goal, steps?, maxIterations?, name?, readOnly?)` that opens a goal conversation: a goal loop on key `<repoId>~sub~<id>` driving a separate CLI conversation in the same checkout, on the repo's engine and model, owned by the calling agent (its repo, tab and session). The goal conversation SHALL resume only its own session, mark its own step plan (`mark_step`, `edit_goal_plan`, owner-only), and on NEEDS_HUMAN be held until the parent's `message_goal_conversation` or the Operator's answer resumes it. When it ends, its summary SHALL be delivered once, persisted until then, as one turn tagged `goal conversation` in the parent's conversation. A goal conversation SHALL NOT start a goal conversation; at most 3 SHALL run per repo; a closed autopilot gate SHALL refuse a start.

#### Scenario: A 3-step goal conversation reports back
- **WHEN** the parent calls `start_goal_conversation` with a goal of three STEP lines
- **THEN** the goal conversation works when the parent is idle, its three steps turn done with evidence, it verifies, and a turn tagged goal conversation carrying the step plan arrives in the parent's conversation

### Requirement: One writer at a time in a checkout
While a writer goal conversation's turn runs, the parent's builder send (chat or arch send) SHALL be refused naming the goal conversation, the parent's own loops SHALL wait, and a writer goal conversation's send SHALL wait for the parent's builder slot and for sibling writers. A read-only helper SHALL run with a read-only CLI and MAY run alongside.

#### Scenario: The parent waits for its writer
- **WHEN** a writer goal conversation's turn is running and the Operator sends the parent a builder prompt
- **THEN** the send is refused with code subagent-busy and the goal conversation's name

### Requirement: Each repo agent has an explicit main conversation
The harness SHALL keep a pointer to each repo agent's main conversation and SHALL use it — never "the newest transcript in the folder" — wherever it needs the agent's conversation: the suggestion loop, a driven loop armed without a session, the arch's sends and transcript reads, and a goal conversation's summary. The pointer SHALL follow a builder run on the repo's own key that resumed the main session; with none, the agent's first conversation SHALL become main, and a missing pointer SHALL be seeded at startup from the agent's oldest dock tab; only the Operator's explicit "make main" SHALL otherwise move it — picking or viewing a conversation in any dock tab SHALL NOT. A goal conversation's conversation SHALL be refused as main everywhere. Runs of goal conversations, the ask lane and other conversations SHALL NOT move it. The conversation picker SHALL mark the main conversation and name goal conversation sessions.

#### Scenario: A goal conversation writes last in the shared folder
- **WHEN** a goal conversation's transcript is the newest file in the repo's transcript folder
- **THEN** the main-conversation pointer still names the parent's conversation, and every reader resolves to it

#### Scenario: Picking a conversation does not change main
- **WHEN** the main dock tab is pointed at a goal conversation's or a side conversation
- **THEN** the main-conversation pointer is unchanged, and "make main" on the goal conversation's conversation is refused

### Requirement: Concurrent writer goal conversations on the parent's assertion
`start_goal_conversation` SHALL accept `concurrent: true` for a writer whose files the parent asserts do not overlap its own; such a goal conversation SHALL run without waiting for the parent's builder slot and SHALL NOT block the parent's builder turns, and its prompt SHALL tell it to touch and commit only its own files. Without the flag the one-writer rule SHALL hold.

#### Scenario: The parent keeps working while a concurrent writer runs
- **WHEN** a concurrent writer goal conversation's turn is running and the Operator sends the parent a builder prompt
- **THEN** the send is accepted

### Requirement: Goal conversations are visible in the dock and across the fleet
Each repo agent's dock SHALL offer a Goal conversations lane (the Management Goal conversations panel with the repo agent as owner: selector with status circles, stepper, answer box, stop and continue, a running-count badge). The selected goal conversation SHALL show the same four lanes the arch's goal conversations have: Chat (its transcript and composer), Tools (the harness tools its turns get under its own identity, its permission scope, its call counts), History (every tool call of its own session — never the parent's) and Loops (its goal loop, the engine's last decision, what it waits for, stop / continue). Fleet Status rows and the peer describe SHALL carry the agent's goal conversation counts, and the hub SHALL read a repo agent's goal conversations (list, plan, last messages) locally or through the peer API.

#### Scenario: The hub sees a peer agent's goal conversations
- **WHEN** a peer's repo agent runs a goal conversation
- **THEN** its Status chip shows ⑂ with the running count and the Management Goal conversations tab lists it, readable on demand

#### Scenario: A goal conversation reads like an arch goal conversation
- **WHEN** the Operator selects a repo agent's goal conversation in the dock lane
- **THEN** Chat, Tools, History and Loops lanes are offered; Tools lists its harness tools with their call counts and its permission mode, History lists its own session's tool calls, and Loops shows its goal loop on `<repo>~goal~<id>`
