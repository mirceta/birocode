# Tasks — arch-chat-tool-calls-history

- [x] `ArchTranscriptViews` (Services/Arch): `AttachToolCalls` (turn k → the first assistant message after the k-th user message; live step shape), `LimitRecent` (the most recent N with total + truncated), `DefaultHistoryLimit = 50`.
- [x] `GET /api/arch/messages`: assistant messages carry `toolCalls`; `GET /api/arch/tool-calls?limit=` (default 50, 0 = all) answers `total`, `truncated`, `limit`.
- [x] `Arch.jsx`: `ActivitySteps` above every assistant bubble that carries calls (`stepsFromToolCalls` in `turnSteps.js`); the live block unchanged.
- [x] `ArchHistoryPanel.jsx`: `limit` state (50 → +200 → all), the window bar with load more / load all / back to the last 50; every filter as before.
- [x] Tests: xunit `ArchChatToolCallsTests` ×3 (real readers over a crafted transcript; turn-0 and synthetic edge cases; the window); node `turnSteps.test.mjs` ×2; `shot-arch-chat-tool-calls.mjs` 10/10 (steps under finished turns incl. an error step; last 50 of 120, filters intact, load all → 120).
- [x] Management bundle rebuilt (the Arch page lives in it); branch + PR (no merge, no deploy).
- [ ] Not covered: a live arch turn observed end to end (the live path is untouched; the persisted path is what changed).
