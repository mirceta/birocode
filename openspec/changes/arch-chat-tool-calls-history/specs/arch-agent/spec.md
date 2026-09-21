## ADDED Requirements

### Requirement: The arch conversation keeps a finished turn's tool calls
The arch transcript endpoint SHALL carry, on the assistant message that answered each user
turn, that turn's tool calls in the live step shape (kind, name, status done or error, ok,
summary, input as detail, result as preview, start time, duration); calls made before the
first user message SHALL ride with the first assistant message; user messages SHALL never
carry calls. The conversation view SHALL render those steps above the assistant bubble with the
same component the live turn uses, so a turn looks the same after it finished as while it ran.

#### Scenario: A turn that called two tools, reloaded
- **WHEN** the arch answered "drive repo a to green" after calling `list_agents` and `send_task`, and the page reloads the transcript after the turn ended
- **THEN** the reply bubble shows the two tool steps above it, done, with their inputs and results, and no live block is needed

#### Scenario: A failed call stays visible as an error
- **WHEN** a turn's `Read` call was refused
- **THEN** the reply carries an error step named `Read` with the refusal as its result

### Requirement: The History lane loads the most recent calls by default
`GET /api/arch/tool-calls` SHALL accept `limit` — default 50, the most recent calls; `0` for
every call — and SHALL answer `total` and `truncated`. The History lane SHALL request the
default, SHALL say how many of the total it shows and that its filters search only those,
and SHALL offer "load more" (a larger window) and "load all" (everything, accepting the cost)
while keeping every existing filter — per-tool chips, errors only, search, newest/oldest,
expand/collapse all — exactly as before, applied to what is loaded.

#### Scenario: A conversation with 120 calls
- **WHEN** the Operator opens History
- **THEN** the lane requests the last 50, shows 50 cards, reads "showing the last 50 of 120 calls", and its filters are all present

#### Scenario: Load all
- **WHEN** the Operator clicks "load all 120"
- **THEN** the lane requests everything, shows 120 cards, and offers to go back to the last 50
