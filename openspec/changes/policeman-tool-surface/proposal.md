# The policeman is offered ONLY its tools — same skeleton as the arch, smaller surface

## Why

The Operator (2026-09-16): "the policeman has as many tools as the arch agent conversation
— isn't that wrong? The skeleton should be the same (chat, tools, history, loops) but of
course it will have other tools than the arch agent. The arch is more powerful, the
policeman less powerful."

Right. PR #100 fenced the policeman only at CALL time: the MCP server answered
`tools/list` with the full arch catalogue for every conversation, so the policeman's model
was offered all 27 tools (send_task, dispatch_task, delete_task, start_loop, …) and learned
the boundary by being refused. And the Tools lane inside its subtab was the Arch tab's
lane verbatim — it ignored which conversation it was showing, so it listed the arch's full
catalogue under the policeman's name.

## What changes

Three fences instead of one, and the lane tells the truth:

1. **tools/list is per conversation.** `ArchMcpServer.ToolsList(conversation)` returns the
   observe-only subset (`ArchPoliceman.AllowedTools`, 13 tools) for `@arch:policeman` and the
   full catalogue for every other conversation. The `initialize` instructions say so too.
2. **The CLI fence knows the conversation.** `ArchAgentService.DisallowedToolsFor(key)`
   adds every withheld arch tool as `mcp__arch__<name>` to `--disallowedTools` for the
   policeman's turns (operator turns and loop-driven turns alike).
3. **The call-time refusal stays** (`policeman-observe-only`) as the last fence.
4. **The Tools lane shows the conversation's surface.** `GET /api/arch/tools?conv=` returns
   `policy` (`observe-only` | `full`), the tools that conversation is offered, the
   `withheldTools` and the `catalogueCount`; per-tool usage and the call total are that
   conversation's own. `ArchToolsPanel` takes `conv`, shows an "observe-only · 13 of 27 arch
   tools" pill, an intro written for the policeman, and a section "Arch tools withheld from
   the policeman" naming the 14 it does not have.

## Impact

- `ArchMcpServer`, `ArchAgentService`, `AutopilotService`, `ArchController` (tools lane).
- `ArchToolsPanel.jsx` (+ `conv` from `Arch.jsx`), `PolicemanPanel.jsx` wording, `archTools.css`.
- Tests: `ArchPolicemanTests` (+2); evidence `shot-kanban-policeman-conversation.mjs` (+3 checks, Tools-lane screenshot).
- Spec: `arch-agent`.
