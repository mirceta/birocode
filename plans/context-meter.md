# Context Meter — show current context usage next to the chat

> **Status (2026-06-10):** Implemented on `feature/context-meter` and
> browser-verified on the isolated :5200 instance
> (`.claudeweb-preview/playwright/verify-context-meter.mjs` plus the
> `verify-two-turns.mjs` / `verify-detached-runs.mjs` regressions). Not yet
> deployed to :5099.
>
> Includes a dock-sync follow-up fix (see below): on page load with a
> remembered active agent tab, ChatContext deleted the tab's conversation
> before the backend dock list arrived, silently breaking the chat input.

## Problem

The End User has no idea how full Claude's context is during a long
conversation. Auto-compaction handles overflow silently, but the user wants to
*see* the current usage.

Important constraint (user-specified): show the **raw token count in K**
(e.g. `ctx 132K`) — no percentage, no assumed context-window size. The window
varies by model (some have 1M), so dividing by a hardcoded size is wrong.

## Design

The Claude CLI's `stream-json` output already carries usage data: each
`assistant` message includes `message.usage` with `input_tokens`,
`cache_read_input_tokens`, and `cache_creation_input_tokens`. Their sum is
the size of the context that produced that message — i.e. the current fill.

### Backend

`CliRunnerService.HandleAssistant` reads `root.message.usage` (when present)
and emits a new stable SSE event:

```
{"type":"usage","contextTokens":132456}
```

Reuses the existing `ReadLong` helper. Emitted before the tool-summary logic
(usage exists even on messages without renderable content). The event flows
through the RunSession buffer like every other event, so reattaching clients
get the latest value too.

### Frontend

- `ChatContext.makeEventHandler`: new `case 'usage'` storing `contextTokens`
  per conversation key; reset to null on `startNewConversation`.
- Exposed via `useChat()` as `contextTokens`.
- `Chat.jsx`: pill in the `chat__bar` header next to `<ModelSelector>`,
  rendering `ctx {Math.round(t/1000)}K`; hidden until the first usage event.
- Gated by `useFeature('contextMeter')`; `contextMeter: 'advanced'` in
  `UiModeContext.jsx` (per the new-features-default-Advanced convention).

## Files touched

| File | Change |
|------|--------|
| `ClaudeWeb.App/Services/Chat/CliRunnerService.cs` | Emit `usage` event from assistant messages; doc-comment update. |
| `client/src/context/ChatContext.jsx` | Handle `usage` event; expose `contextTokens`. Also a dock-sync follow-up fix: gate conversation seeding and the tab-cleanup effect on `dockLoaded`, so a reload with a remembered active tab doesn't wipe its conversation (and its stored sessionId/transcript now actually load). |
| `client/src/pages/Chat.jsx` | Ctx pill in the header bar. |
| `client/src/context/UiModeContext.jsx` | `contextMeter: 'advanced'`. |
| `client/src/styles/*` | Pill styling (match existing bar styles). |

## Risks

- Resumed conversations show nothing until the first reply of the session —
  acceptable; the value would be stale anyway.
- Unknown/missing usage fields → simply don't emit; the pill stays hidden.

## Verification

Isolated :5200 instance (`docs/claude-web/self-dev.md`): Playwright test sends
a turn and asserts the ctx pill appears with a `\d+K` value. Plus existing
`verify-two-turns.mjs` / `verify-detached-runs.mjs` regression tests.
Live `client/dist` protected via the dist.deployed backup dance during test
builds. Deploy to :5099 only on explicit user OK (dead-man's-switch routine).
