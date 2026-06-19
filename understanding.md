# Understanding — System tests for the Chat feature

## What you asked for

Build **system tests for the Chat feature** of Claude Web. Find *all* the cases
worth testing, then actually **run all of them** as system tests — including the
ones that spend real tokens (real Claude CLI turns) — specifically to **flush
out bugs**. Coverage over cost; you've authorised the token spend.

## How I read "system test"

Black-box: drive the running Harness from the outside the way the frontend does
— real HTTP calls, real SSE streams, real on-disk session files — and assert on
observable behaviour. Broader than the single existing Playwright UI test
(`.preview-test/chat-windowing-check.mjs`), which mocks the network.

## Chat surface I'll test (already mapped)

- `POST /api/chat` (start/resume, SSE), `GET /api/chat/stream?after=N` (reattach),
  `POST /api/chat/stop`, `GET /api/runs`, `GET /api/sessions`,
  `GET /api/sessions/{id}/messages`.
- Lanes: `builder` (single-flight → 409 on collision) and `ask` (read-only,
  concurrent). SSE events: `session/token/thinking/tool/usage/done/error` with a
  monotonic per-repo `seq`. Auth = session cookie; `X-Repo-Id` scopes each call.

## What I'll do

1. Discover & enumerate every testable case (done — see
   [plans/chat-system-tests.md](plans/chat-system-tests.md)).
2. Write black-box `.mjs` system tests under `.preview-test/` driving HTTP/SSE,
   with a shared login + SSE-reader helper.
3. Run them against a **self-dev isolated build** (not live `:5099`, not the
   real repo store) pointed at a throwaway repo, using the cheapest model for
   token-spending cases.
4. Report a findings list — each confirmed bug with a one-line repro.

## Assumptions

- "Chat feature" = the conversational chat surface above, not the dashboard
  agent docks.
- This feature is **discovery**: I find bugs, I don't fix them here. Fixes become
  their own branches (one-feature-per-branch).
- I can run real CLI turns against an isolated build without touching the live
  password-protected store.

## Open question

- Isolated-build target: a freshly registered scratch repo vs. a disposable temp
  dir (leaning temp dir to keep the live store clean). Will confirm before
  spending tokens.
