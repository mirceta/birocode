# System tests for the Chat feature

> **Status:** Active — discovery + harness. On `feature/chat-system-tests`.
> Branch off `main` (synced with origin) 2026-06-19.

## Goal

Find **every** behaviour of the Chat feature that can be exercised against the
running Harness, then run **all** of those as black-box **system tests** —
hitting the real HTTP/SSE surface (and, where it matters, the real Claude CLI) —
to surface bugs. The user has explicitly authorised spending tokens on real
runs; the point is bug-finding coverage, not frugality.

"System test" here = drive the app from the outside (HTTP + SSE + on-disk
session files) the way the frontend does, asserting on observable behaviour.
This is broader than the one existing Playwright UI test
(`.preview-test/chat-windowing-check.mjs`, which mocks the network).

## Surface under test (discovered)

Backend (`ClaudeWeb.App/Controllers/ChatController.cs` + `Services/Chat/*`):

| Method | Route | Notes |
|--------|-------|-------|
| POST | `/api/chat` | start/resume a turn; body `{message, sessionId?, model?, lane?}`; returns SSE |
| GET  | `/api/chat/stream?after=N&lane=` | reattach; replay events after seq N then live |
| POST | `/api/chat/stop?lane=` | cancel the running CLI process tree |
| GET  | `/api/runs` | per-repo run snapshot `{repoId: {status, sessionId, lastSeq}}` |
| GET  | `/api/sessions` | list prior sessions for selected repo (JSONL on disk) |
| GET  | `/api/sessions/{id}/messages` | human-visible transcript for one session |

Cross-cutting: `X-Repo-Id` header scopes every call; auth is an HttpOnly cookie
(`POST /api/auth/login`). SSE event shapes: `session, token, thinking, tool,
usage, done, error`, each carrying a monotonic per-repo `seq`. Lanes: `builder`
(single-flight per repo) and `ask` (read-only `--permission-mode plan`, runs
concurrently with builder, slot key `repoId#ask`).

## Test scenarios to cover

Behavioural (no/low token cost — protocol & error paths):
1. **Auth gate** — chat endpoints reject calls without the session cookie.
2. **Validation** — empty `message`, missing repo selection → 4xx, not 500.
3. **409 single-flight** — second `builder` POST while one is live → 409.
4. **Ask concurrency** — `lane=ask` succeeds while a `builder` run is live; two
   independent seq streams / sessions.
5. **Stop** — `/api/chat/stop` returns 200, `/api/runs` flips to terminal,
   process tree dies (no further billing).
6. **Reattach** — disconnect mid-stream, `GET /api/chat/stream?after=N` replays
   from seq N with **no duplicates and no gaps**; seq strictly increasing.
7. **Runs snapshot** — `/api/runs` reflects running → done/error transitions.
8. **Sessions list/transcript** — after a real turn, the session appears in
   `/api/sessions`; `/api/sessions/{id}/messages` returns the user+assistant
   text; path-traversal `id` rejected.
9. **Bad inputs** — unknown `lane`, unknown `model`, malformed `sessionId`,
   resume of a non-existent session → graceful error event, not a hang/500.

Real-run (token-spending — end-to-end through the CLI):
10. **Basic turn** — short prompt → ordered `session → token… → usage? → done`.
11. **Resume** — second turn with returned `sessionId` appends to same JSONL.
12. **Tool lifecycle** — a prompt that forces a Read → `tool` start/input/end
    with summary/preview/ok.
13. **Model param** — `model=claude-haiku-4-5` (cheap) is honoured by the CLI
    and reflected in the run record.
14. **Ask read-only** — an `ask`-lane prompt asking to write a file does **not**
    mutate disk (permission-mode plan holds).

## Approach (decided)

- Black-box **Node `.mjs` scripts** under `.preview-test/` (the repo's existing
  test home), driving the Harness over HTTP/SSE — same transport the frontend
  uses. Reuse the Playwright dep already vendored there only where a real
  browser is needed; protocol tests use plain `fetch` + an SSE reader.
- Run against a **self-dev isolated build** (never the live `:5099` store) per
  `docs/claude-web/self-dev.md`, with a throwaway repo registered as the target
  so real CLI turns don't touch anything that matters.
- Cheapest model (`claude-haiku-4-5`) for token-spending cases; keep prompts
  tiny ("reply with the word OK").
- One script per scenario group; a small shared helper for login + SSE parsing.
- Collect failures into a findings list; each confirmed bug gets a one-line repro.

## Out of scope (for now)

- Fixing the bugs found — this feature is **discovery**. Fixes spin out into
  their own branches per the one-feature-per-branch rule.
- Frontend rendering correctness beyond what the existing windowing test covers.

## Open questions

- Isolated-build target repo: register a fresh scratch repo, or point at a
  disposable temp dir? (Leaning scratch temp dir to keep the live store clean.)
