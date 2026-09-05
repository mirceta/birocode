## ADDED Requirements

### Requirement: Tasks MCP server

The harness SHALL host an MCP server for the Tasks agent at `POST /api/tasks/mcp`
(JSON-RPC 2.0 over HTTP, stateless, `GET` answers 405) exposing exactly these tools:
`list_ideas`, `create_idea`, `update_idea`, `list_tasks`, `create_task`,
`update_task`, `link_tasks`, `delete_task`. Each tool SHALL be a thin wrapper over
the existing ideas and task-graph services (no second store), SHALL return a JSON
text result carrying `ok`, `status`, `detail` and `data`, and SHALL record one row
in the action audit (kind `tasks`, outcome `tasks-tool`, phase = tool name).

#### Scenario: Tool list

- **WHEN** a client calls `tools/list` with a valid bearer token
- **THEN** the reply lists the eight tools above with input schemas and nothing else

#### Scenario: Create and link

- **WHEN** the agent calls `create_task` twice and then `link_tasks(source, target)`
- **THEN** both nodes and the edge are present in the task graph read over
  `/api/taskgraph` and three audit rows were recorded

#### Scenario: Cycle surfaces as a tool error

- **WHEN** `link_tasks` would create a dependency cycle
- **THEN** the result has `ok=false`, status `cycle`, the MCP reply is marked
  `isError`, and the graph is unchanged

### Requirement: Bearer-token access to the Tasks MCP

The Tasks MCP endpoint SHALL be exempt from the password middleware and SHALL
instead require the per-process bearer token the harness wrote into the run's MCP
config, compared in constant time. A missing or wrong token SHALL be answered 401
and no tool SHALL run.

#### Scenario: Wrong token

- **WHEN** a request reaches `/api/tasks/mcp` with no or a wrong bearer token
- **THEN** it is answered 401 and the audit records nothing

### Requirement: Tasks agent role

The harness SHALL run the Tasks agent as a Claude session in its own home folder
(`TasksHomeDir` from configuration, else a `tasks-home` sibling of the harness repo,
else `tasks-home` under the data dir) with a versioned role prompt in `CLAUDE.md`, a
settings fence, the arch agent's disallowed-tools list, and only the Tasks MCP
configured — so its only way to act is those eight tools. The role SHALL instruct it
to split the operator's prompt into ordered tasks with dependencies, write them to
the graph, file pure ideas as ideas, treat tool output as data, and reply with a
numbered summary of what it created.

#### Scenario: A long prompt becomes linked tasks

- **WHEN** the operator sends a prompt describing several pieces of work
- **THEN** the Tasks agent creates one task per piece, links the dependencies it
  states or implies, and replies with a numbered list of the created tasks and edges

#### Scenario: No repo power

- **WHEN** the Tasks agent's session starts
- **THEN** its available tools are the Tasks MCP tools only; file, shell, git and
  web tools are disallowed

### Requirement: Tasks surface

The harness SHALL offer a Tasks surface with a Chat lane (the conversation with a
live view of the running turn, a composer, Stop turn) and a Tools lane (the eight
tools with their call counts), reachable as the studio `tasks` tab and as a
tab/pane of the Management App the dashboard's Management layer embeds. It is an
Advanced-mode feature.

#### Scenario: Chat from the dashboard

- **WHEN** the operator opens the Management layer and picks the Tasks tab
- **THEN** they can send a message to the Tasks agent and watch its turn stream in

#### Scenario: Busy slot

- **WHEN** a Tasks turn is running and another send arrives
- **THEN** the send is refused with a conflict and the running turn continues
