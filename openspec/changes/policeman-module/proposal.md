# The policeman as a module: the code shaped like the idea

## Why

The Operator (2026-09-16), after trying to understand the policeman from a diagram: "reorganize
/ refactor / remodel the code so that it's easy to understand for a human. Make good classes,
encapsulations of complexity, separation of concerns, adhere to SOLID. Make the code more a
reflection of the idea — isn't that architecturally the right move anyway?"

It is. Until now the policeman lived as a 400-line partial of the arch service
(`ArchAgentService.Policeman.cs`) plus a bag of static rules (`ArchPoliceman.cs`), with the
fences spread over the MCP server and the arch service. Reading it meant reading the arch. The
idea, though, has three clean parts — a deterministic lifecycle, deterministic tools, and a
prompt the model follows — and the code should say so.

## What changes

A new module, `ClaudeWeb.App/Services/Policeman/`, one class per concern, each readable alone:

| class | concern | owner |
|---|---|---|
| `PolicemanIdentity` | who it is: the conversation key and name, the actor tag, the sentinel, the recipe name | constants |
| `PolicemanToolPolicy` | what it may touch: the ONE allowed-tools rule and the three fences derived from it (`Offered`, `CliDisallowed`, `IsAllowed` + `Refusal`) | pure |
| `PolicemanPrompt` | the pass as the model is asked to do it: six ordered `Step`s, `Compose(goal)`, the rollover `Handover`, the `VerdictSummary` | pure, prompt-driven |
| `PolicemanLifecycleRules` | the pure lifecycle rules: interval and cap bounds, `NeedsRollover`, `ReArmReason` | pure |
| `PolicemanLifecycle` | the deterministic lifecycle: Start / Stop / CheckNow / Settings / Rollover / Status, and the engine hooks (tick, after-turn, decorate-send, quiet floor) | service |
| `PolicemanTools` | what each tool does when the model calls it: board verdict, flag / clear, observe / clear, list PRs traced to cards, sync a card by the facts | service |

And two small interfaces on the arch side so the policeman depends on abstractions, not on the
arch service, and the arch knows nothing about the policeman:

- `IArchConversationHost` — what an add-on needs FROM the arch: home, session resolve / forget,
  send, default quiet floor, clock.
- `IArchConversationHook` — what the arch asks OF an add-on: `Owns`, `OnEngineTick`,
  `AfterTurn`, `DecorateSend`, `QuietFloorFor`. The arch iterates its hooks; it no longer
  calls anything policeman-named.
- `IAgentDirectory` — the slice of the fleet a tool needs: resolve an agent, its GitHub remote,
  a label, an audit row.

The arch service implements all three in one partial (`ArchAgentService.Hooks.cs`); the hooks
are injected lazily because an add-on depends on the arch and the arch on its add-ons. The MCP
server takes `PolicemanTools`; the controller takes `PolicemanLifecycle`; the engine ticks
`TickConversationHooks()`. `ArchAgentService.Policeman.cs` and `ArchPoliceman.cs` are deleted.

Behaviour is unchanged: every existing test passes with names moved, and four new tests pin the
rules the split made explicit (`ReArmReason`, the prompt's steps, the three fences from one
policy, `CardIsBehind`).

## Impact

- Backend only. No API, prompt text, tool or storage change.
- Adding a second standing conversation later means one new class implementing
  `IArchConversationHook`, registered as a hook — no edit to the arch service.
