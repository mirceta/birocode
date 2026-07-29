# Tasks — fix-loop-prompt-render

## 1. Backend

- [x] 1.1 `AutopilotService.SendPrompt`: emit `{type:"user", text: prompt, actor:"loop"}`
      via `session.EmitAsync` after the slot claim, before `_cli.RunAsync`.

## 2. Frontend

- [x] 2.1 `ChatContext.makeEventHandler`: `case 'user'` — insert a user bubble
      above the trailing empty assistant bubble (or append one plus a fresh
      assistant bubble when absent).

## 3. Verify

- [x] 3.1 Build client + server; run isolated instance on a side port.
- [x] 3.2 Backend e2e: arm a goal loop on a scratch repo, then assert
      `GET /api/chat/stream?after=0` replays the `user` event before the reply.
      (`.claudeweb-preview/playwright/verify-loop-prompt-render.mjs`, :5227 —
      sleeper-stub claude.exe so any bubble can only come from the new event.)
- [x] 3.3 Playwright: with the conversation open and NO refresh, the loop
      prompt renders as a user bubble within one reconcile poll — exactly once.
- [x] 3.4 `openspec validate fix-loop-prompt-render --strict`; cleanup scratch
      repo, loop entry, isolated instance.
