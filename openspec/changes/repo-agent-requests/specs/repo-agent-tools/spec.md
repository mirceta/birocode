## ADDED Requirements

### Requirement: A repo agent can send a request up to its arch without waking it
The `claude-web` server SHALL offer `request_arch(text, title?)`. It SHALL record the request —
the agent's handle, its machine, its repo, when, the title and the text, status `pending` — on
the agent's own harness so that it survives a restart, audit the call, and answer with the row
and the statement that the arch is not woken. It SHALL NOT start an arch turn, post a message,
or contact another machine. It SHALL refuse empty text and text over 4000 characters, refuse a
21st pending request from the same agent (`too-many`), and answer an identical pending text from
the same agent with the existing row (`duplicate`). The Tools lane SHALL list the tool with the
rest of the catalogue.

#### Scenario: A request is recorded, nothing else
- **WHEN** agent prg#1 on spacex calls `request_arch` with "Please have web#1 upload prod.bak to the hub"
- **THEN** a pending row with agent prg#1, machine spacex and that text exists on spacex's store, the answer says the arch is not woken, and the arch's run slot is untouched

#### Scenario: The same request twice
- **WHEN** the agent calls `request_arch` again with the identical text while the first is pending
- **THEN** the answer is `duplicate` with the first row and no second row exists
