## ADDED Requirements

### Requirement: The Operator-facing conversation takes no wake loop

The default arch conversation SHALL never receive repo wake-ups: the harness SHALL
compose no wake for it whatever happens on the managed repos, SHALL refuse to arm a
standing wake loop on it (the Arch page answers with the reason), SHALL never bring a
wake loop back on it when a driven loop there ends, and SHALL retire a wake loop or
standing-loop memory left on it by an older build on the next engine tick. Sibling
conversations keep their opt-in standing wake loop unchanged.

#### Scenario: A goal loop on the default conversation ends

- **WHEN** a goal loop armed on the default conversation finishes, is capped or is stopped
- **THEN** no wake loop is armed there, and repo agents' turns produce no turns in the Operator's chat

#### Scenario: A stale wake loop from an older build

- **WHEN** the harness starts with a wake-kind loop still active on the default conversation, or a standing-loop memory recorded for it
- **THEN** the first engine tick stops that loop and clears the memory, logging each once, and nothing re-arms it later

#### Scenario: Arming refused, siblings unaffected

- **WHEN** the operator arms a standing wake loop on the default conversation
- **THEN** the request is refused with the reason, while arming one on a sibling conversation works and that sibling is woken by managed repo turns as before
